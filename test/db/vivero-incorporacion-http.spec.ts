import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { EvidenceFileService } from '../../src/common/files/evidence-file.service';
import { ViveroIncorporacionService } from '../../src/lotes-vivero/application/vivero-incorporacion.service';
import { ViveroEvidenciasService } from '../../src/lotes-vivero/application/vivero-evidencias.service';
import { ViveroAuthService } from '../../src/lotes-vivero/application/vivero-auth.service';
import { ViveroIncorporacionController } from '../../src/lotes-vivero/api/vivero-incorporacion.controller';
import { InternalActorGuard } from '../../src/auth/internal-actor.guard';
import { PlantacionesController } from '../../src/plantaciones/api/plantaciones.controller';
import { PlantacionesService } from '../../src/plantaciones/application/plantaciones.service';
import { PlantacionCreationService } from '../../src/plantaciones/application/plantacion-creation.service';
import { PlantacionAuthService } from '../../src/plantaciones/application/plantacion-auth.service';
import { PlantacionEvidenciasService } from '../../src/plantaciones/application/plantacion-evidencias.service';
import { ParticipacionImagenService } from '../../src/participacion/cargas/participacion-imagen.service';
import { ParticipacionRegistroController } from '../../src/participacion/participacion-registro.controller';
import { ParticipacionRegistroService } from '../../src/participacion/application/participacion-registro.service';
import { configureGlobalRoutes } from '../../src/app.routes';

