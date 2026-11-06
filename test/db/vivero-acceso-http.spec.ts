import { LotesViveroService } from '../../src/lotes-vivero/application/lotes-vivero.service';
import { ViveroAdaptabilidadService } from '../../src/lotes-vivero/application/vivero-adaptabilidad.service';
import { ViveroAsignacionesService } from '../../src/lotes-vivero/application/vivero-asignaciones.service';
import { ViveroConsultasService } from '../../src/lotes-vivero/application/vivero-consultas.service';
import { ViveroDescartePreEmbolsadoService } from '../../src/lotes-vivero/application/vivero-descarte-pre-embolsado.service';
import { ViveroDespachoService } from '../../src/lotes-vivero/application/vivero-despacho.service';
import { ViveroEmbolsadoService } from '../../src/lotes-vivero/application/vivero-embolsado.service';
import { ViveroEventosService } from '../../src/lotes-vivero/application/vivero-eventos.service';
import { ViveroEvidenciasService } from '../../src/lotes-vivero/application/vivero-evidencias.service';
import { ViveroInicioService } from '../../src/lotes-vivero/application/vivero-inicio.service';
import { ViveroMermaService } from '../../src/lotes-vivero/application/vivero-merma.service';
import { ViveroSaldosService } from '../../src/lotes-vivero/application/vivero-saldos.service';
import { ViveroSnapshotsService } from '../../src/lotes-vivero/application/vivero-snapshots.service';
import { ViveroTimelineService } from '../../src/lotes-vivero/application/vivero-timeline.service';
import { ViveroAccesosService } from '../../src/lotes-vivero/application/vivero-accesos.service';
import { LotesViveroController } from '../../src/lotes-vivero/api/lotes-vivero.controller';
import { ViveroAccesosController } from '../../src/lotes-vivero/api/vivero-accesos.controller';
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
    !/^\/(private\/)?tmp\/t2-vivero-[^/]+\/socket$/.test(
      process.env.T2_DB_SOCKET || '',
    )
  )
    throw new Error('Falta clúster privado T2');
  const { stdout } = await run(
    process.env.T2_DB_PSQL!,
    [
      '-X',
      '-w',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      process.env.T2_DB_SOCKET!,
      '-p',
      process.env.T2_DB_PORT!,
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
      `SET ROLE service_role; SELECT public.t2_http_transport(${literal(statement)});`,
    ),
  );
}
// Subconjunto PostgREST usado por estas consultas. Cada .or() se agrega con AND,
// como hace PostgrestFilterBuilder al conservar parámetros or repetidos.
function orSql(filters: string): string {
  let depth = 0;
  let start = 0;
  const terms: string[] = [];
  for (let i = 0; i <= filters.length; i++) {
    if (filters[i] === '(') depth++;
    if (filters[i] === ')') depth--;
    if ((filters[i] === ',' && depth === 0) || i === filters.length) {
      terms.push(filters.slice(start, i));
      start = i + 1;
    }
  }
  return (
    '(' +
    terms
      .map((term) => {
        const match = /^([a-z_]+)\.(eq|in|ilike)\.(.+)$/.exec(term);
        if (!match) throw new Error('Filtro OR fuera de fixture: ' + term);
        const [, column, op, value] = match;
        if (op === 'ilike')
          return column + ' ILIKE ' + literal(value.replace(/\*/g, '%'));
        if (op === 'eq' && /^[1-9][0-9]*$/.test(value))
          return column + '=' + literal(value);
        if (op === 'in' && /^\([1-9][0-9]*(,[1-9][0-9]*)*\)$/.test(value))
          return (
            column +
            ' IN (' +
            value.slice(1, -1).split(',').map(literal).join(',') +
            ')'
          );
        throw new Error('Valor OR fuera de fixture: ' + term);
      })
      .join(' OR ') +
    ')'
  );
}
const rpc = (name: string, args: Record<string, unknown>) => {
  if (!/^(m1_|m2_|pa_|fn_recoleccion_|fn_vivero_|fn_m3_)[a-z_]+$/.test(name))
    throw new Error('RPC fuera de fixture');
  return transport(
    `SELECT to_jsonb(x) FROM public.${name}(${Object.entries(args)
      .map(
        ([k, v]) =>
          k +
          '=>' +
          (Array.isArray(v) && k.endsWith('_ids')
            ? literal('{' + v.join(',') + '}')
            : literal(v)),
      )
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
      'lote_vivero',
      'evento_lote_vivero',
      'asignacion_vivero_subcampania',
      'v_lote_vivero_saldos',
      'subcampania',
      'subcampania_equipo',
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
  let updating: Record<string, unknown> | null = null;
  let casts: string[] = [];
  let castId = false,
    castOwner = false,
    ownerAlias = false,
    viveroAlias = false;
  const execute = async (single = false) => {
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    if (updating)
      return transport(
        `WITH d AS(UPDATE public.${table} SET ${Object.entries(updating)
          .map(([k, v]) => k + '=' + literal(v))
          .join(
            ',',
          )}${where} RETURNING *) SELECT jsonb_agg(to_jsonb(d)) FROM d`,
      );
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
      `SELECT jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(t)${table === 'evidencias_trazabilidad' ? "||jsonb_build_object('tipo_entidad',(SELECT to_jsonb(te) FROM public.tipos_entidad_evidencia te WHERE te.id=t.tipo_entidad_id))" : ''}${casts.map((c) => "||jsonb_build_object('" + c + "',t." + c + '::text)').join('')}${castId ? "||jsonb_build_object('id',t.id::text)" : ''}${castOwner ? "||jsonb_build_object('usuario_id',t.usuario_id::text)" : ''}${ownerAlias ? "||jsonb_build_object('usuario_id_exacto',t.usuario_id::text)" : ''}${viveroAlias ? "||jsonb_build_object('vivero_id_exacto',t.vivero_id::text)" : ''}),'[]'::jsonb),'count',(SELECT count(*) FROM public.${table}${where})) FROM (SELECT * FROM public.${table}${where}${order.length ? ' ORDER BY ' + order.join(',') : ''}${limit}) t`,
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
      casts = [
        ..._s.matchAll(
          /(?<!:)\b(vivero_id|lote_id|entidad_id|creado_por_usuario_id|responsable_id)::text/g,
        ),
      ].map((m) => m[1]);
      castId = /(?:^|,)\s*id::text/.test(_s);
      ownerAlias = _s.includes('usuario_id_exacto:usuario_id::text');
      viveroAlias = _s.includes('vivero_id_exacto:vivero_id::text');
      castOwner = !ownerAlias && _s.includes('usuario_id::text');
      count = !!opts?.count;
      head = !!opts?.head;
      return q;
    },
    eq: (c: string, v: unknown) => {
      conditions.push(c + '=' + literal(v));
      return q;
    },
    or: (filters: string) => {
      conditions.push(orSql(filters));
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
      conditions.push(
        op === 'is' && v === null
          ? c + ' IS NOT NULL'
          : c + ' NOT ' + op.toUpperCase() + ' ' + literal(v),
      );
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
    update: (v: Record<string, unknown>) => {
      updating = v;
      return q;
    },
    gte: (c: string, v: unknown) => {
      conditions.push(c + '>=' + literal(v));
      return q;
    },
    lte: (c: string, v: unknown) => {
      conditions.push(c + '<=' + literal(v));
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

describe('T2 HTTP → JWT real → alcance de vivero → RPC PostgreSQL reales', () => {
  let app: INestApplication;
  let loteA: number;
  let loteB: number;
  let eventoB: number;
  let fotoB: number;
  let grant: string;
  const jwt = new JwtService({
    secret: 't2-synthetic-only',
    signOptions: { expiresIn: 600 },
  });
  const bearer = (who: string) =>
    'Bearer ' + jwt.sign({ sub: 't2-http-' + who });
  const get = (path: string, who = 'a') =>
    request(app.getHttpServer()).get(path).set('Authorization', bearer(who));
  const post = (path: string, who = 'a') =>
    request(app.getHttpServer()).post(path).set('Authorization', bearer(who));
  const patch = (path: string, who = 'a') =>
    request(app.getHttpServer()).patch(path).set('Authorization', bearer(who));
  const day = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/La_Paz',
  }).format(new Date());
  const change = (
    user: string,
    vivero: string,
    revision: string,
    op = 'otorgamientos',
    who = 'admin',
    key = randomUUID(),
  ) =>
    post(`/api/v1/usuarios/${user}/acceso-viveros/${op}`, who).send({
      comando_id: key,
      vivero_id: vivero,
      revision_esperada: revision,
      motivo: 'Ensayo HTTP T2',
    });
  const upload = async (path: string, who = 'a', vivero?: string) => {
    let r = post(path, who);
    if (vivero) r = r.field('vivero_id', vivero);
    const res = await r
      .attach('fotos', Buffer.from('foto sintética T2'), 'evento.jpg')
      .expect(201);
    return res.body.evidencia_ids ?? res.body.data.evidencia_ids;
  };
  const iniciar = async (who: string, origen: number, viv: string) => {
    const ids = await upload(
      '/api/lotes-vivero/evidencias-pendientes',
      who,
      viv,
    );
    return post('/api/lotes-vivero', who)
      .send({
        recoleccion_id: String(origen),
        vivero_id: viv,
        fecha_inicio: day,
        fecha_evento: day,
        cantidad_inicial_en_proceso: 5,
        unidad_medida_inicial: 'G',
        evidencia_ids: ids,
      })
      .expect(201);
  };
  beforeAll(async () => {
    await sql(`CREATE FUNCTION public.t2_http_transport(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE d jsonb;c text;m text; BEGIN EXECUTE p_sql INTO d;RETURN jsonb_build_object('data',d,'error',NULL);EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS c=RETURNED_SQLSTATE,m=MESSAGE_TEXT;RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',c,'message',m));END $$;
      REVOKE ALL ON FUNCTION public.t2_http_transport(text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.t2_http_transport(text) TO service_role;
      INSERT INTO public.usuario(id,auth_id,nombre,rol,activo) VALUES (820,'t2-http-a','Operario A','GENERAL',true),(821,'t2-http-ab','Operario AB','GENERAL',true),(822,'t2-http-m1','Solo M1','GENERAL',true),(823,'t2-http-val','Validador A','VALIDADOR',true),(824,'t2-http-sin','Validador sin vivero','VALIDADOR',true),(825,'t2-http-admin','Admin HTTP','ADMIN',true),(826,'t2-http-vol','Voluntario HTTP','VOLUNTARIO',true),(827,'t2-http-baja','Inactivo HTTP','GENERAL',false);
      INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica,nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,nombre_comunidad_snapshot,nombre_recolector_snapshot) SELECT i,822,CURRENT_DATE,CASE WHEN i>=1102 THEN 'PENDIENTE_VALIDACION'::public.estado_registro_recoleccion ELSE 'VALIDADO' END,'T2-HTTP-ORIGEN-'||i,'SEMILLA',1,CASE WHEN i IN (1101,1103) THEN 2 ELSE 1 END,1,1,'G',100,'Especie sintética','Tara','comun','Zona','Autor M1' FROM generate_series(1100,1104) i;
      UPDATE public.recoleccion SET usuario_id=823 WHERE id=1104;
      INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id) SELECT 1,r.id,'recoleccion_fotos','http-origen/'||r.id||'/'||n,'FOTO','image/jpeg',r.usuario_id FROM public.recoleccion r CROSS JOIN generate_series(1,2) n WHERE r.id BETWEEN 1100 AND 1104;
      INSERT INTO public.subcampania(id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id) VALUES(31,'Subcampaña HTTP','ACTIVA','SUB-T2-HTTP',825,825,1);
      INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES(31,1);
      INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(31,821,'COORDINADOR',825);
    `);
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        RecoleccionAccesosController,
        LotesViveroController,
        ViveroAccesosController,
        RecoleccionesController,
        EvidenciasTrazabilidadController,
        ParticipacionComandosController,
      ],
      providers: [
        VerifiedActorGuard,
        InternalActorGuard,
        RecoleccionAccesosService,
        LotesViveroService,
        ViveroAdaptabilidadService,
        ViveroAsignacionesService,
        ViveroConsultasService,
        ViveroDescartePreEmbolsadoService,
        ViveroDespachoService,
        ViveroEmbolsadoService,
        ViveroEventosService,
        ViveroEvidenciasService,
        ViveroInicioService,
        ViveroMermaService,
        ViveroSaldosService,
        ViveroSnapshotsService,
        ViveroTimelineService,
        ViveroAccesosService,
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
          useValue: { get: () => 't2-synthetic-only' },
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
  it('exige JWT/cuenta activa y no presta ADMIN por headers; VOLUNTARIO no opera', async () => {
    await request(app.getHttpServer())
      .get('/api/lotes-vivero')
      .set('x-auth-id', 't2-http-admin')
      .expect(401);
    await get('/api/lotes-vivero', 'baja').expect(403);
    await get('/api/lotes-vivero', 'vol').expect(403);
    await get('/api/v1/me/acceso-viveros', 'vol').expect(200);
    await change('820', '1', '0', 'otorgamientos', 'a')
      .set('x-user-role', 'ADMIN')
      .expect(403);
    await get('/api/v1/usuarios/820/acceso-viveros', 'a').expect(403);
  });
  it('ADMIN concede varios ámbitos con revisión independiente, replay y recuperación', async () => {
    grant = randomUUID();
    const first = await change(
      '820',
      '1',
      '0',
      'otorgamientos',
      'admin',
      grant,
    ).expect(200);
    expect(first.body.estado).toBe('CONFIRMADO');
    expect(
      (
        await change('820', '1', '0', 'otorgamientos', 'admin', grant).expect(
          200,
        )
      ).body,
    ).toEqual(first.body);
    await change('820', '2', '0', 'otorgamientos', 'admin', grant).expect(409);
    await change('820', '2', '0').expect(409);
    await change('821', '1', '0').expect(200);
    await change('821', '2', '1').expect(200);
    await change('823', '1', '0').expect(200);
    const own = (await get('/api/v1/me/acceso-viveros').expect(200)).body.data;
    expect(own.revision_acceso).toBe('1');
    expect(own.viveros.map((x: any) => x.vivero_id)).toEqual(['1']);
    expect(
      (await get('/api/v1/me/acceso-viveros', 'admin').expect(200)).body.data
        .alcance_global,
    ).toBe(true);
    await get('/api/v1/vivero/accesos/comandos/' + grant, 'admin').expect(200);
    const missing = await get(
      '/api/v1/vivero/accesos/comandos/' + grant,
    ).expect(202);
    expect(missing.headers['retry-after']).toBe('2');
    await change('826', '1', '0').expect(409);
    await post('/api/v1/usuarios/820/acceso-viveros/retiros', 'admin')
      .send({
        comando_id: randomUUID(),
        vivero_id: '1',
        revision_esperada: '1',
        motivo: 'Ensayo HTTP',
        actor_id: '825',
      })
      .expect(422);
  });
  it('M2 solo lee la proyección mínima de material ajeno y no concede captura/edición M1', async () => {
    const material = await get(
      '/api/v1/vivero/origenes?vivero_id=1&limit=1',
    ).expect(200);
    expect(material.body.pagination.total).toBe(
      Number(
        await sql(
          "SELECT count(*) FROM public.recoleccion WHERE vivero_id=1 AND estado_registro='VALIDADO' AND estado_operativo='ABIERTO' AND saldo_actual>0",
        ),
      ),
    );
    expect(material.body.data[0].recolector_id).toBe('822');
    expect(material.body.data[0].observaciones).toBeUndefined();
    await get('/api/v1/vivero/origenes?vivero_id=2').expect(403);
    await get('/api/v1/vivero/origenes?vivero_id=1&recoleccion_id=1101').expect(
      404,
    );
    await get('/api/recolecciones/1100').expect(403);
    await patch('/api/recolecciones/1100/draft')
      .send({ observaciones: 'ajena' })
      .expect(403);
    await post('/api/recolecciones')
      .field('fecha', day)
      .field('tipo_material', 'SEMILLA')
      .field('unidad_canonica', 'G')
      .field('cantidad_inicial_canonica', '100')
      .field('planta_id', '1')
      .field('metodo_id', '1')
      .field('vivero_id', '1')
      .field('ubicacion', '{"latitud":-16.5,"longitud":-68.1}')
      .attach('fotos', Buffer.from('a'), 'a.jpg')
      .attach('fotos', Buffer.from('b'), 'b.jpg')
      .expect(403);
    await post('/api/v1/usuarios/822/acceso-recoleccion/otorgamientos', 'admin')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '0',
        motivo: 'Solo M1',
      })
      .expect(200);
    await get('/api/lotes-vivero', 'm1')
      .expect(200)
      .then((r) => expect(r.body.pagination.total).toBe(0));
    await post('/api/lotes-vivero', 'm1')
      .send({
        recoleccion_id: '1100',
        vivero_id: '1',
        fecha_inicio: day,
        fecha_evento: day,
        cantidad_inicial_en_proceso: 5,
        unidad_medida_inicial: 'G',
        evidencia_ids: ['1'],
      })
      .expect(403);
  });
  it('carga multipart requiere contexto autorizable; INICIO usa RPC real y conserva autoría', async () => {
    await post('/api/lotes-vivero/evidencias-pendientes')
      .attach('fotos', Buffer.from('f'), 'f.jpg')
      .expect(400);
    await post('/api/lotes-vivero/evidencias-pendientes')
      .field('vivero_id', '2')
      .attach('fotos', Buffer.from('f'), 'f.jpg')
      .expect(403);
    const a = await iniciar('a', 1100, '1');
    loteA = a.body.data.lote_vivero_id;
    const b = await iniciar('ab', 1101, '2');
    loteB = b.body.data.lote_vivero_id;
    eventoB = b.body.data.evento_inicio_id;
    fotoB = b.body.data.evidencia_inicio_ids[0];
    const fotosB = await upload(
      `/api/lotes-vivero/${loteB}/embolsado/evidencias-pendientes`,
      'ab',
    );
    await post(`/api/lotes-vivero/${loteB}/embolsado`, 'ab')
      .send({
        fecha_evento: day,
        plantas_vivas_iniciales: 3,
        evidencia_ids: fotosB,
      })
      .expect(201);
    expect(
      await sql(
        'SELECT usuario_id::text FROM public.recoleccion WHERE id=1100',
      ),
    ).toBe('822');
    expect(
      await sql('SELECT saldo_actual FROM public.recoleccion WHERE id=1100'),
    ).toBe('95');
    const ids = await upload(
      '/api/lotes-vivero/evidencias-pendientes',
      'a',
      '1',
    );
    await post('/api/lotes-vivero')
      .send({
        recoleccion_id: '1101',
        vivero_id: '1',
        fecha_inicio: day,
        fecha_evento: day,
        cantidad_inicial_en_proceso: 5,
        unidad_medida_inicial: 'G',
        evidencia_ids: ids,
      })
      .expect(403);
  });
  it('filtra lotes/stock antes de sumar y paginar; deniega todas las lecturas por ID ajeno', async () => {
    const list = await get('/api/lotes-vivero?limit=1').expect(200);
    expect(list.body.pagination.total).toBe(
      Number(
        await sql('SELECT count(*) FROM public.lote_vivero WHERE vivero_id=1'),
      ),
    );
    expect(list.body.data[0].id).toBe(loteA);
    await get('/api/lotes-vivero?vivero_id=2').expect(403);
    await get('/api/lotes-vivero?lote_vivero_id=' + loteB).expect(403);
    for (const suffix of [
      '',
      '/timeline',
      '/saldos',
      '/asignaciones',
      '/embolsado/context',
      '/embolsado',
      '/adaptabilidad',
      '/merma',
      '/despacho',
    ]) {
      await get('/api/lotes-vivero/' + loteB + suffix).expect(403);
    }
    await get('/api/lotes-vivero/' + loteA).expect(200);
    for (const suffix of [
      '/embolsado/evidencias-pendientes',
      '/adaptabilidad/evidencias-pendientes',
      '/merma/evidencias-pendientes',
      '/despacho/evidencias-pendientes',
      '/descarte-pre-embolsado/evidencias-pendientes',
    ])
      await post('/api/lotes-vivero/' + loteB + suffix)
        .attach('fotos', Buffer.from('f'), 'f.jpg')
        .expect(403);
  });
  it('evidencias por ID/entidad/filtro/código/timeline respetan el vivero, con Storage sintético', async () => {
    for (const path of [
      `/api/evidencias-trazabilidad/${fotoB}`,
      `/api/evidencias-trazabilidad/entidad/EVENTO_LOTE_VIVERO/${eventoB}`,
      `/api/evidencias-trazabilidad?tipo_entidad_codigo=EVENTO_LOTE_VIVERO&entidad_id=${eventoB}`,
      `/api/evidencias-trazabilidad?tipo_entidad_id=3&entidad_id=${eventoB}`,
    ])
      await get(path).expect(403);
    await get(
      '/api/evidencias-trazabilidad?tipo_entidad_codigo=EVENTO_LOTE_VIVERO',
    ).expect(403);
    expect(
      (
        await get(
          '/api/evidencias-trazabilidad?codigo_trazabilidad=' +
            encodeURIComponent('VIV-'),
        ).expect(200)
      ).body.pagination.total,
    ).toBe(0);
    const ownEvent = await sql(
      'SELECT id FROM public.evento_lote_vivero WHERE lote_id=' +
        loteA +
        " AND tipo_evento='INICIO'",
    );
    await get(
      '/api/evidencias-trazabilidad/entidad/EVENTO_LOTE_VIVERO/' + ownEvent,
    ).expect(200);
    const ids = await upload(
      `/api/lotes-vivero/${loteA}/embolsado/evidencias-pendientes`,
    );
    await post(`/api/lotes-vivero/${loteA}/embolsado`, 'ab')
      .send({
        fecha_evento: day,
        plantas_vivas_iniciales: 3,
        evidencia_ids: ids,
      })
      .expect(403);
    await post(`/api/lotes-vivero/${loteA}/embolsado`)
      .send({
        fecha_evento: day,
        plantas_vivas_iniciales: 3,
        evidencia_ids: ids,
      })
      .expect(201);
    const stock = await get('/api/lotes-vivero/stock/especies').expect(200);
    expect(stock.body.data[0].saldo_vivo_actual_total).toBe(
      Number(
        await sql(
          "SELECT sum(saldo_vivo_actual) FROM public.lote_vivero WHERE vivero_id=1 AND estado_lote='ACTIVO' AND saldo_vivo_actual>0",
        ),
      ),
    );
    expect(stock.body.data[0].lotes.map((l: any) => l.lote_id)).toContain(
      loteA,
    );
    expect(stock.body.data[0].lotes.map((l: any) => l.lote_id)).not.toContain(
      loteB,
    );
  });
  it('revisión legada acotada conserva revisor autorizado y veto de aprobación propia', async () => {
    expect(
      (await get('/api/recolecciones/pending-validation', 'sin').expect(200))
        .body.pagination.total,
    ).toBe(0);
    const rows = await get(
      '/api/recolecciones/pending-validation',
      'val',
    ).expect(200);
    expect(rows.body.data.every((x: any) => Number(x.vivero_id) === 1)).toBe(
      true,
    );
    await patch('/api/recolecciones/1103/approve', 'val').expect(403);
    await patch('/api/recolecciones/1104/approve', 'val').expect(403);
    await patch('/api/recolecciones/1102/approve', 'a').expect(403);
    await patch('/api/recolecciones/1102/approve', 'val').expect(200);
    await patch('/api/recolecciones/1103/reject', 'sin')
      .send({ motivo_rechazo: 'Ficha incorrecta sintética' })
      .expect(403);
  });
  it('M1 autoriza ficha/fotos/revisión con el almacenamiento BIGINT exacto, sin prestar el vivero vecino', async () => {
    const asignado = '9007199254740992';
    const ajeno = '9007199254740993';
    await sql(`INSERT INTO public.usuario(id,auth_id,nombre,rol,activo) VALUES(828,'t2-http-big','Validador BIGINT','VALIDADOR',true);
      INSERT INTO public.vivero(id,codigo,nombre,ubicacion_id) VALUES(${asignado},'VIV-BIG-A','Vivero BIGINT A',1),(${ajeno},'VIV-BIG-B','Vivero BIGINT B',1);
      INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica) VALUES
      (1110,822,CURRENT_DATE,'PENDIENTE_VALIDACION','T2-BIG-A','SEMILLA',1,${asignado},1,1,'G',100),
      (1111,822,CURRENT_DATE,'PENDIENTE_VALIDACION','T2-BIG-B','SEMILLA',1,${ajeno},1,1,'G',100);
      INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id)
      SELECT 1,i,'recoleccion_fotos','big/'||i||'/'||n,'FOTO','image/jpeg',822 FROM generate_series(1110,1111) i CROSS JOIN generate_series(1,2) n;
    `);
    await change('828', asignado, '0').expect(200);
    expect(
      (await get('/api/v1/me/acceso-recoleccion', 'big').expect(200)).body.data
        .acceso_efectivo,
    ).toBe(false);
    const ficha = await get('/api/recolecciones/1110', 'big').expect(200);
    expect(ficha.body.data.vivero_id).toBe(asignado);
    expect(ficha.body.data.fotos).toHaveLength(2);
    await get('/api/recolecciones/1111', 'big').expect(403);
    await get(
      '/api/evidencias-trazabilidad/entidad/RECOLECCION/1111',
      'big',
    ).expect(403);
    await get(
      '/api/evidencias-trazabilidad/entidad/RECOLECCION/1110',
      'big',
    ).expect(200);
    const lista = await get(
      '/api/recolecciones/vivero/' + asignado,
      'big',
    ).expect(200);
    expect(lista.body.data.map((r: any) => r.id)).toEqual([1110]);
    expect(lista.body.data[0].vivero_id).toBe(asignado);
    await get('/api/recolecciones/vivero/' + ajeno, 'big').expect(403);
    const filtroAjeno = await get(
      '/api/recolecciones/pending-validation?vivero_id=' + ajeno,
      'big',
    ).expect(200);
    expect(filtroAjeno.body.pagination.total).toBe(0);
    const filtroPropio = await get(
      '/api/recolecciones/pending-validation?vivero_id=' + asignado,
      'big',
    ).expect(200);
    expect(filtroPropio.body.data.map((r: any) => r.id)).toEqual([1110]);
    await patch('/api/recolecciones/1111/approve', 'big').expect(403);
    expect(
      await sql('SELECT estado_registro FROM public.recoleccion WHERE id=1111'),
    ).toBe('PENDIENTE_VALIDACION');
    await patch('/api/recolecciones/1110/approve', 'big').expect(200);
    for (const id of ['01', '9223372036854775808']) {
      await get('/api/recolecciones/vivero/' + id, 'big').expect(422);
      await get(
        '/api/recolecciones/pending-validation?vivero_id=' + id,
        'big',
      ).expect(400);
    }
  });
  it('captura y edición M1 conservan el vivero BIGINT por multipart/JSON y rechazan Number inseguro', async () => {
    const ajeno = '9007199254740993';
    const creado = await post('/api/recolecciones', 'm1')
      .field('fecha', day)
      .field('tipo_material', 'SEMILLA')
      .field('unidad_canonica', 'G')
      .field('cantidad_inicial_canonica', '10')
      .field('planta_id', '1')
      .field('metodo_id', '1')
      .field('vivero_id', ajeno)
      .field('ubicacion', '{"latitud":-16.5,"longitud":-68.1}')
      .attach('fotos', Buffer.from('a'), 'a.jpg')
      .attach('fotos', Buffer.from('b'), 'b.jpg')
      .expect(201);
    const id = creado.body.data.id;
    expect(creado.body.data.vivero_id).toBe(ajeno);
    expect(
      await sql(
        'SELECT vivero_id::text FROM public.recoleccion WHERE id=' + id,
      ),
    ).toBe(ajeno);
    await patch(`/api/recolecciones/${id}/draft`, 'm1')
      .send({ vivero_id: '9007199254740992' })
      .expect(200);
    await patch(`/api/recolecciones/${id}/draft`, 'm1')
      .field('vivero_id', ajeno)
      .expect(200);
    await patch(`/api/recolecciones/${id}/draft`, 'm1')
      .send({ vivero_id: Number(ajeno) })
      .expect(400);
    await patch(`/api/recolecciones/${id}/draft`, 'm1')
      .send({
        vivero_id: Number(ajeno),
        'ubicacion[latitud]': -16.5,
        'ubicacion[longitud]': -68.1,
      })
      .expect(400);
    expect(
      await sql(
        'SELECT vivero_id::text FROM public.recoleccion WHERE id=' + id,
      ),
    ).toBe(ajeno);
    const propios = await get(
      '/api/recolecciones?vivero_id=' + ajeno,
      'm1',
    ).expect(200);
    expect(propios.body.data.some((r: any) => r.id === id)).toBe(true);
    expect(propios.body.data.every((r: any) => r.vivero_id === ajeno)).toBe(
      true,
    );
  });
  it('VALIDADOR con M1 conserva pendientes propios sin M2 y los combina con su cola local antes de buscar/contar/paginar', async () => {
    await sql(`INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,vivero_id,observaciones,unidad_canonica,cantidad_inicial_canonica) VALUES
      (1120,824,CURRENT_DATE,'PENDIENTE_VALIDACION','T2-COLA-1120','SEMILLA',2,'COLA-PROPIA','G',10),
      (1121,824,CURRENT_DATE,'PENDIENTE_VALIDACION','T2-COLA-1121','SEMILLA',1,'COLA-PROPIA','G',10),
      (1122,822,CURRENT_DATE,'PENDIENTE_VALIDACION','T2-COLA-1122','SEMILLA',1,'COLA-PROPIA','G',10),
      (1123,822,CURRENT_DATE,'PENDIENTE_VALIDACION','T2-COLA-1123','SEMILLA',2,'COLA-PROPIA','G',10);`);
    await post('/api/v1/usuarios/824/acceso-recoleccion/otorgamientos', 'admin')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '0',
        motivo: 'M1 combinable con revisión',
      })
      .expect(200);
    const path = '/api/recolecciones/pending-validation?search=COLA-PROPIA';
    const propios = await get(path, 'sin').expect(200);
    expect(propios.body.data.map((r: any) => r.id)).toEqual([1121, 1120]);
    expect(propios.body.pagination.total).toBe(2);
    await get('/api/recolecciones/1120', 'sin').expect(200);
    await patch('/api/recolecciones/1121/approve', 'sin').expect(403);
    await change('824', '1', '0').expect(200);
    const union = await get(path, 'sin').expect(200);
    expect(union.body.data.map((r: any) => r.id)).toEqual([1122, 1121, 1120]);
    expect(union.body.pagination.total).toBe(3);
    for (const [page, id] of [
      [1, 1122],
      [2, 1121],
      [3, 1120],
    ]) {
      const r = await get(path + '&limit=1&page=' + page, 'sin').expect(200);
      expect(r.body.pagination.total).toBe(3);
      expect(r.body.data.map((row: any) => row.id)).toEqual([id]);
    }
    const fuera = await get(path + '&vivero_id=2', 'sin').expect(200);
    expect(fuera.body.data.map((r: any) => r.id)).toEqual([1120]);
    await get('/api/recolecciones/1123', 'sin').expect(403);
    await patch('/api/recolecciones/1121/approve', 'sin').expect(403);
    await post('/api/v1/usuarios/824/acceso-recoleccion/retiros', 'admin')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '1',
        motivo: 'Conservar únicamente revisión local',
      })
      .expect(200);
    const local = await get(path, 'sin').expect(200);
    expect(local.body.data.map((r: any) => r.id)).toEqual([1122, 1121]);
    await get('/api/recolecciones/1120', 'sin').expect(403);
    await change('824', '1', '1', 'retiros').expect(200);
    expect((await get(path, 'sin').expect(200)).body.pagination.total).toBe(0);
  });
  it('DESECHO lo autoriza el vivero aun sin M1; M1/autoría y vivero ajeno se rechazan', async () => {
    await post('/api/recolecciones/1100/desecho', 'm1')
      .send({ cantidad: 1 })
      .expect(403);
    await post('/api/recolecciones/1101/desecho')
      .send({ cantidad: 1 })
      .expect(403);
    const r = await post('/api/recolecciones/1100/desecho')
      .send({ cantidad: 2 })
      .expect(201);
    expect(r.body.data.saldo_despues).toBe(93);
    await post('/api/recolecciones/1100/desecho')
      .send({ cantidad: 999 })
      .expect(400);
  });
  it('entrega/devolución por ruta M2 exige coordinación además de vivero', async () => {
    const own = await upload(
      `/api/lotes-vivero/${loteA}/despacho/evidencias-pendientes`,
    );
    await post(`/api/lotes-vivero/${loteA}/asignaciones`)
      .send({
        subcampania_id: '31',
        cantidad_asignada: 2,
        proposito: 'PLANTACION_INICIAL',
        fecha_asignacion: day,
        evidencia_ids: own,
      })
      .expect(403);
    const ids = await upload(
      `/api/lotes-vivero/${loteA}/despacho/evidencias-pendientes`,
      'ab',
    );
    const a = await post(`/api/lotes-vivero/${loteA}/asignaciones`, 'ab')
      .send({
        subcampania_id: '31',
        cantidad_asignada: 2,
        proposito: 'PLANTACION_INICIAL',
        fecha_asignacion: day,
        evidencia_ids: ids,
      })
      .expect(201);
    const path = `/api/lotes-vivero/${loteA}/asignaciones/${a.body.data.asignacion_id}/devolucion`;
    const body = {
      cantidad_devuelta: 1,
      motivo_devolucion: 'SOBRANTE_OPERATIVO',
      fecha_devolucion: day,
    };
    await post(path).send(body).expect(403);
    await post(path, 'ab').send(body).expect(201);
  });
  it('retiro A conserva B y M1, corta lecturas/fotos/escrituras; rol/baja cortan acceso efectivo', async () => {
    await post('/api/v1/usuarios/821/acceso-recoleccion/otorgamientos', 'admin')
      .send({
        comando_id: randomUUID(),
        revision_esperada: '0',
        motivo: 'Ambos accesos',
      })
      .expect(200);
    await change('821', '1', '2', 'retiros').expect(200);
    await get('/api/lotes-vivero/' + loteA, 'ab').expect(403);
    await get('/api/lotes-vivero/' + loteB, 'ab').expect(200);
    expect(
      (await get('/api/v1/me/acceso-recoleccion', 'ab').expect(200)).body.data
        .acceso_efectivo,
    ).toBe(true);
    await change('820', '1', '1', 'retiros').expect(200);
    await get('/api/lotes-vivero/' + loteA).expect(403);
    await post('/api/recolecciones/1100/desecho')
      .send({ cantidad: 1 })
      .expect(403);
    await sql("UPDATE public.usuario SET rol='VOLUNTARIO' WHERE id=821");
    await get('/api/lotes-vivero/' + loteB, 'ab').expect(403);
    await sql(
      "UPDATE public.usuario SET rol='GENERAL',activo=false WHERE id=821",
    );
    await get('/api/v1/me/acceso-viveros', 'ab').expect(403);
    await sql('UPDATE public.usuario SET activo=true WHERE id=821');
    expect(
      (
        await get('/api/v1/me/acceso-viveros', 'ab').expect(200)
      ).body.data.viveros.map((v: any) => v.vivero_id),
    ).toEqual(['2']);
  });
});
