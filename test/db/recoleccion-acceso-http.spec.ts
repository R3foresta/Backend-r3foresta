import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { InternalActorGuard } from '../../src/auth/internal-actor.guard';
import { RecoleccionAccesosController } from '../../src/recolecciones/api/recoleccion-accesos.controller';
import { RecoleccionesController } from '../../src/recolecciones/api/recolecciones.controller';
import { RecoleccionFormDataParser } from '../../src/recolecciones/api/parsers/recoleccion-formdata.parser';
import { RecoleccionAccesosService } from '../../src/recolecciones/application/recoleccion-accesos.service';
import { RecoleccionesService } from '../../src/recolecciones/application/recolecciones.service';
import { RecoleccionAuthService } from '../../src/recolecciones/application/recoleccion-auth.service';
import { RecoleccionCreationService } from '../../src/recolecciones/application/recoleccion-creation.service';
import { RecoleccionDraftService } from '../../src/recolecciones/application/recoleccion-draft.service';
import { RecoleccionValidacionService } from '../../src/recolecciones/application/recoleccion-validacion.service';
import { RecoleccionDesechoService } from '../../src/recolecciones/application/recoleccion-desecho.service';
import { RecoleccionEliminacionService } from '../../src/recolecciones/application/recoleccion-eliminacion.service';
import { RecoleccionConsultasService } from '../../src/recolecciones/application/recoleccion-consultas.service';
import { RecoleccionCompletitudService } from '../../src/recolecciones/application/recoleccion-completitud.service';
import { RecoleccionEvidenciasService } from '../../src/recolecciones/application/recoleccion-evidencias.service';
import { RecoleccionElegibilidadService } from '../../src/recolecciones/application/recoleccion-elegibilidad.service';
import { RecoleccionUbicacionService } from '../../src/recolecciones/application/recoleccion-ubicacion.service';
import { RecoleccionSnapshotsService } from '../../src/recolecciones/application/recoleccion-snapshots.service';
import { RecoleccionCodigosService } from '../../src/recolecciones/application/recoleccion-codigos.service';
import { RecoleccionHistorialService } from '../../src/recolecciones/application/recoleccion-historial.service';
import { RecoleccionBlockchainService } from '../../src/recolecciones/application/recoleccion-blockchain.service';
import { ViveroAuthService } from '../../src/lotes-vivero/application/vivero-auth.service';
import { EvidenceFileService } from '../../src/common/files/evidence-file.service';
import { EvidenciasTrazabilidadController } from '../../src/evidencias-trazabilidad/evidencias-trazabilidad.controller';
import { EvidenciasTrazabilidadService } from '../../src/evidencias-trazabilidad/evidencias-trazabilidad.service';
import { ParticipacionComandosController } from '../../src/participacion/participacion-comandos.controller';
import { ParticipacionComandosService } from '../../src/participacion/participacion-comandos.service';
import { configureGlobalRoutes } from '../../src/app.routes';

