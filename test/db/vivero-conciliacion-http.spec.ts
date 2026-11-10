import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureGlobalRoutes } from '../../src/app.routes';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { InternalActorGuard } from '../../src/auth/internal-actor.guard';
import { EvidenceFileService } from '../../src/common/files/evidence-file.service';
import { LotesViveroController } from '../../src/lotes-vivero/api/lotes-vivero.controller';
import { ViveroAccesosController } from '../../src/lotes-vivero/api/vivero-accesos.controller';
import { ViveroConciliacionController } from '../../src/lotes-vivero/api/vivero-conciliacion.controller';
import { LotesViveroService } from '../../src/lotes-vivero/application/lotes-vivero.service';
import { ViveroAccesosService } from '../../src/lotes-vivero/application/vivero-accesos.service';
import { ViveroAuthService } from '../../src/lotes-vivero/application/vivero-auth.service';
import { ViveroConciliacionService } from '../../src/lotes-vivero/application/vivero-conciliacion.service';
import { ViveroInicioService } from '../../src/lotes-vivero/application/vivero-inicio.service';
import { SupabaseService } from '../../src/supabase/supabase.service';

const run = promisify(execFile);
const sqlString = (v: string) => "'" + v.replace(/'/g, "''") + "'";
const literal = (v: unknown): string => {
  if (v == null) return 'NULL';
  if (typeof v === 'boolean') return String(v);
  return sqlString(typeof v === 'object' ? JSON.stringify(v) : String(v));
};

async function sql(query: string) {
  const socket = process.env.T4_DB_SOCKET || '';
  if (!/^\/(private\/)?tmp\/t4-recepcion-[^/]+\/socket$/.test(socket))
    throw new Error('Solo clúster aislado de recepción y conciliación.');
  const { stdout } = await run(
    process.env.T4_DB_PSQL!,
    [
      '-X',
      '-w',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket,
      '-p',
      process.env.T4_DB_PORT!,
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      query,
    ],
    {
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('PG')),
      ),
    },
  );
  return stdout.trim();
}

let perderRespuesta = false;
const client = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (
      !/^(m2_conciliacion_[a-z_]+|m2_origenes_leer|pa_actor_verificar|m2_inicio_lote_exacto)$/.test(
        name,
      )
    )
      throw new Error('RPC ajena al fixture.');
    const statement = `SELECT public.${name}(${Object.entries(args)
      .map(([k, v]) =>
        k === 'p_evidencia_ids' && Array.isArray(v)
          ? `${k}=>ARRAY[${v.map(literal).join(',')}]::bigint[]`
          : k + '=>' + literal(v),
      )
      .join(',')})`;
    const result = JSON.parse(
      await sql(
        `SET ROLE service_role; SELECT public.t4_http_transport(${sqlString(statement)})`,
      ),
    );
    if (perderRespuesta && name === 'm2_conciliacion_ejecutar') {
      perderRespuesta = false;
      return { data: null, error: { code: 'RED_SIMULADA' } };
    }
    return result;
  },
  storage: {
    from: (bucket: string) => {
      expect(bucket).toBe('r3foresta-conciliacion');
      return {
        upload: async (path: string) => {
          expect(path).toMatch(/^conciliacion\/pendientes\/20\/(219|220)\//);
          return { data: { id: randomUUID() }, error: null };
        },
        remove: async () => ({ error: null }),
      };
    },
  },
};
const secret = 'solo-fixture-conciliacion-no-productivo';
const jwt = new JwtService({ secret });
const admin = 'fixture-admin';
const operario = 'fixture-t2-operario';
const auth = (sub = operario) => ({
  Authorization: 'Bearer ' + jwt.sign({ sub }, { expiresIn: '1h' }),
});
const base = '/api/v1/vivero/conciliaciones';
const origenes = '/api/v1/vivero/origenes';
let app: INestApplication;
let hoy: string;
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  const m = await Test.createTestingModule({
    controllers: [
      ViveroConciliacionController,
      ViveroAccesosController,
      LotesViveroController,
    ],
    providers: [
      VerifiedActorGuard,
      InternalActorGuard,
      ViveroConciliacionService,
      ViveroAccesosService,
      EvidenceFileService,
      ViveroInicioService,
      {
        provide: LotesViveroService,
        inject: [ViveroInicioService],
        useFactory: (inicio: ViveroInicioService) => ({
          crearDesdeRecoleccion: inicio.crearDesdeRecoleccion.bind(inicio),
        }),
      },
      {
        provide: ViveroAuthService,
        useValue: {
          getUserByAuthId: async (sub: string) => {
            expect(sub).toBe(operario);
            return { id: '20', rol: 'GENERAL' };
          },
          assertVivero: async () => undefined,
        },
      },
      { provide: SupabaseService, useValue: { getAdminClient: () => client } },
      { provide: JwtService, useValue: jwt },
      { provide: ConfigService, useValue: { get: () => secret } },
    ],
  }).compile();
  app = m.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  configureGlobalRoutes(app);
  await app.init();
  hoy = await sql(
    "SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date",
  );
});
afterAll(async () => {
  await app?.close();
});

