import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { EvidenceFileService } from '../../src/common/files/evidence-file.service';
import { RecoleccionRecepcionService } from '../../src/recolecciones/application/recoleccion-recepcion.service';
import { RecoleccionRecepcionController } from '../../src/recolecciones/api/recoleccion-recepcion.controller';
import { configureGlobalRoutes } from '../../src/app.routes';

const run = promisify(execFile);
const lit = (v: unknown): string =>
  v === null || v === undefined
    ? 'NULL'
    : "'" +
      (typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(
        /'/g,
        "''",
      ) +
      "'";
async function sql(s: string) {
  if (
    !/^\/(private\/)?tmp\/t4-recepcion-[^/]+\/socket$/.test(
      process.env.T4_DB_SOCKET || '',
    )
  )
    throw new Error('Solo clúster privado T4');
  const { stdout } = await run(
    process.env.T4_DB_PSQL!,
    [
      '-X',
      '-w',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      process.env.T4_DB_SOCKET!,
      '-p',
      process.env.T4_DB_PORT!,
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      s,
    ],
    {
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('PG')),
      ),
    },
  );
  return stdout.trim();
}
let uncertain = false;
const uploads: string[] = [];
const client = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (!/^(m1_recepcion_[a-z_]+|pa_actor_verificar)$/.test(name))
      throw new Error('RPC ajena');
    const s = `SELECT public.${name}(${Object.entries(args)
      .map(([k, v]) => k + '=>' + lit(v))
      .join(',')})`;
    const result = JSON.parse(
      await sql(
        `SET ROLE service_role; SELECT public.t4_http_transport(${lit(s)})`,
      ),
    );
    if (uncertain && name === 'm1_recepcion_ejecutar') {
      uncertain = false;
      return { data: null, error: { code: 'RED_SIMULADA' } };
    }
    return result;
  },
  storage: {
    from: () => ({
      upload: async (path: string) => {
        uploads.push(path);
        return { data: { id: randomUUID() }, error: null };
      },
      remove: async () => ({ error: null }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: 'https://storage.invalid/' + path },
      }),
    }),
  },
};
const jwt = new JwtService({ secret: 'solo-fixture-t4-no-productivo' });
const tokens = (user: string) => jwt.sign({ sub: user }, { expiresIn: '1h' });
const auth = (user = 'fixture-t2-operario') => ({
  Authorization: 'Bearer ' + tokens(user),
});
let app: INestApplication;
const base = '/api/v1/recepcion-semillas';
let day: string;
async function body(
  rec: string,
  actor = 'fixture-t2-operario',
  cantidad = 100,
) {
  const foto = await request(app.getHttpServer())
    .post(`${base}/${rec}/evidencias`)
    .set(auth(actor))
    .attach('fotos', Buffer.from('fixture-imagen-sintetica'), {
      filename: 'foto.jpg',
      contentType: 'image/jpeg',
    })
    .expect(201);
  const d = await request(app.getHttpServer())
    .get(`${base}/${rec}`)
    .set(auth(actor))
    .expect(200);
  return {
    comando_id: randomUUID(),
    revision_esperada: d.body.revision,
    cantidad_recibida: cantidad,
    unidad_recibida: 'G',
    fecha_recepcion: day,
    evidencia_ids: foto.body.evidencia_ids,
  };
}
beforeAll(async () => {
  const m = await Test.createTestingModule({
    controllers: [RecoleccionRecepcionController],
    providers: [
      RecoleccionRecepcionService,
      EvidenceFileService,
      VerifiedActorGuard,
      {
        provide: SupabaseService,
        useValue: {
          getAdminClient: () => client,
          getClient: () => {
            throw new Error('Sin fallback público');
          },
        },
      },
      { provide: JwtService, useValue: jwt },
      {
        provide: ConfigService,
        useValue: {
          get: (k: string) =>
            k === 'JWT_SECRET' ? 'solo-fixture-t4-no-productivo' : undefined,
        },
      },
    ],
  }).compile();
  app = m.createNestApplication();
  configureGlobalRoutes(app);
  await app.init();
  day = await sql(
    "SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date",
  );
});
afterAll(async () => {
  await app?.close();
});