// Transporte SQL sintético: solo socket del runner, sin .env/Supabase/Storage real.
const run = promisify(execFile);
const literal = (v: unknown): string =>
  v === undefined || v === null
    ? 'NULL'
    : "'" +
      (typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(
        /'/g,
        "''",
      ) +
      "'";
async function sql(statement: string): Promise<string> {
  if (
    !/^\/(private\/)?tmp\/t1-m1-[^/]+\/socket$/.test(
      process.env.T1_DB_SOCKET || '',
    )
  )
    throw new Error('Falta clúster privado T1');
  const { stdout } = await run(
    process.env.T1_DB_PSQL!,
    [
      '-X',
      '-w',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      process.env.T1_DB_SOCKET!,
      '-p',
      process.env.T1_DB_PORT!,
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      statement,
    ],
    {
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('PG')),
      ),
    },
  );
  return stdout.trim();
}
async function transport(statement: string) {
  return JSON.parse(
    await sql(
      `SET ROLE service_role; SELECT public.t1_http_transport(${literal(statement)});`,
    ),
  );
}
const rpc = (name: string, args: Record<string, unknown>) => {
  if (!/^(m1_|pa_|fn_recoleccion_)[a-z_]+$/.test(name))
    throw new Error('RPC fuera de fixture');
  return transport(
    `SELECT to_jsonb(x) FROM public.${name}(${Object.entries(args)
      .map(([k, v]) => k + '=>' + literal(v))
      .join(',')}) x`,
  );
};
function from(table: string) {
  if (
    ![
      'usuario',
      'recoleccion',
      'ubicacion',
      'tipos_entidad_evidencia',
      'evidencias_trazabilidad',
      'vivero',
      'planta',
      'metodo_recoleccion',
    ].includes(table)
  )
    throw new Error('Tabla fuera de fixture: ' + table);
  const conditions: string[] = [];
  const order: string[] = [];
  let limit = '';
  let count = false;
  let head = false;
  let insert: unknown;
  let deleting = false;
  let castId = false,
    castOwner = false,
    ownerAlias = false,
    viveroAlias = false,
    castVivero = false;
  const execute = async (single = false) => {
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    if (deleting)
      return transport(
        `WITH d AS(DELETE FROM public.${table}${where} RETURNING *) SELECT jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb),'count',0) FROM d`,
      );
    if (insert) {
      const values = Array.isArray(insert) ? insert : [insert];
      const columns = Object.keys(values[0]);
      const result = await transport(
        `WITH d AS(INSERT INTO public.${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::public.${table},${literal(values)}::jsonb) RETURNING *) SELECT jsonb_build_object('data',jsonb_agg(to_jsonb(d))) FROM d`,
      );
      if (result.error) return result;
      return {
        data: single ? result.data.data[0] : result.data.data,
        error: null,
      };
    }
    const result = await transport(
      `SELECT jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(t)${castId ? "||jsonb_build_object('id',t.id::text)" : ''}${castOwner ? "||jsonb_build_object('usuario_id',t.usuario_id::text)" : ''}${ownerAlias ? "||jsonb_build_object('usuario_id_exacto',t.usuario_id::text)" : ''}${viveroAlias ? "||jsonb_build_object('vivero_id_exacto',t.vivero_id::text)" : ''}${castVivero ? "||jsonb_build_object('vivero_id',t.vivero_id::text)" : ''}),'[]'::jsonb),'count',(SELECT count(*) FROM public.${table}${where})) FROM (SELECT * FROM public.${table}${where}${order.length ? ' ORDER BY ' + order.join(',') : ''}${limit}) t`,
    );
    if (result.error) return result;
    return {
      data: head
        ? null
        : single
          ? result.data.data[0] || null
          : result.data.data,
      count: count ? result.data.count : undefined,
      error: null,
    };
  };
  const q: any = {
    select: (_s: string, opts?: any) => {
      castId = /(?:^|,)\s*id::text/.test(_s);
      ownerAlias = _s.includes('usuario_id_exacto:usuario_id::text');
      viveroAlias = _s.includes('vivero_id_exacto:vivero_id::text');
      castVivero = !viveroAlias && _s.includes('vivero_id::text');
      castOwner = !ownerAlias && _s.includes('usuario_id::text');
      count = !!opts?.count;
      head = !!opts?.head;
      return q;
    },
    eq: (c: string, v: unknown) => {
      conditions.push(c + '=' + literal(v));
      return q;
    },
    neq: (c: string, v: unknown) => {
      conditions.push(c + '<>' + literal(v));
      return q;
    },
    is: (c: string, v: unknown) => {
      conditions.push(c + (v === null ? ' IS NULL' : ' IS ' + literal(v)));
      return q;
    },
    ilike: (c: string, v: unknown) => {
      conditions.push(c + ' ILIKE ' + literal(v));
      return q;
    },
    in: (c: string, values: unknown[]) => {
      conditions.push(
        values.length
          ? c + ' IN (' + values.map(literal).join(',') + ')'
          : 'false',
      );
      return q;
    },
    not: (c: string, op: string, v: unknown) => {
      conditions.push(c + ' NOT ' + op.toUpperCase() + ' ' + literal(v));
      return q;
    },
    gt: (c: string, v: unknown) => {
      conditions.push(c + '>' + literal(v));
      return q;
    },
    order: (c: string, opts?: any) => {
      order.push(c + (opts?.ascending === false ? ' DESC' : ' ASC'));
      return q;
    },
    range: (a: number, b: number) => {
      limit = ` LIMIT ${b - a + 1} OFFSET ${a}`;
      return q;
    },
    insert: (v: unknown) => {
      insert = v;
      return q;
    },
    delete: () => {
      deleting = true;
      return q;
    },
    single: () => execute(true),
    maybeSingle: () => execute(true),
    then: (a: any, b: any) => execute().then(a, b),
  };
  return q;
}
const files = new Map<string, Buffer>();
const privateClient = {
  rpc: (name: string, args: any) => {
    const promise: any = rpc(name, args);
    promise.single = () => promise;
    return promise;
  },
  from,
  storage: {
    from: () => ({
      upload: async (path: string, bytes: Buffer) => {
        files.set(path, bytes);
        return { data: { id: randomUUID() }, error: null };
      },
      remove: async (paths: string[]) => {
        paths.forEach((p) => files.delete(p));
        return { error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: 'https://synthetic.invalid/' + path },
      }),
    }),
  },
};
const snapshots = {
  nombre_cientifico_snapshot: 'Especie sintética',
  nombre_comercial_snapshot: 'Especie',
  variedad_snapshot: 'comun',
  nombre_comunidad_snapshot: 'Comunidad sintética',
  nombre_recolector_snapshot: 'Persona sintética',
};

