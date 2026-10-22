import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ParticipacionModule } from '../../src/participacion/participacion.module';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { configureGlobalRoutes } from '../../src/app.routes';
import { rpc, sql, token } from '../../scripts/qa/pa-int02d-harness';

/** Guard/controller/service y PostgreSQL reales. El único fallo simulado sucede
 * en el transporte después del commit para verificar recuperación durable. */
describe('INT07 motor/observaciones HTTP y RPC reales', () => {
  let app: INestApplication;
  let loseCommittedReply = false;
  let failBeforeWrite = false;
  let correctionCalls = 0;
  const cases: string[] = [];
  const operation = 'CORREGIR_OBSERVACIONES_PLANTACION';
  const body = (revision = '0', observaciones: string | null = 'TEXTO_PRIVADO_HTTP_INT07') => ({
    comando_id: randomUUID(), revision_esperada: revision,
    motivo: 'MOTIVO_PRIVADO_HTTP_INT07', observaciones,
  });
  const post = (record: number, value: Record<string, unknown>, actor = 800) =>
    request(app.getHttpServer()).post(`/api/v1/plantaciones/${record}/correcciones/observaciones`)
      .set('Authorization', token(actor)).send(value);
  const get = (path: string, actor = 800) =>
    request(app.getHttpServer()).get('/api/v1'+path).set('Authorization', token(actor));
  const recover = (key: string, actor = 800, op = operation) =>
    get('/participacion/comandos/'+key+'?operacion='+op, actor);
  const count = (record: number) => sql(`SELECT count(*) FROM public.registro_plantacion_correccion WHERE registro_plantacion_id=${record}`);
  beforeAll(async () => {
    const client = {rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'pa_correccion_ejecutar') {
        correctionCalls++;
        if (failBeforeWrite) {
          failBeforeWrite = false;
          return {data: null, error: {code: 'SINTETICO_RED_ANTES_DE_ESCRITURA'}};
        }
      }
      const result = await rpc(name, args);
      if (name === 'pa_correccion_ejecutar' && loseCommittedReply) {
        loseCommittedReply = false;
        return {data: null, error: {code: 'SINTETICO_RESPUESTA_PERDIDA_POSTCOMMIT'}};
      }
      return result;
    }};
    const module = await Test.createTestingModule({imports: [ParticipacionModule]})
      .overrideProvider(SupabaseService).useValue({
        getAdminClient: () => client,
        getClient: () => { throw new Error('Cliente público prohibido en QA INT07.'); },
      })
      .overrideProvider(ConfigService).useValue({get: () => 'pa-a-http-fixture'})
      .compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    await app.listen(0, '127.0.0.1');
  });
  afterEach(() => cases.push(expect.getState().currentTestName ?? ''));
  afterAll(async () => {
    await app?.close();
    const path = process.env.PA_INT07_EVIDENCE;
    if (!path || !path.endsWith('.json')) throw new Error('Falta evidencia aislada INT07.');
    const evidence = JSON.parse(readFileSync(path, 'utf8'));
    evidence.http_casos = cases;
    writeFileSync(path, JSON.stringify(evidence, null, 2)+'\n');
  });

  it('exige JWT verificado; headers no fabrican actor y cuenta inactiva no accede', async () => {
    const path = '/api/v1/plantaciones/922000/correcciones/observaciones';
    await request(app.getHttpServer()).post(path).set('x-user-role', 'ADMIN')
      .set('x-auth-id', 'a-http-800').send(body()).expect(401);
    await request(app.getHttpServer()).post(path).set('Authorization', token(801))
      .set('x-auth-id', 'a-http-800').send(body()).expect(401);
    await post(922000, body(), 805).expect(403);
    expect(await count(922000)).toBe('0');
  });

  it('rechaza campos y formas no permitidas antes de escribir; clave queda inconclusa', async () => {
    const value = body();
    const before = correctionCalls;
    const invalid = await post(922000, {...value, actor_id: '800'}).expect(422);
    expect(invalid.body.error.codigo).toBe('CAMPO_NO_PERMITIDO');
    await post(922000, {...value, revision_esperada: 0}).expect(422);
    await post(922000, {...value, observaciones: undefined}).expect(422);
    expect(correctionCalls).toBe(before);
    const missing = await recover(value.comando_id).expect(404);
    expect(missing.body.error.codigo).toBe('COMANDO_NO_CONFIRMADO');
    expect(missing.body.resultado_concluyente).toBe(false);
  });

  it('normaliza texto y confirma corrección durable; recibo mínimo no contiene textos privados', async () => {
    const value = body('0', ' A\u0301rbol corregido ');
    const response = await post(922000, value).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toContain('Authorization');
    expect(response.body.estado).toBe('CONFIRMADO');
    expect(response.body.resultado).toMatchObject({
      tipo: 'CORRECCION_PLANTACION', registro_plantacion_id: '922000',
      revision_anterior: '0', revision_nueva: '1',
      revision_grupo_anterior: '0', revision_grupo_nueva: '0', cambio: 'CAMBIO_APLICADO',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/rbol|MOTIVO_PRIVADO|observaciones|participantes|asignacion/);
    expect((await post(922000, value).expect(200)).body).toEqual(response.body);
    expect((await recover(value.comando_id).expect(200)).body).toEqual(response.body);
    expect(await count(922000)).toBe('1');
    const context = await get('/plantaciones/922000/contexto-correccion').expect(200);
    expect(context.body.data.original.observaciones).toBe('ORIGINAL_PRIVADO_INT07_922');
    expect(context.body.data.efectivo.observaciones).toBe('Árbol corregido');
    expect(context.body.data.capacidades.corregir_observaciones).toBe(true);
    const own = await get('/plantaciones/922000/detalle-propio', 801).expect(200);
    expect(own.body.data.observaciones_autor).toBe('Árbol corregido');
  });

  it('SIN_CAMBIOS conserva revisión/historia y vaciar observaciones confirma un cambio distinto', async () => {
    const same = await post(922000, body('1', 'Árbol corregido')).expect(200);
    expect(same.body.resultado).toMatchObject({correccion_id: null, cambio: 'SIN_CAMBIOS', revision_nueva: '1'});
    expect(await count(922000)).toBe('1');
    const cleared = await post(922000, body('1', '  ')).expect(200);
    expect(cleared.body.resultado.revision_nueva).toBe('2');
    const context = await get('/plantaciones/922000/contexto-correccion').expect(200);
    expect(context.body.data.efectivo.observaciones).toBeNull();
    expect(await count(922000)).toBe('2');
  });

  it('revisión obsoleta es rechazo durable; GET recupera el mismo rechazo con HTTP200', async () => {
    const value = body('0');
    const rejected = await post(922000, value).expect(409);
    expect(rejected.body.estado).toBe('RECHAZADO');
    expect(rejected.body.error.codigo).toBe('REVISION_OBSOLETA');
    expect((await post(922000, value).expect(409)).body).toEqual(rejected.body);
    expect((await recover(value.comando_id).expect(200)).body).toEqual(rejected.body);
    expect(await count(922000)).toBe('2');
  });

  it('historial paginado firma el cursor por actor/objeto y revalida privacidad', async () => {
    const first = await get('/plantaciones/922000/historial-correcciones?limite=1').expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.siguiente_cursor).toEqual(expect.any(String));
    const cursor = encodeURIComponent(first.body.siguiente_cursor);
    const second = await get('/plantaciones/922000/historial-correcciones?limite=1&cursor='+cursor).expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].correccion_id).not.toBe(first.body.data[0].correccion_id);
    expect(second.body.siguiente_cursor).toBeNull();
    await get('/plantaciones/922000/historial-correcciones?cursor='+cursor, 803).expect(422);
    await get('/plantaciones/923000/historial-correcciones?cursor='+cursor).expect(422);
    await get('/plantaciones/922000/historial-correcciones?cursor='+cursor+'x').expect(422);
    const contextual = await get('/plantaciones/910000/historial-correcciones', 802).expect(200);
    expect(contextual.body.data[0]).toMatchObject({motivo: null, observaciones_visibles: false,
      antes: {observaciones: null}, despues: {observaciones: null}});
    await get('/plantaciones/922000/contexto-correccion', 804).expect(404);
  });

  it('respuesta perdida tras commit devuelve503 y misma clave recupera un único cambio', async () => {
    const value = body();
    loseCommittedReply = true;
    const lost = await post(924000, value).expect(503);
    expect(lost.body).toMatchObject({comando_id: value.comando_id, resultado_concluyente: false,
      error: {codigo: 'RESULTADO_NO_DETERMINADO', reintento: 'MISMA_CLAVE'}});
    expect(await count(924000)).toBe('1');
    const recovered = await recover(value.comando_id).expect(200);
    expect(recovered.body.estado).toBe('CONFIRMADO');
    expect((await post(924000, value).expect(200)).body).toEqual(recovered.body);
    expect(await count(924000)).toBe('1');
  });

  it('fallo antes de escritura deja503/404 inconclusos y reenvío de misma clave resuelve', async () => {
    const value = body();
    failBeforeWrite = true;
    await post(925000, value).expect(503);
    const missing = await recover(value.comando_id).expect(404);
    expect(missing.body.resultado_concluyente).toBe(false);
    expect(await count(925000)).toBe('0');
    await post(925000, value).expect(200);
    expect(await count(925000)).toBe('1');
  });

  it('recibo propio sobrevive al retiro global; otro ADMIN no recupera recibos ajenos', async () => {
    const value = body();
    const confirmed = await post(926000, value, 9210).expect(200);
    const rolePayload = {usuario_destino_id: '9210', revision_esperada: '0',
      rol_global: 'VOLUNTARIO', motivo: 'Retiro sintético HTTP INT07'};
    const result = await rpc('pa_autoridad_ejecutar', {p_actor_id: '800', p_auth_id: 'a-http-800',
      p_operacion: 'CAMBIAR_ROL_GLOBAL', p_comando_id: randomUUID(), p_payload: rolePayload,
      p_contenido_canonico: JSON.stringify(rolePayload)});
    expect(result.data.body.estado).toBe('CONFIRMADO');
    expect((await post(926000, value, 9210).expect(200)).body).toEqual(confirmed.body);
    expect((await recover(value.comando_id, 9210).expect(200)).body).toEqual(confirmed.body);
    await recover(value.comando_id, 800).expect(404);
    await get('/plantaciones/926000/contexto-correccion', 9210).expect(404);
    expect((await post(926000, body('1'), 9210)).status).toBe(404);
    expect(await count(926000)).toBe('1');
  });

  it('recuperación202 inicial mantiene Retry-After y no crea preparaciones para corrección', async () => {
    const key = randomUUID();
    const prepared = await rpc('pa_cargas_operar', {p_actor_id: '800', p_auth_id: 'a-http-800',
      p_accion: 'PREPARAR', p_comando_id: key, p_payload: {subcampania_id: '923'}});
    expect(prepared.data.http_status).toBe(200);
    const response = await recover(key, 800, 'REGISTRAR_PLANTACION_INICIAL').expect(202);
    expect(response.headers['retry-after']).toBe('2');
    expect(response.body.estado).toBe('SIN_RESULTADO');
    expect(await sql("SELECT count(*) FROM public.participacion_comando WHERE operacion='CORREGIR_OBSERVACIONES_PLANTACION' AND estado='PREPARADO'")).toBe('0');
    const unsupported = await get('/participacion/comandos/'+key+'?operacion=REVERTIR_BAJA_PLANTACION').expect(422);
    expect(unsupported.body.resultado_concluyente).toBe(false);
  });
});
