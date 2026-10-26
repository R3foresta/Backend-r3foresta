import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ParticipacionModule } from '../../src/participacion/participacion.module';
import { ImpactModule } from '../../src/impact/impact.module';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { configureGlobalRoutes } from '../../src/app.routes';
import { rpc, sql, token, jwt } from '../../scripts/qa/pa-int02d-harness';

/** QA sintético: aplicación, autorización y RPC reales. Transporte psql privado;
 * los fallos de red se inyectan antes de escribir o después del commit. */
describe('INT07 participantes y lecturas con PostgreSQL real', () => {
  let app: INestApplication;
  let loseAfterCommit = false;
  let failBeforeWrite = false;
  let correctionCalls = 0;
  let initialCalls = 0;
  const cases: string[] = [];
  const operation = 'CORREGIR_PARTICIPANTES_PLANTACION';
  const body = (revision = '0', coresponsable_ids = ['9312', '9313']) => ({
    comando_id: randomUUID(), revision_esperada: revision,
    motivo: 'MOTIVO_PRIVADO_HTTP_PART', coresponsable_ids,
  });
  const post = (record: number, value: Record<string, unknown>, actor = 9301) =>
    request(app.getHttpServer()).post(`/api/v1/plantaciones/${record}/correcciones/participantes`)
      .set('Authorization', token(actor)).send(value);
  const get = (path: string, actor?: number) => {
    const req = request(app.getHttpServer()).get('/api/v1'+path);
    return actor === undefined ? req : req.set('Authorization', token(actor));
  };
  const recover = (key: string, actor = 9301) =>
    get('/participacion/comandos/'+key+'?operacion='+operation, actor);
  const historyCount = (record: number) => sql(`SELECT count(*) FROM public.registro_plantacion_correccion WHERE registro_plantacion_id=${record}`);
  const literal = (value: unknown): string => value === null || value === undefined ? 'NULL' :
    "'"+(typeof value === 'object' ? JSON.stringify(value) : String(value)).replace(/'/g, "''")+"'";
  // Misma frontera de tablas sintéticas que el harnessD; no emula políticas.
  // Las consultas/guards/RPC pertenecen a los módulos reales importados.
  const table = (name: string): any => {
    if (!/^[a-z_]+$/.test(name)) throw new Error('tabla fixture');
    const where: string[] = []; const order: string[] = [];
    let size = 1000; let offset = 0; let single = false;
    const column = (field: string) => {
      if (!/^[a-z_]+$/.test(field)) throw new Error('columna fixture');
      return 't.'+field;
    };
    const q: any = {select: () => q,
      eq: (c: string, v: unknown) => {where.push(column(c)+'='+literal(v)); return q;},
      neq: (c: string, v: unknown) => {where.push(column(c)+'<>'+literal(v)); return q;},
      is: (c: string, v: unknown) => {where.push(column(c)+(v === null ? ' IS NULL' : '='+literal(v))); return q;},
      gt: (c: string, v: unknown) => {where.push(column(c)+'>'+literal(v)); return q;},
      ilike: (c: string, v: string) => {where.push(column(c)+' ILIKE '+literal(v)); return q;},
      in: (c: string, v: unknown[]) => {where.push(column(c)+' IN ('+(v.length ? v.map(literal).join(',') : 'NULL')+')'); return q;},
      not: (c: string, op: string, v: unknown) => {
        if (op === 'is' && v === null) where.push(column(c)+' IS NOT NULL');
        else if (op === 'like') where.push(column(c)+' NOT LIKE '+literal(v));
        else throw new Error('not fixture');
        return q;
      },
      or: (value: string) => {if (value !== 'entidad_id.is.null,entidad_id.gt.0') throw new Error('or fixture'); where.push('(t.entidad_id IS NULL OR t.entidad_id>0)'); return q;},
      order: (c: string, o?: {ascending?: boolean}) => {order.push(column(c)+(o?.ascending === false ? ' DESC' : ' ASC')); return q;},
      range: (a: number, b: number) => {offset = a; size = b-a+1; return q;},
      limit: (n: number) => {size = n; return q;},
      single: () => {single = true; return q;}, maybeSingle: () => {single = true; return q;},
      then: (resolve: any, reject: any) => sql("SET ROLE service_role; SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT t.* FROM public."+name+' t'+
        (where.length ? ' WHERE '+where.join(' AND ') : '')+(order.length ? ' ORDER BY '+order.join(',') : '')+' LIMIT '+size+' OFFSET '+offset+')x')
        .then(value => {const rows = JSON.parse(value); return {data: single ? rows[0] ?? null : rows, error: null, count: rows.length};}).then(resolve, reject),
    };
    return q;
  };
  beforeAll(async () => {
    const client = {from: table, rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'pa_registro_inicial_ejecutar') initialCalls++;
      if (name === 'pa_correccion_ejecutar') {
        correctionCalls++;
        if (failBeforeWrite) {failBeforeWrite = false; return {data: null, error: {code: 'SINTETICO_RED_ANTES'}};}
      }
      const result = await rpc(name, args);
      if (name === 'pa_correccion_ejecutar' && loseAfterCommit) {
        loseAfterCommit = false;
        return {data: null, error: {code: 'SINTETICO_RED_POSTCOMMIT'}};
      }
      return result;
    }};
    const module = await Test.createTestingModule({imports: [ConfigModule.forRoot({isGlobal: true, ignoreEnvFile: true}), ParticipacionModule, ImpactModule]})
      .overrideProvider(SupabaseService).useValue({getAdminClient: () => client,
        getClient: () => {throw new Error('Cliente público prohibido en QA PART.');}})
      .overrideProvider(ConfigService).useValue({get: (key: string) =>
        key === 'PARTICIPACION_INICIAL_ESCRITURA_HABILITADA' ? 'false' : 'pa-a-http-fixture'})
      .compile();
    app = module.createNestApplication(); configureGlobalRoutes(app);
    await app.listen(0, '127.0.0.1');
  });
  afterEach(() => {cases.push(expect.getState().currentTestName ?? '');});
  afterAll(async () => {
    await app?.close();
    const path = process.env.PA_INT07_PARTICIPANTES_EVIDENCE;
    if (!path) throw new Error('Falta evidencia aislada participantes.');
    const evidence = JSON.parse(readFileSync(path, 'utf8'));
    evidence.http_casos = cases;
    writeFileSync(path, JSON.stringify(evidence, null, 2)+'\n');
  });

  it('exige JWT y DTO cerrado; no acepta IDs numéricos, duplicados, responsable ni autoridad de headers', async () => {
    const path = '/api/v1/plantaciones/961000/correcciones/participantes';
    await request(app.getHttpServer()).post(path).set('x-auth-id', 'a-http-9301').set('x-user-role', 'ADMIN').send(body()).expect(401);
    const before = correctionCalls;
    await post(961000, {...body(), rol: 'ADMIN'}).expect(422);
    await post(961000, {...body(), coresponsable_ids: [9312]}).expect(422);
    await post(961000, body('0', ['9312', '9312'])).expect(422);
    expect(correctionCalls).toBe(before);
    await post(961000, body(), 9303).expect(404);
    const responsible = await post(961000, body('0', ['801'])).expect(422);
    expect(responsible.body.error.codigo).toBe('CASO_NO_SOPORTADO');
  });

  it('ADMIN contextual cambia set incluyendo inactiva y devuelve recibo mínimo recuperable', async () => {
    await get('/plantaciones/961000/detalle-propio', 9310).expect(200);
    const value = body('0', ['9313', '9312']);
    const response = await post(961000, value).expect(200);
    expect(response.body.resultado).toMatchObject({caso: 'PARTICIPANTES', cambio: 'CAMBIO_APLICADO',
      revision_anterior: '0', revision_nueva: '1', revision_grupo_nueva: '0'});
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toContain('Authorization');
    expect(JSON.stringify(response.body)).not.toMatch(/MOTIVO_PRIVADO|coresponsable_ids|nombre_snapshot|participantes/);
    expect((await post(961000, value).expect(200)).body).toEqual(response.body);
    expect((await recover(value.comando_id).expect(200)).body).toEqual(response.body);
    expect(await historyCount(961000)).toBe('1');
    await get('/plantaciones/961000/estado-propio', 9313).expect(403);
    const state = await get('/plantaciones/961000/estado-propio', 9312).expect(200);
    const added = state.body.data.participantes.find((p: any) => p.usuario_id === '9312');
    expect(added).toMatchObject({procedencia: 'ALTA_CORRECCION', nombre_snapshot: null,
      afiliacion_estado: 'HISTORICA_NO_DISPONIBLE', organizacion_id_snapshot: null});
    expect(added.nombre_capturado_correccion).toEqual(expect.any(String));
    expect(added.capturado_en).toEqual(expect.any(String));
    expect(await sql('SELECT activo FROM public.usuario WHERE id=9313')).toBe('f');
  });

  it('P01 retira todos los detalles/listas/historias propios y conserva lectura del autor', async () => {
    for (const path of ['/detalle-propio', '/estado-propio', '/historial-propio'])
      await get('/plantaciones/961000'+path, 9310).expect(404);
    const own = await get('/plantaciones/mis-registros?limite=100', 9310).expect(200);
    expect(own.body.data.registros.map((r: any) => r.id)).not.toContain('961000');
    const states = await get('/plantaciones/mis-registros/estado?limite=50', 9310).expect(200);
    expect(states.body.data.map((r: any) => r.registro_plantacion_id)).not.toContain('961000');
    await get('/plantaciones/961000/detalle-propio', 801).expect(200);
    const reduced = await get('/plantaciones/961000/historial-propio', 9312).expect(200);
    expect(reduced.body.data).toHaveLength(1);
    expect(Object.keys(reduced.body.data[0]).sort()).toEqual(['actor', 'caso', 'correccion_id', 'fecha', 'revision_anterior', 'revision_nueva']);
    await get('/plantaciones/961000/historial-correcciones', 9312).expect(404);
  });

  it('restauración reutiliza snapshots; SIN_CAMBIOS y obsoleta conservan revisión/terminal', async () => {
    const same = await post(961000, body('1')).expect(200);
    expect(same.body.resultado).toMatchObject({cambio: 'SIN_CAMBIOS', correccion_id: null, revision_nueva: '1'});
    await post(961000, body('1', ['9310', '9311']), 800).expect(200);
    await get('/plantaciones/961000/detalle-propio', 9310).expect(200);
    await get('/plantaciones/961000/estado-propio', 9312).expect(404);
    const value = body('1');
    const stale = await post(961000, value).expect(409);
    expect(stale.body.error.codigo).toBe('REVISION_OBSOLETA');
    expect((await recover(value.comando_id).expect(200)).body).toEqual(stale.body);
    const state = await get('/plantaciones/961000/estado-propio', 9310).expect(200);
    const restored = state.body.data.participantes.find((p: any) => p.usuario_id === '9310');
    expect(restored).toMatchObject({procedencia: 'RESTAURACION', capturado_en: null,
      nombre_snapshot: 'Nombre histórico original INT07', nombre_capturado_correccion: null,
      organizacion_id_snapshot: '1'});
  });

  it('historial administrativo pagina con cursor firmado por actor/objeto y conserva audiencias', async () => {
    const first = await get('/plantaciones/961000/historial-correcciones?limite=1', 9301).expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.data[0].caso).toBe('PARTICIPANTES');
    const cursor = encodeURIComponent(first.body.siguiente_cursor);
    const second = await get('/plantaciones/961000/historial-correcciones?limite=1&cursor='+cursor, 9301).expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].correccion_id).not.toBe(first.body.data[0].correccion_id);
    await get('/plantaciones/961000/historial-correcciones?cursor='+cursor, 9302).expect(422);
    await get('/plantaciones/962000/historial-correcciones?cursor='+cursor, 9301).expect(422);
  });

  it('selector histórico exige filtro, incluye inactivos y firma cursor por consulta/registro/actor', async () => {
    const route = '/plantaciones/962000/participantes-historicos-seleccionables';
    await get(route, 9301).expect(422);
    await get(route+'?q=al', 9301).expect(422);
    await get(route+'?q=Alta&limite=51', 9301).expect(422);
    const exact = await get(route+'?q=9313', 9301).expect(200);
    expect(exact.body.data).toEqual([{usuario_id: '9313', nombre_actual: 'Alta inactiva INT07', activo: false, relacion_historica: 'SIN_RELACION'}]);
    const first = await get(route+'?q=Alta&limite=1', 9301).expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.siguiente_cursor).toEqual(expect.any(String));
    const cursor = encodeURIComponent(first.body.siguiente_cursor);
    const second = await get(route+'?q=Alta&limite=1&cursor='+cursor, 9301).expect(200);
    expect(second.body.data[0].usuario_id).not.toBe(first.body.data[0].usuario_id);
    await get(route+'?q=Alta&cursor='+cursor, 9302).expect(422);
    await get(route+'?q=Original&cursor='+cursor, 9301).expect(422);
    await get('/plantaciones/963000/participantes-historicos-seleccionables?q=Alta&cursor='+cursor, 9301).expect(422);
    expect((await get(route+'?q=%25%25%25', 9301).expect(200)).body.data).toEqual([]);
    expect(JSON.stringify(exact.body)).not.toMatch(/contacto|correo|organizacion|wallet|doc_identidad|auth_id/);
    await get(route+'?q=9313', 9310).expect(404);
  });

  it('respuesta perdida después del commit conserva una corrección y misma clave recupera resultado', async () => {
    const value = body(); loseAfterCommit = true;
    const lost = await post(963000, value).expect(503);
    expect(lost.body).toMatchObject({resultado_concluyente: false,
      error: {codigo: 'RESULTADO_NO_DETERMINADO', reintento: 'MISMA_CLAVE'}});
    expect(await historyCount(963000)).toBe('1');
    const recovered = await recover(value.comando_id).expect(200);
    expect(recovered.body.estado).toBe('CONFIRMADO');
    expect((await post(963000, value).expect(200)).body).toEqual(recovered.body);
    expect(await historyCount(963000)).toBe('1');
  });

  it('503 antes de escribir y404 de recuperación son inconclusos; reenvío conserva intención', async () => {
    const value = body(); failBeforeWrite = true;
    await post(964000, value).expect(503);
    const missing = await recover(value.comando_id).expect(404);
    expect(missing.body).toMatchObject({resultado_concluyente: false,
      error: {codigo: 'COMANDO_NO_CONFIRMADO', reintento: 'MISMA_CLAVE'}});
    expect(await historyCount(964000)).toBe('0');
    await post(964000, value).expect(200);
    expect(await historyCount(964000)).toBe('1');
  });

  it('replay propio precede al retiro contextual sin dar nuevas lecturas/escrituras ni recibos ajenos', async () => {
    const value = body(); const before = await post(965000, value).expect(200);
    const p = {usuario_destino_id: '9301', ambitos: [{subcampania_id: '965', revision_esperada: '1'}]};
    const retired = await rpc('pa_acceso_ejecutar', {p_actor_id: '800', p_auth_id: 'a-http-800',
      p_operacion: 'RETIRAR_ADMINISTRADOR', p_comando_id: randomUUID(), p_payload: p,
      p_contenido_canonico: JSON.stringify(p)});
    expect(retired.data.body.estado).toBe('CONFIRMADO');
    expect((await post(965000, value).expect(200)).body).toEqual(before.body);
    expect((await recover(value.comando_id).expect(200)).body).toEqual(before.body);
    await recover(value.comando_id, 800).expect(404);
    await get('/plantaciones/965000/contexto-correccion', 9301).expect(404);
    await get('/plantaciones/965000/historial-correcciones', 9301).expect(404);
    await post(965000, body('1', []), 9301).expect(404);
  });

  it('público actualiza personas sin multiplicar hechos; métricas/mapa/aliases conservan cantidades y fotos', async () => {
    const scopeBefore = await get('/impact/subcampanias/966').expect(200);
    const detailBefore = await get('/impact/registros/966000').expect(200);
    const aliases = ['/impact/organizations/1/dashboard', '/impact/organizations/1/campaigns/800',
      '/impact/organizations/1/monitoring-timeline', '/impact/organizations/1/evidence'];
    const before = [];
    for (const path of aliases) before.push((await get(path).expect(200)).body.data);
    await post(966000, body()).expect(200);
    const scopeAfter = await get('/impact/subcampanias/966').expect(200);
    const detailAfter = await get('/impact/registros/966000').expect(200);
    expect(scopeAfter.body.data.indicadores).toEqual(scopeBefore.body.data.indicadores);
    expect(scopeAfter.body.data.mapa).toEqual(scopeBefore.body.data.mapa);
    expect(scopeAfter.body.data.subcampanias).toEqual(scopeBefore.body.data.subcampanias);
    expect(detailAfter.body.data.cantidad_total_plantada).toBe(detailBefore.body.data.cantidad_total_plantada);
    expect(detailAfter.body.data.personas).toHaveLength(3);
    expect(detailAfter.body.data.personas.filter((p: any) => !p.es_responsable)).toEqual([
      {nombre: null, es_responsable: false, afiliacion: {estado: 'HISTORICA_NO_DISPONIBLE', tipo: null, nombre: null, organizacion_id: null}},
      {nombre: null, es_responsable: false, afiliacion: {estado: 'HISTORICA_NO_DISPONIBLE', tipo: null, nombre: null, organizacion_id: null}},
    ]);
    expect(JSON.stringify(detailAfter.body)).not.toMatch(/MOTIVO_PRIVADO|OBSERVACION_PRIVADA|nombre_capturado_correccion|capturado_en|usuario_id|contacto|correo|stock/);
    for (let i = 0; i < aliases.length; i++)
      expect((await get(aliases[i]).expect(200)).body.data).toEqual(before[i]);
  });

  it('estado público es mínimo y no exige JWT; ámbitos ocultos/inexistentes responden404 uniforme', async () => {
    const anonymous = await get('/impact/registros/966000/estado').expect(200);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    expect(Object.keys(anonymous.body.data).sort()).toEqual(['estado_logico', 'registro_plantacion_id',
      'registro_vigente', 'tiene_correcciones', 'url_detalle_efectivo']);
    expect(anonymous.body.data.tiene_correcciones).toBe(true);
    const expired = await get('/impact/registros/966000/estado').set('Authorization',
      'Bearer '+jwt.sign({sub: 'a-http-9310'}, {expiresIn: -1})).expect(200);
    expect(expired.body.data).toEqual(anonymous.body.data);
    const hidden = await get('/impact/registros/832000/estado').expect(404);
    const missing = await get('/impact/registros/999999999/estado').expect(404);
    expect(hidden.body.error.codigo).toBe(missing.body.error.codigo);
  });

  it('P01 vuelve a comprobar relación entre páginas aunque el cursor propio tenga firma válida', async () => {
    await post(967000, body('0', ['9310', '9312'])).expect(200);
    await post(967000, body('1', ['9310', '9313'])).expect(200);
    const first = await get('/plantaciones/967000/historial-propio?limite=1', 9310).expect(200);
    expect(first.body.siguiente_cursor).toEqual(expect.any(String));
    await post(967000, body('2', ['9313'])).expect(200);
    await get('/plantaciones/967000/historial-propio?limite=1&cursor='+
      encodeURIComponent(first.body.siguiente_cursor), 9310).expect(404);
  });

  it('fuera de ACTIVA el contexto conserva lectura pero niega corrección y no fabrica cambios', async () => {
    const context = await get('/plantaciones/952000/contexto-correccion', 9301).expect(200);
    expect(context.body.data.capacidades).toMatchObject({corregir_observaciones: false, corregir_participantes: false});
    const count = await historyCount(952000);
    const rejected = await post(952000, body(context.body.data.revision_registro)).expect(409);
    expect(rejected.body.error.codigo).toBe('SUBCAMPANIA_NO_OPERATIVA');
    expect(await historyCount(952000)).toBe(count);
  });

  it('la entrega de participantes conserva la pausa del registro inicial y su404 inconcluso', async () => {
    const key = randomUUID();
    const day = await sql("SELECT ((now() AT TIME ZONE 'America/La_Paz')::date)::text");
    const paused = await request(app.getHttpServer()).post('/api/v1/plantaciones/iniciales')
      .set('Authorization', token(800)).send({comando_id: key, subcampania_id: '968',
        plan_revision_esperada: '0', fecha_plantacion: day, latitud: -16.5, longitud: -68.1,
        especies: [{planta_id: '8', cantidad: 1}], coresponsable_ids: [],
        evidencia_ids: ['900050'], observaciones: null, afiliaciones_declaradas: []}).expect(503);
    expect(paused.body.resultado_concluyente).toBe(false);
    expect(initialCalls).toBe(0);
    await get('/participacion/comandos/'+key+'?operacion=REGISTRAR_PLANTACION_INICIAL', 800).expect(404);
  });
});