describe('T1 HTTP → JWT verificado → casos de uso → PostgreSQL privado', () => {
  let app: INestApplication;
  let propio: number;
  let otro: number;
  let adminPropio: number;
  let grant: string;
  const jwt = new JwtService({
    secret: 't1-synthetic-only',
    signOptions: { expiresIn: 600 },
  });
  const bearer = (who: string) =>
    'Bearer ' + jwt.sign({ sub: 't1-http-' + who });
  const base = '/api/v1/usuarios/802/acceso-recoleccion';
  const post = (path: string, who = 'admin') =>
    request(app.getHttpServer()).post(path).set('Authorization', bearer(who));
  const get = (path: string, who = 'general') =>
    request(app.getHttpServer()).get(path).set('Authorization', bearer(who));
  const change = (op: string, rev: string, who = 'admin', key = randomUUID()) =>
    post(base + '/' + op, who).send({
      comando_id: key,
      revision_esperada: rev,
      motivo: 'Prueba HTTP T1',
    });
  const create = (who: string) =>
    post('/api/recolecciones', who)
      .field(
        'fecha',
        new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' }).format(
          new Date(),
        ),
      )
      .field('tipo_material', 'SEMILLA')
      .field('cantidad_inicial_canonica', '100')
      .field('unidad_canonica', 'G')
      .field('planta_id', '1')
      .field('metodo_id', '1')
      .field('vivero_id', '1')
      .field('ubicacion', JSON.stringify({ latitud: -16.5, longitud: -68.1 }))
      .attach('fotos', Buffer.from('foto sintética 1'), 'lugar.jpg')
      .attach('fotos', Buffer.from('foto sintética 2'), 'total.jpg');
  beforeAll(async () => {
    await sql(`
      CREATE FUNCTION public.t1_http_transport(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE d jsonb;c text; BEGIN EXECUTE p_sql INTO d;RETURN jsonb_build_object('data',d,'error',NULL);EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS c=RETURNED_SQLSTATE;RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',c));END $$;
      REVOKE ALL ON FUNCTION public.t1_http_transport(text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.t1_http_transport(text) TO service_role;
      INSERT INTO public.usuario(id,auth_id,rol,activo,nombre) VALUES(800,'t1-http-admin','ADMIN',true,'Admin HTTP'),(801,'t1-http-admin2','ADMIN',true,'Admin2 HTTP'),(802,'t1-http-general','GENERAL',true,'General HTTP'),(803,'t1-http-validator','VALIDADOR',true,'Validador HTTP'),(804,'t1-http-volunteer','VOLUNTARIO',true,'Voluntario HTTP'),(805,'t1-http-inactive','GENERAL',false,'Inactivo HTTP'),(9007199254740995,'t1-http-big','GENERAL',true,'BIGINT A'),(9007199254740996,'t1-http-big2','GENERAL',true,'BIGINT B');
      INSERT INTO public.tipos_entidad_evidencia VALUES(3,'EVENTO_LOTE_VIVERO',true);
      CREATE TABLE public.vivero(id bigint PRIMARY KEY);INSERT INTO public.vivero VALUES(1);
      CREATE TABLE public.metodo_recoleccion(id bigint PRIMARY KEY);INSERT INTO public.metodo_recoleccion VALUES(1);
      CREATE TABLE public.planta(id bigint PRIMARY KEY);INSERT INTO public.planta VALUES(1);
      GRANT SELECT ON public.vivero,public.metodo_recoleccion,public.planta TO service_role;
    `);
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        RecoleccionAccesosController,
        RecoleccionesController,
        EvidenciasTrazabilidadController,
        ParticipacionComandosController,
      ],
      providers: [
        VerifiedActorGuard,
        InternalActorGuard,
        RecoleccionAccesosService,
        RecoleccionesService,
        RecoleccionAuthService,
        RecoleccionCreationService,
        RecoleccionDraftService,
        RecoleccionValidacionService,
        RecoleccionDesechoService,
        RecoleccionEliminacionService,
        RecoleccionConsultasService,
        RecoleccionCompletitudService,
        RecoleccionEvidenciasService,
        RecoleccionElegibilidadService,
        RecoleccionFormDataParser,
        EvidenceFileService,
        EvidenciasTrazabilidadService,
        ViveroAuthService,
        ParticipacionComandosService,
        {
          provide: ConfigService,
          useValue: { get: () => 't1-synthetic-only' },
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: () => privateClient,
            getClient: () => {
              throw new Error('Cliente público prohibido');
            },
          },
        },
        {
          provide: RecoleccionUbicacionService,
          useValue: {
            validateAndNormalizeUbicacionPayload: async (v: any) => ({
              latitud: v.latitud,
              longitud: v.longitud,
            }),
            enrichSingleRecoleccion: async (v: any) => ({
              ...v,
              ubicacion: { coordenadas: { lat: -16.5, lon: -68.1 } },
            }),
            enrichRecoleccionesWithUbicaciones: async (v: any) => v,
          },
        },
        {
          provide: RecoleccionSnapshotsService,
          useValue: { resolve: async () => snapshots },
        },
        {
          provide: RecoleccionCodigosService,
          useValue: {
            generateCodigoTrazabilidad: async () => 'T1-HTTP-' + randomUUID(),
            isCodigoTrazabilidadDuplicateError: () => false,
          },
        },
        {
          provide: RecoleccionHistorialService,
          useValue: {
            registrarEvento: () => {
              throw new Error('Historial fuera de RPC');
            },
          },
        },
        {
          provide: RecoleccionBlockchainService,
          useValue: { executeBlockchainFlow: async () => {} },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  it('JWT obligatorio; headers no conceden identidad ni rol', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/acceso-recoleccion')
      .set('x-auth-id', 't1-http-admin')
      .expect(401);
    await get(base, 'general').set('x-user-role', 'ADMIN').expect(403);
    await get('/api/v1/me/acceso-recoleccion', 'inactive').expect(403);
    await create('general').expect(403);
    await create('volunteer').expect(403);
  });
  it('ADMIN concede; replay/clave reutilizada/revisión son independientes del rol', async () => {
    grant = randomUUID();
    const r = await change('otorgamientos', '0', 'admin', grant).expect(200);
    expect(r.body.estado).toBe('CONFIRMADO');
    expect(r.body.resultado.revision_nueva).toBe('1');
    expect(
      (await change('otorgamientos', '0', 'admin', grant).expect(200)).body,
    ).toEqual(r.body);
    await change('retiros', '1', 'admin', grant).expect(409);
    await change('retiros', '0').expect(409);
    const own = await get('/api/v1/me/acceso-recoleccion').expect(200);
    expect(own.body.data).toMatchObject({
      revision_acceso: '1',
      revision_autoridad: '0',
      rol_global: 'GENERAL',
      acceso_efectivo: true,
    });
  });
  it('entrada cerrada y actor solo del guard; no ADMIN no concede', async () => {
    await change('retiros', '1', 'general')
      .set('x-user-role', 'ADMIN')
      .expect(403);
    await post(base + '/retiros')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '1',
        motivo: 'Prueba',
        actor_id: '800',
      })
      .expect(422);
    await post(base + '/retiros')
      .send({
        comando_id: randomUUID(),
        revision_esperada: 1,
        motivo: 'Prueba',
      })
      .expect(422);
  });
  it('GENERAL y VALIDADOR con M1 crean fichas propias; M1 no habilita desecho', async () => {
    const r = await create('general').expect(201);
    propio = r.body.data.id;
    await post('/api/v1/usuarios/803/acceso-recoleccion/otorgamientos')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '0',
        motivo: 'Validador con M1',
      })
      .expect(200);
    otro = (await create('validator').expect(201)).body.data.id;
    adminPropio = (await create('admin').expect(201)).body.data.id;
    await post(`/api/recolecciones/${propio}/desecho`, 'general')
      .send({ cantidad: 1 })
      .expect(403);
  });
  it('conserva identidad BIGINT sin prestar M1 ni autoría de una cuenta vecina', async () => {
    for (const [id, who] of [
      ['9007199254740996', 'big2'],
      ['9007199254740995', 'big'],
    ] as const) {
      if (who === 'big') await create('big').expect(403);
      await post(`/api/v1/usuarios/${id}/acceso-recoleccion/otorgamientos`)
        .send({
          comando_id: randomUUID(),
          revision_esperada: '0',
          motivo: 'Identidad BIGINT exacta',
        })
        .expect(200);
    }
    const a = (await create('big').expect(201)).body.data.id;
    const b = (await create('big2').expect(201)).body.data.id;
    expect(
      await sql(
        `SELECT usuario_id::text FROM public.recoleccion WHERE id=${a}`,
      ),
    ).toBe('9007199254740995');
    expect(
      await sql(
        `SELECT usuario_id::text FROM public.recoleccion WHERE id=${b}`,
      ),
    ).toBe('9007199254740996');
    await get(`/api/recolecciones/${a}`, 'big').expect(200);
    await get(`/api/recolecciones/${b}`, 'big').expect(403);
    await request(app.getHttpServer())
      .patch(`/api/recolecciones/${a}/draft`)
      .set('Authorization', bearer('big'))
      .send({ observaciones: 'Actor exacto' })
      .expect(200);
    await get(`/api/evidencias-trazabilidad/recolecciones/${b}`, 'big').expect(
      403,
    );
  });
  it('lecturas por ID/vivero y fotos ajenas quedan cerradas antes de paginar', async () => {
    await get(`/api/recolecciones/${otro}`).expect(403);
    const own = await get('/api/recolecciones/vivero/1').expect(200);
    expect(own.body.pagination.total).toBe(1);
    expect(own.body.data.map((v: any) => v.id)).toEqual([propio]);
    const e = JSON.parse(
      await sql(
        `SELECT jsonb_agg(id) FROM public.evidencias_trazabilidad WHERE entidad_id=${otro};`,
      ),
    );
    for (const route of [
      `/api/evidencias-trazabilidad/recolecciones/${otro}`,
      `/api/evidencias-trazabilidad/entidad/RECOLECCION/${otro}`,
      `/api/evidencias-trazabilidad/${e[0]}`,
      `/api/evidencias-trazabilidad?tipo_entidad_id=1&entidad_id=${otro}`,
    ])
      await get(route).expect(403);
    expect(
      (await get('/api/evidencias-trazabilidad').expect(200)).body.pagination
        .total,
    ).toBe(0);
    await get(`/api/evidencias-trazabilidad/recolecciones/${propio}`).expect(
      200,
    );
  });
  it('editar/enviar propio; la autoría no confirma como VALIDADOR ni ADMIN', async () => {
    await request(app.getHttpServer())
      .patch(`/api/recolecciones/${propio}/draft`)
      .set('Authorization', bearer('general'))
      .send({ observaciones: 'Corregida' })
      .expect(200);
    for (const [id, who] of [
      [propio, 'general'],
      [otro, 'validator'],
      [adminPropio, 'admin'],
    ] as const)
      await request(app.getHttpServer())
        .patch(`/api/recolecciones/${id}/submit`)
        .set('Authorization', bearer(who))
        .expect(200);
    for (const [id, who] of [
      [otro, 'validator'],
      [adminPropio, 'admin'],
    ] as const)
      await request(app.getHttpServer())
        .patch(`/api/recolecciones/${id}/approve`)
        .set('Authorization', bearer(who))
        .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/recolecciones/${propio}/approve`)
      .set('Authorization', bearer('admin'))
      .expect(200);
  });
  it('retiro corta captura/mantenimiento/fotos sin borrar historia; recibo no reactiva acceso', async () => {
    await change('retiros', '1').expect(200);
    await create('general').expect(403);
    await get(`/api/recolecciones/${propio}`).expect(403);
    await get(`/api/evidencias-trazabilidad/recolecciones/${propio}`).expect(
      403,
    );
    await post(
      `/api/evidencias-trazabilidad/recolecciones/${propio}`,
      'general',
    )
      .attach('fotos', Buffer.from('foto'), 'foto.jpg')
      .expect(403);
    const old = await get(
      '/api/v1/recoleccion/accesos/comandos/' + grant,
      'admin',
    ).expect(200);
    expect(old.body.estado).toBe('CONFIRMADO');
    expect(
      (await get('/api/v1/me/acceso-recoleccion').expect(200)).body.data
        .acceso_efectivo,
    ).toBe(false);
    const missing = await get(
      '/api/v1/recoleccion/accesos/comandos/' + grant,
      'general',
    ).expect(202);
    expect(missing.headers['retry-after']).toBe('2');
  });
  it('recupera resultado propio después de perder ADMIN y conserva aislamiento', async () => {
    const command = randomUUID();
    await post('/api/v1/usuarios/803/acceso-recoleccion/retiros', 'admin2')
      .send({
        comando_id: command,
        revision_esperada: '1',
        motivo: 'Retiro HTTP',
      })
      .expect(200);
    await post('/api/v1/usuarios/801/roles')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '0',
        rol_global: 'GENERAL',
        motivo: 'Democión sintética',
      })
      .expect(200);
    await get(
      '/api/v1/recoleccion/accesos/comandos/' + command,
      'admin2',
    ).expect(200);
    await post(
      '/api/v1/usuarios/803/acceso-recoleccion/otorgamientos',
      'admin2',
    )
      .send({
        comando_id: randomUUID(),
        revision_esperada: '2',
        motivo: 'Prohibido',
      })
      .expect(403);
    await get(
      '/api/v1/recoleccion/accesos/comandos/' + command,
      'admin',
    ).expect(202);
  });
});