// Transporte local acotado; nunca carga .env ni conecta Supabase/Storage real.
const run = promisify(execFile);
const literal = (v: unknown): string => v == null ? 'NULL' : "'" +
  (typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/'/g, "''") + "'";
async function sql(statement: string): Promise<string> {
  if (!/^\/(private\/)?tmp\/t5-incorporacion-[^/]+\/socket$/.test(process.env.T5_DB_SOCKET || ''))
    throw new Error('Solo clúster privado T5');
  const { stdout } = await run(process.env.T5_DB_PSQL!, ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-h', process.env.T5_DB_SOCKET!, '-p', process.env.T5_DB_PORT!, '-U', 'postgres', '-d', 'postgres', '-c', statement],
    { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG'))) });
  return stdout.trim();
}
async function transport(statement: string) {
  return JSON.parse(await sql(`SET ROLE service_role; SELECT public.t5_http_transport(${literal(statement)})`));
}
let lostRpc: string | null = null;
let throwAfterRpc: string | null = null;
let publicBucket = false;
const uploads: Array<{ bucket: string; path: string }> = [];
const removed: string[] = [];
const client = {
  rpc: (name: string, args: Record<string, unknown>) => {
    if (!/^(m2_incorporacion_(crear|recuperar|evidencias_preparar)|m2_incorporacion_evidencias_leer|m2_ambitos|pa_actor_verificar|fn_m3_registrar_plantacion_exacto|pa_d_evidencias_reposicion_exacto|pa_registro_procedencia_propia_leer)$/.test(name))
      throw new Error('RPC fuera de fixture: ' + name);
    const pending = (async () => {
      const setof = name === 'fn_m3_registrar_plantacion_exacto';
      const result = await transport(`SELECT ${setof ? 'to_jsonb(t) FROM ' : ''}public.${name}(${Object.entries(args).map(([k, v]) => k + '=>' +
        (name === 'fn_m3_registrar_plantacion_exacto' && k.endsWith('_ids') && Array.isArray(v) ? literal('{' + v.join(',') + '}') : literal(v))).join(',')})${setof ? ' t' : ''}`);
      if (throwAfterRpc === name) { throwAfterRpc = null; throw new Error('Transporte interrumpido después decommit'); }
      if (lostRpc === name) { lostRpc = null; return { data: null, error: { code: 'RED_SIMULADA' } }; }
      return result;
    })();
    return Object.assign(pending, { single: () => pending });
  },
  from: (table: string) => {
    if (!['usuario', 'tipos_entidad_evidencia', 'evidencias_trazabilidad'].includes(table))
      throw new Error('Tabla fuera de fixture: ' + table);
    const conditions: string[] = [];
    let selection = '*';
    const execute = async (single = false) => {
      const casts = [...selection.matchAll(/\b([a-z_]+)::text\b/g)].map((m) => m[1]);
      const exact = casts.length ? ` || jsonb_build_object(${casts.map((c) => literal(c) + ',t.' + c + '::text').join(',')})` : '';
      const result = await transport(`SELECT coalesce(jsonb_agg(to_jsonb(t)${exact}),'[]'::jsonb) FROM public.${table} t` +
        (conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''));
      return result.error ? result : { data: single ? result.data[0] ?? null : result.data, error: null };
    };
    const builder = {
      select: (value: string) => { selection = value; return builder; },
      eq: (key: string, value: unknown) => { conditions.push(key + '=' + literal(value)); return builder; },
      ilike: (key: string, value: string) => { conditions.push(key + ' ILIKE ' + literal(value)); return builder; },
      in: (key: string, value: unknown[]) => { conditions.push(key + ' IN (' + value.map(literal).join(',') + ')'); return builder; },
      single: () => execute(true), maybeSingle: () => execute(true),
      then: (yes: (x: any) => any, no: (e: unknown) => any) => execute().then(yes, no),
    };
    return builder;
  },
  storage: {
    getBucket: async (bucket: string) => ({ data: { id: bucket, public: publicBucket }, error: null }),
    from: (bucket: string) => ({
      upload: async (path: string) => { uploads.push({ bucket, path }); return { data: { id: randomUUID() }, error: null }; },
      remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; },
      createSignedUrl: async (path: string, seconds: number) => ({ data: { signedUrl: `https://private.invalid/${path}?expires=${seconds}` }, error: null }),
      getPublicUrl: () => { throw new Error('No URL pública en incorporación'); },
    }),
  },
};
const jwt = new JwtService({ secret: 'solo-fixture-t5-no-productivo' });
const auth = (user = 'fixture-t2-operario') => ({ Authorization: 'Bearer ' + jwt.sign({ sub: user }, { expiresIn: '1h' }) });
let app: INestApplication;
let day: string;
const base = '/api/lotes-vivero/incorporaciones';
async function photos(key: string, actor = 'fixture-t2-operario') {
  return request(app.getHttpServer()).post(`${base}/${key}/evidencias-pendientes`).set(auth(actor)).field('vivero_id', '1')
    .attach('fotos', Buffer.from('fixture-imagen-sintetica'), { filename: 'foto.jpg', contentType: 'image/jpeg' });
}
async function body(actor = 'fixture-t2-operario') {
  const key = randomUUID(); const foto = await photos(key, actor); expect(foto.status).toBe(201);
  expect(foto.body.data[0].signed_url).toContain('private.invalid');
  expect(foto.body.data[0].public_url).toBeUndefined();
  return { solicitud_id: key, vivero_id: '1', planta_id: '1', modalidad: 'RECEPCION', procedencia: 'COMPRA',
    cantidad: 100, fecha_evento: day, evidencia_ids: foto.body.evidencia_ids };
}
beforeAll(async () => {
  const m = await Test.createTestingModule({ controllers: [ViveroIncorporacionController, PlantacionesController, ParticipacionRegistroController], providers: [
    ViveroIncorporacionService, ViveroEvidenciasService, ViveroAuthService, EvidenceFileService, VerifiedActorGuard,
    InternalActorGuard, PlantacionesService, PlantacionCreationService, PlantacionAuthService, ParticipacionRegistroService,
    PlantacionEvidenciasService,
    { provide: ParticipacionImagenService, useValue: {} },
    { provide: SupabaseService, useValue: { getAdminClient: () => client, getClient: () => { throw new Error('Sin fallback público'); } } },
    { provide: JwtService, useValue: jwt }, { provide: ConfigService, useValue: { get: (k: string) => k === 'JWT_SECRET' ? 'solo-fixture-t5-no-productivo' : undefined } },
  ] }).compile();
  app = m.createNestApplication(); configureGlobalRoutes(app);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init(); day = await sql("SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date");
});
afterAll(async () => { await app?.close(); });

test('JWT verificado, cuenta activa, M2 por vivero y actor de sesión', async () => {
  await request(app.getHttpServer()).get(`${base}/${randomUUID()}`).set('x-auth-id', 'fixture-admin').set('x-user-role', 'ADMIN').expect(401);
  await request(app.getHttpServer()).get(`${base}/${randomUUID()}`).set(auth()).set('x-auth-id', 'fixture-admin').expect(401);
  await request(app.getHttpServer()).get(`${base}/${randomUUID()}`).set(auth('fixture-inactivo')).expect(403);
  for (const actor of ['fixture-t2-m1', 'fixture-t2-sin-vivero', 'fixture-voluntario']) {
    expect((await photos(randomUUID(), actor)).status).toBe(403);
  }
  const b = await body();
  await request(app.getHttpServer()).post(base).set(auth()).send({ ...b, responsable_id: '1' }).expect(400);
  const r = await request(app.getHttpServer()).post(base).set(auth()).send(b).expect(201);
  expect(r.headers['cache-control']).toContain('no-store');
  expect(await sql(`SELECT responsable_id FROM public.evento_lote_vivero WHERE id=${r.body.data.evento_incorporacion_id}`)).toBe('20');
});
test('alta, replay, recuperación exacta, conflicto e aislamiento entre actores', async () => {
  const b = await body(); const n = uploads.length;
  const r = await request(app.getHttpServer()).post(base).set(auth()).send(b).expect(201);
  const replay = await request(app.getHttpServer()).post(base).set(auth()).send(b).expect(201);
  expect(replay.body).toEqual(r.body); expect(uploads).toHaveLength(n);
  const got = await request(app.getHttpServer()).get(`${base}/${b.solicitud_id}`).set(auth()).expect(200);
  expect(got.body).toEqual(r.body);
  await request(app.getHttpServer()).post(base).set(auth()).send({ ...b, cantidad: 101 }).expect(409);
  await request(app.getHttpServer()).get(`${base}/${b.solicitud_id}`).set(auth('fixture-t2-ambos')).expect(403);
});
test('respuesta perdida trascommit conservaUUID y recupera éxito sin otra alta', async () => {
  const b = await body(); lostRpc = 'm2_incorporacion_crear';
  const lost = await request(app.getHttpServer()).post(base).set(auth()).send(b).expect(503);
  expect(lost.body.error.resultado_concluyente).toBe(false);
  const got = await request(app.getHttpServer()).get(`${base}/${b.solicitud_id}`).set(auth()).expect(200);
  expect(got.body.estado).toBe('CONFIRMADO');
  await request(app.getHttpServer()).post(base).set(auth()).send(b).expect(201);
  expect(await sql(`SELECT count(*) FROM public.vivero_incorporacion WHERE solicitud_id=${literal(b.solicitud_id)}`)).toBe('1');
  const none = await request(app.getHttpServer()).get(`${base}/${randomUUID()}`).set(auth()).expect(200);
  expect(none.body).toEqual({ success: true, estado: 'SIN_RESULTADO', resultado_concluyente: false });
});
test('Storage privado falla cerrado; carga incierta no borra objeto ni acredita ingreso', async () => {
  publicBucket = true; const before = uploads.length;
  expect((await photos(randomUUID())).status).toBe(500); expect(uploads).toHaveLength(before); publicBucket = false;
  const key = randomUUID(); const cleanups = removed.length; lostRpc = 'm2_incorporacion_evidencias_preparar';
  expect((await photos(key)).status).toBe(503); expect(removed).toHaveLength(cleanups);
  expect(await sql(`SELECT count(*) FROM public.m2_evidencia_contexto WHERE solicitud_id=${literal(key)}`)).toBe('1');
  expect(await sql(`SELECT count(*) FROM public.vivero_incorporacion WHERE solicitud_id=${literal(key)}`)).toBe('0');
  const pending = await request(app.getHttpServer()).get(`${base}/${key}/evidencias-pendientes?vivero_id=1`).set(auth()).expect(200);
  expect(pending.body.evidencia_ids).toHaveLength(1);
  expect(pending.body.data[0].signed_url).toContain('private.invalid');
  const other = await request(app.getHttpServer()).get(`${base}/${key}/evidencias-pendientes?vivero_id=1`).set(auth('fixture-t2-ambos')).expect(200);
  expect(other.body.evidencia_ids).toEqual([]);
});
test('GENERALM2 sinM1 incorpora; combina modalidad/procedencia y protege cantidades/fechas', async () => {
  expect(await sql('SELECT public.m1_acceso_efectivo(20)')).toBe('f');
  const b = await body();
  for (const extra of [{ procedencia: 'PRODUCCION_PROPIA' }, { cantidad: 1.5 }, { cantidad: 0 }, { fecha_evento: '2099-01-01' }, { evidencia_ids: [] }])
    await request(app.getHttpServer()).post(base).set(auth()).send({ ...b, ...extra }).expect(400);
  const saldo = await request(app.getHttpServer()).post(base).set(auth()).send({ ...b, modalidad: 'SALDO_INICIAL', procedencia: 'DESCONOCIDA', observaciones: 'Historia previa no registrada.', cantidad: 210 }).expect(201);
  expect(saldo.body.data.cantidad).toBe(210);
});
test('excepción de transporte después de confirmar foto conservaobjeto y devuelve503 recuperable', async () => {
  const key = randomUUID(); const cleanups = removed.length;
  throwAfterRpc = 'm2_incorporacion_evidencias_preparar';
  const failed = await photos(key);
  expect(failed.status).toBe(503); expect(removed).toHaveLength(cleanups);
  const pending = await request(app.getHttpServer()).get(`${base}/${key}/evidencias-pendientes?vivero_id=1`).set(auth()).expect(200);
  expect(pending.body.evidencia_ids).toHaveLength(1);
  expect(await sql(`SELECT count(*) FROM public.vivero_incorporacion WHERE solicitud_id=${literal(key)}`)).toBe('0');
});

test('HTTP reposición conserva BIGINT vecinos y consume DONACION exacta con procedencia propia103', async () => {
  const fixture = process.env.T5_HTTP_BIGINT_FIXTURE;
  if (!fixture) {
    expect(process.env.T5_HTTP_POSTGIS).not.toBe('true');
    return;
  }
  const f = JSON.parse(fixture);
  const before = JSON.parse(await sql(`SELECT jsonb_build_object('m1',(SELECT saldo_actual FROM public.recoleccion WHERE id=100),
    'm2',(SELECT jsonb_agg(jsonb_build_array(id::text,saldo_vivo_actual) ORDER BY id) FROM public.lote_vivero WHERE id IN (${f.compra_lote},${f.donacion_lote})),
    'consumida_compra',(SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=${f.compra_asignacion}),
    'consumida_donacion',(SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=${f.donacion_asignacion}))`));
  expect(f.compra_lote).toBe('9007199255741000');
  expect(f.donacion_lote).toBe('9007199255741001');
  const payload = { subcampania_id: '61', es_reposicion: true, registro_plantacion_origen_id: '4000',
    fecha_plantacion: day, latitud: -16.5, longitud: -68.1, detalles: [{ asignacion_id: f.donacion_asignacion,
      lote_vivero_id: f.donacion_lote, planta_id: '1', cantidad: 1 }], evidencia_ids: [f.evidencia_id], coresponsable_ids: [] };
  // Los números JSON inseguros no pueden recuperar la intención que se perdió al redondear.
  await request(app.getHttpServer()).post('/api/registros-plantacion').set(auth('fixture-t2-m1'))
    .send({ ...payload, detalles: [{ ...payload.detalles[0], asignacion_id: Number(f.donacion_asignacion) }] }).expect(400);
  const registered = await request(app.getHttpServer()).post('/api/registros-plantacion').set(auth('fixture-t2-m1')).send(payload).expect(201);
  expect(registered.body.data.gps_dentro_poligono).toBe(true);
  expect(registered.body.data.consumos).toHaveLength(1);
  expect(registered.body.data.consumos[0].asignacion_id).toBe(f.donacion_asignacion);
  expect(registered.body.data.consumos[0].lote_vivero_id).toBe(f.donacion_lote);
  const rid = registered.body.data.registro_plantacion_id;
  const own = await request(app.getHttpServer()).get(`/api/v1/plantaciones/${rid}/procedencia-propia`).set(auth('fixture-t2-m1')).expect(200);
  expect(own.body.data.consumos[0].origen.procedencia).toBe('DONACION');
  expect(own.body.data.consumos[0].lote_vivero_id).toBe(f.donacion_lote);
  expect(own.body.data.consumos[0].asignacion_id).toBe(f.donacion_asignacion);
  expect(own.body.data.consumos[0].cantidad).toBe(1);
  const after = JSON.parse(await sql(`SELECT jsonb_build_object('m1',(SELECT saldo_actual FROM public.recoleccion WHERE id=100),
    'm2',(SELECT jsonb_agg(jsonb_build_array(id::text,saldo_vivo_actual) ORDER BY id) FROM public.lote_vivero WHERE id IN (${f.compra_lote},${f.donacion_lote})),
    'consumida_compra',(SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=${f.compra_asignacion}),
    'consumida_donacion',(SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=${f.donacion_asignacion}))`));
  expect(after.m1).toEqual(before.m1); expect(after.m2).toEqual(before.m2);
  expect(after.consumida_compra).toBe(before.consumida_compra);
  expect(after.consumida_donacion).toBe(before.consumida_donacion + 1);
});

test('HTTP descarte079/106 conserva IDs vecinos exactos y elimina sólo la foto solicitada', async () => {
  const fixture = process.env.T5_HTTP_BIGINT_FIXTURE;
  if (!fixture) { expect(process.env.T5_HTTP_POSTGIS).not.toBe('true'); return; }
  const f = JSON.parse(fixture);
  expect(f.foto_vecina_id).toBe('9007199256741000');
  expect(f.foto_descartar_id).toBe('9007199256741001');
  const response = await request(app.getHttpServer()).delete('/api/registros-plantacion/evidencias-pendientes')
    .set(auth('fixture-t2-m1')).send({ subcampania_id: '61', es_reposicion: true, evidencia_ids: [f.foto_descartar_id] }).expect(200);
  expect(response.body.data.evidencia_ids_descartadas).toEqual([f.foto_descartar_id]);
  expect(response.body.data.evidencia_ids_ignoradas).toEqual([]);
  expect(response.headers['cache-control']).toContain('no-store');
  expect(await sql(`SELECT eliminado_en IS NULL FROM public.evidencias_trazabilidad WHERE id=${f.foto_vecina_id}`)).toBe('t');
  expect(await sql(`SELECT eliminado_en IS NOT NULL FROM public.evidencias_trazabilidad WHERE id=${f.foto_descartar_id}`)).toBe('t');
});