const altaPadron = () => ({
  comando_id: randomUUID(),
  accion: 'INCLUIR',
  revision_esperada: '0',
  motivo: 'Cotejo histórico sintético.',
});
async function ficha(id: string) {
  const r = await api().get(`${base}/${id}`).set(auth()).expect(200);
  return r.body;
}
async function comprobacion(id: string, cantidad: string) {
  const f = await ficha(id);
  const fotos = await api()
    .post(`${base}/${id}/evidencias`)
    .set(auth())
    .attach('fotos', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), {
      filename: 'conteo.jpg',
      contentType: 'image/jpeg',
    })
    .expect(201);
  expect(fotos.body.audiencia).toBe('PRIVADA');
  return {
    comando_id: randomUUID(),
    revision_esperada: f.revision,
    revision_captura_esperada: f.revision_captura,
    marca_movimientos: f.marca_movimientos,
    saldo_esperado: f.saldo_actual,
    cantidad_observada: cantidad,
    unidad_observada: 'G',
    fecha_comprobacion: hoy,
    evidencia_ids: fotos.body.evidencia_ids,
  };
}

test('identidad verificada, padrón ADMIN, custodia y proyección opt-in', async () => {
  await api()
    .get(base)
    .set('x-auth-id', admin)
    .set('x-user-role', 'ADMIN')
    .expect(401);
  await api().get(base).set(auth()).set('x-user-role', 'ADMIN').expect(403);
  const r = await api()
    .get(base)
    .set(auth(admin))
    .query({ vivero_id: '1', limite: '50' })
    .expect(200);
  expect(r.headers['cache-control']).toBe('private, no-store');
  expect(r.body.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        recoleccion_id: '219',
        estado: 'FUERA_PADRON',
        trazabilidad_conforme: true,
      }),
    ]),
  );
  expect(
    r.body.data.every((f: { vivero_id: string }) => f.vivero_id === '1'),
  ).toBe(true);
  const fuera = await api()
    .get(base + '/225')
    .set(auth());
  expect([403, 404]).toContain(fuera.status);
  const antes = await api()
    .get(origenes)
    .set(auth())
    .query({
      vivero_id: '1',
      recoleccion_id: '219',
      incluir_pendientes: 'true',
    })
    .expect(200);
  expect(antes.body.data).toEqual([
    expect.objectContaining({
      recoleccion_id: '219',
      estado_habilitacion: 'PENDIENTE_CONCILIACION',
      puede_consultar_conciliacion: false,
    }),
  ]);
  if (process.env.T4_DB_REVISION_CONCILIACION === '1') {
    await api()
      .get(origenes)
      .set(auth())
      .query({ vivero_id: '1', incluir_requisitos_inicio: 'true' })
      .expect(422);
    const inicio = await api()
      .get(origenes)
      .set(auth())
      .query({
        vivero_id: '1',
        recoleccion_id: '219',
        incluir_pendientes: 'true',
        incluir_requisitos_inicio: 'true',
      })
      .expect(200);
    expect(inicio.body.data).toEqual([
      {
        ...antes.body.data[0],
        saldo_actual_exacto: '90',
        motivo_no_inicio: 'Pendiente de conciliar el remanente histórico.',
      },
    ]);
  }
  await api()
    .get(origenes)
    .set(auth())
    .query({ vivero_id: '1', incluir_pendientes: '1' })
    .expect(422);
  await api()
    .post(base + '/219/padron')
    .set(auth())
    .send(altaPadron())
    .expect(403);
});