test('JWT real y cuenta activa; headers no conceden identidad/rol', async () => {
  await request(app.getHttpServer())
    .get(base)
    .set('x-auth-id', 'fixture-admin')
    .set('x-user-role', 'ADMIN')
    .expect(401);
  await request(app.getHttpServer())
    .get(base)
    .set(auth())
    .set('x-auth-id', 'fixture-admin')
    .expect(401);
  await request(app.getHttpServer())
    .get(base)
    .set(auth('fixture-inactivo'))
    .expect(403);
  await request(app.getHttpServer())
    .get(base)
    .set(auth('fixture-voluntario'))
    .expect(403);
});
test('solo M2 accede cola/detalle/fotos; solo M1/otro vivero no accede por URL directa', async () => {
  const q = await request(app.getHttpServer())
    .get(base)
    .set(auth())
    .expect(200);
  expect(q.headers['cache-control']).toContain('no-store');
  expect(q.body.data.length).toBeGreaterThan(0);
  const d = await request(app.getHttpServer())
    .get(`${base}/136`)
    .set(auth())
    .expect(200);
  expect(d.body.puede_recibir_validar).toBe(true);
  expect(d.body.evidencias[0].public_url).toContain('storage.invalid');
  expect(JSON.stringify(d.body)).not.toContain('correo');
  for (const actor of [
    'fixture-t2-m1',
    'fixture-t2-sin-vivero',
    'fixture-t2-big2',
  ]) {
    const denied = await request(app.getHttpServer())
      .get(`${base}/136`)
      .set(auth(actor))
      .expect(403);
    expect(denied.body.error.codigo).toBe('CAPACIDAD_INSUFICIENTE');
    await request(app.getHttpServer())
      .post(`${base}/136/evidencias`)
      .set(auth(actor))
      .attach('fotos', Buffer.from('fixture'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      })
      .expect(403);
  }
});
test('multipart contextual y recibir/validar con replay sin otra carga ni anclaje externo', async () => {
  const b = await body('136');
  const n = uploads.length;
  const r = await request(app.getHttpServer())
    .post(`${base}/136/recibir-validar`)
    .set(auth())
    .send(b)
    .expect(200);
  expect(r.body.estado).toBe('CONFIRMADO');
  expect(r.body.resultado.anclaje_externo).toBe('PENDIENTE_NO_EJECUTADO');
  const replay = await request(app.getHttpServer())
    .post(`${base}/136/recibir-validar`)
    .set(auth())
    .send(b)
    .expect(200);
  expect(replay.body).toEqual(r.body);
  expect(uploads).toHaveLength(n);
  await request(app.getHttpServer())
    .post(`${base}/136/recibir-validar`)
    .set(auth())
    .send({ ...b, cantidad_recibida: 90 })
    .expect(409);
});
test('incidencia y resolución conforme con evidencia nueva preservan historia', async () => {
  const b = await body('137', undefined, 80);
  const r = await request(app.getHttpServer())
    .post(`${base}/137/recibir-validar`)
    .set(auth())
    .send(b)
    .expect(200);
  expect(r.body.estado).toBe('INCIDENCIA');
  expect(r.body.resultado.estado_registro).toBe('PENDIENTE_VALIDACION');
  const corrected = {
    ...(await body('137')),
    incidencia_id: r.body.resultado.incidencia_id,
    motivo_resolucion: 'Comprobación nueva total conforme',
  };
  await request(app.getHttpServer())
    .post(`${base}/137/recibir-validar`)
    .set(auth())
    .send(corrected)
    .expect(200);
  const d = await request(app.getHttpServer())
    .get(`${base}/137`)
    .set(auth())
    .expect(200);
  expect(d.body.historial.map((x: { clase: string }) => x.clase)).toEqual([
    'INCIDENCIA',
    'CONFORME',
  ]);
});
test('commit con respuesta incierta se recupera por misma clave tras perder acceso', async () => {
  const b = await body('138');
  uncertain = true;
  await request(app.getHttpServer())
    .post(`${base}/138/recibir-validar`)
    .set(auth())
    .send(b)
    .expect(503);
  const rev = await sql(
    'SELECT revision FROM public.usuario_vivero_revision WHERE usuario_id=20',
  );
  await sql(
    `SET ROLE service_role; SELECT public.m2_acceso_ejecutar(1,'fixture-admin','RETIRAR_ACCESO_VIVERO','${randomUUID()}',${lit({ usuario_destino_id: '20', vivero_id: '1', revision_esperada: rev, motivo: 'Retiro sintético HTTP T4' })}::jsonb)`,
  );
  await request(app.getHttpServer()).get(`${base}/138`).set(auth()).expect(403);
  const r = await request(app.getHttpServer())
    .get(`${base}/comandos/${b.comando_id}`)
    .set(auth())
    .expect(200);
  expect(r.body.estado).toBe('CONFIRMADO');
  await request(app.getHttpServer())
    .get(`${base}/comandos/${b.comando_id}`)
    .set(auth('fixture-t2-ambos'))
    .expect(202);
});
test('parser cerrado rechaza actor/custodia/base64 y BIGINT inseguro antes de efectos', async () => {
  const b = {
    comando_id: randomUUID(),
    revision_esperada: '9007199254740992',
    cantidad_recibida: 100,
    unidad_recibida: 'G',
    fecha_recepcion: day,
    evidencia_ids: ['1'],
  };
  for (const extra of [
    { actor_id: '1' },
    { vivero_id: '1' },
    { fotos: 'base64' },
    { revision_esperada: 9007199254740992 },
  ]) {
    await request(app.getHttpServer())
      .post(`${base}/139/recibir-validar`)
      .set(auth('fixture-admin'))
      .send({ ...b, ...extra })
      .expect(422);
  }
  const exact = await request(app.getHttpServer())
    .get(`${base}/9007199254740993`)
    .set(auth('fixture-admin'))
    .expect(200);
  expect(exact.body.recoleccion_id).toBe('9007199254740993');
  expect(exact.body.vivero_id).toBe('9007199254740993');
});
test('diagnóstico es solo ADMIN y nunca acredita una recepción legada', async () => {
  await request(app.getHttpServer())
    .get(`${base}/diagnostico`)
    .set(auth('fixture-t2-ambos'))
    .expect(403);
  const r = await request(app.getHttpServer())
    .get(`${base}/diagnostico`)
    .query({ antes_de_id: '124', limite: '20' })
    .set(auth('fixture-admin'))
    .expect(200);
  expect(
    r.body.some((x: { recoleccion_id: string }) => x.recoleccion_id === '123'),
  ).toBe(true);
  expect(
    r.body.every(
      (x: { recepcion_acreditada: boolean }) =>
        x.recepcion_acreditada === false,
    ),
  ).toBe(true);
});