test('confirma el saldo con movimientos, recupera respuesta perdida y hace un solo débito por INICIO', async () => {
  const id = '219';
  await api()
    .post(`${base}/${id}/padron`)
    .set(auth(admin))
    .send(altaPadron())
    .expect(200);
  const f = await ficha(id);
  expect(f).toMatchObject({
    recoleccion_id: id,
    saldo_actual: expect.any(String),
    trazabilidad_conforme: true,
    en_padron: true,
    puede_conciliar: true,
  });
  expect(Number(f.cantidad_inicial)).toBe(100);
  expect(Number(f.saldo_actual)).toBe(90);
  expect(Number(f.saldo_calculado)).toBe(90);
  expect(f.movimientos).toHaveLength(1);
  const payload = await comprobacion(id, '90');
  await api()
    .post(`${base}/${id}/confirmaciones`)
    .set(auth())
    .send({ ...payload, actor_id: '1' })
    .expect(422);
  perderRespuesta = true;
  await api()
    .post(`${base}/${id}/confirmaciones`)
    .set(auth())
    .send(payload)
    .expect(503);
  const recibo = await api()
    .get(`${base}/comandos/${payload.comando_id}`)
    .set(auth())
    .expect(200);
  expect(recibo.body).toMatchObject({
    estado: 'CONFIRMADO',
    resultado: { recoleccion_id: id, actor_id: '20', estado: 'CONFORME' },
  });
  const replay = await api()
    .post(`${base}/${id}/confirmaciones`)
    .set(auth())
    .send(payload)
    .expect(200);
  expect(replay.body).toEqual(recibo.body);
  await api()
    .post(`${base}/${id}/confirmaciones`)
    .set(auth())
    .send({ ...payload, cantidad_observada: '89' })
    .expect(409);
  await api()
    .get(`${base}/comandos/${payload.comando_id}`)
    .set(auth(admin))
    .expect(202);

  const origen = await api()
    .get(origenes)
    .set(auth())
    .query({
      vivero_id: '1',
      recoleccion_id: id,
      incluir_pendientes: 'true',
    })
    .expect(200);
  expect(origen.body.data).toEqual([
    expect.objectContaining({
      recoleccion_id: id,
      estado_habilitacion: 'CONCILIACION_CONFORME',
      puede_consultar_conciliacion: true,
    }),
  ]);

  const foto = JSON.parse(
    await sql(`
    SET ROLE service_role; SELECT public.m2_evidencias_preparar(
      20, 1, NULL, 'INICIO',
      ${sqlString(JSON.stringify([{ ruta_archivo: `vivero/eventos/pendientes/20/${randomUUID()}.jpg`, mime_type: 'image/jpeg', tamano_bytes: 10 }]))}
    )
  `),
  );
  const lote = await api()
    .post('/api/lotes-vivero')
    .set(auth())
    .send({
      recoleccion_id: id,
      vivero_id: '1',
      fecha_inicio: hoy,
      fecha_evento: hoy,
      cantidad_inicial_en_proceso: '0.000001',
      unidad_medida_inicial: 'G',
      evidencia_ids: foto.map(String),
    })
    .expect(201);
  expect(lote.body.data).toMatchObject({
    saldo_recoleccion_antes: 90,
    saldo_recoleccion_despues: 89.999999,
  });
  expect(
    await sql(
      `SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=${id}`,
    ),
  ).toBe('2');
  expect(
    await sql(
      `SELECT trim_scale(delta) FROM public.recoleccion_movimiento
       WHERE id=${lote.body.data.recoleccion_movimiento_id as string}`,
    ),
  ).toBe('-0.000001');
  expect(
    await sql(
      `SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id=${id}`,
    ),
  ).toBe('0');
});

test('una diferencia conserva saldo y muestra incidencia sin habilitar el origen', async () => {
  const id = '220';
  await api()
    .post(`${base}/${id}/padron`)
    .set(auth(admin))
    .send(altaPadron())
    .expect(200);
  const payload = await comprobacion(id, '99');
  const r = await api()
    .post(`${base}/${id}/confirmaciones`)
    .set(auth())
    .send(payload)
    .expect(200);
  expect(r.body).toMatchObject({
    estado: 'INCIDENCIA',
    resultado: { estado: 'INCIDENCIA' },
  });
  const proyeccion = await api()
    .get(origenes)
    .set(auth())
    .query({ vivero_id: '1', recoleccion_id: id, incluir_pendientes: 'true' })
    .expect(200);
  expect(proyeccion.body.data[0]).toMatchObject({
    estado_habilitacion: 'INCIDENCIA_CONCILIACION',
  });
  await api()
    .get(origenes)
    .set(auth())
    .query({ vivero_id: '1', recoleccion_id: id })
    .expect(404);
  expect(
    await sql(`SELECT saldo_actual=100 FROM public.recoleccion WHERE id=${id}`),
  ).toBe('t');
});
