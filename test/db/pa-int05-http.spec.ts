import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import {
  startHarness,
  sql,
  token,
  jwt,
} from '../../scripts/qa/pa-int02d-harness';

/** HTTP real con guard/controller/service/RPC/PostGIS y Storage de disco privados.
 * Los datos provienen del fixtureINT05, nunca de .env ni del catálogo remoto. */
describe('INT05 impacto público y Mis registros con SQL real', () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let photo: Buffer;
  const cases: string[] = [];
  const get = (path: string, actor?: number) => {
    const value = request(h.app.getHttpServer()).get('/api' + path);
    return actor === undefined
      ? value
      : value.set('Authorization', token(actor));
  };
  const publicData = async (path = '/v1/impact/global') => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body.data;
  };
  beforeAll(async () => {
    h = await startHarness();
    photo = await sharp({
      create: { width: 5, height: 4, channels: 3, background: '#228b22' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'SECRETO_ORIGINAL_INT05' } } })
      .png()
      .toBuffer();
    await h
      .from('recoleccion_fotos')
      .upload('int05/elegible-original.png', photo);
    await h
      .from('recoleccion_fotos')
      .upload('int05/pendiente-original.png', photo);
  });
  afterEach(() => {
    cases.push(expect.getState().currentTestName ?? '');
  });
  afterAll(async () => {
    await h?.app.close();
    const path = resolve('docs/evidencia/pa-int05-local.json');
    const evidence = JSON.parse(readFileSync(path, 'utf8'));
    evidence.http_casos = cases;
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
  });

  it('sin token y con sesión vencida consulta la misma proyección pública, sin depender del perfil', async () => {
    const anonymous = await get('/v1/impact/global');
    const volunteer = await get('/v1/impact/global', 804);
    const expired = await get('/v1/impact/global').set(
      'Authorization',
      'Bearer ' + jwt.sign({ sub: 'a-http-801' }, { expiresIn: -1 }),
    );
    expect(anonymous.status).toBe(200);
    expect(volunteer.body).toEqual(anonymous.body);
    expect(expired.body).toEqual(anonymous.body);
    expect(JSON.stringify(anonymous.body)).not.toMatch(
      /observaciones|responsable_id|usuario_id|contacto|correo|wallet|stock|cantidad_asignada|equipo|ruta_archivo|metadata|original|pendiente|signedUrl|OBSERVACION_PRIVADA|CONTACTO_PRIVADO/,
    );
  });

  it('30+20=50 antes de unir tres participantes y dos organizaciones; mapa/lista mantienen cuatro hechos', async () => {
    const data = await publicData();
    expect(data.indicadores).toEqual({
      plantacion_inicial: 50,
      reposiciones: 4,
      bajas_reportadas: 11,
      registros: 4,
    });
    expect(
      data.campanias.map((row: any) => [row.id, row.plantacion_inicial]),
    ).toEqual([
      ['800', 30],
      ['801', 20],
    ]);
    expect(data.registros).toHaveLength(4);
    expect(data.mapa).toHaveLength(4);
    expect(new Set(data.mapa.map((row: any) => row.registro_id)).size).toBe(4);
    expect(data.mapa.map((row: any) => row.registro_id)).toEqual(
      data.registros.map((row: any) => row.id),
    );
    expect(
      data.registros.find((row: any) => row.id === '826000').personas,
    ).toHaveLength(3);
    expect(
      data.registros.find((row: any) => row.id === '826000')
        .organizaciones_campania,
    ).toHaveLength(2);
    expect(data.indicadores).not.toHaveProperty('faltantes');
  });

  it('campaña y subcampaña mantienen alcance público,125% y faltantes0 sin netear reposiciones ni bajas', async () => {
    const campaign = await publicData('/v1/impact/campanias/800');
    const scope = await publicData('/v1/impact/subcampanias/826');
    expect(campaign.indicadores.plantacion_inicial).toBe(30);
    expect(scope.indicadores).toEqual({
      plantacion_inicial: 25,
      reposiciones: 4,
      bajas_reportadas: 6,
      registros: 2,
    });
    expect(scope.subcampanias[0]).toMatchObject({
      id: '826',
      meta_inicial: 20,
      avance_porcentaje: 125,
      faltantes: 0,
      plantacion_inicial: 25,
      reposiciones: 4,
      bajas_reportadas: 6,
    });
    expect(scope.subcampanias[0].poligono.type).toBe('Polygon');
    expect(scope.subcampanias[0].poligono.coordinates[0][0]).toEqual([
      -68.2, -16.6,
    ]);
    expect(scope.indicadores).not.toHaveProperty('faltantes');
  });

  it('BORRADOR/CANCELADA/PAUSADA y eliminados no se infieren por ámbitos ni registros públicos', async () => {
    const publicScopes = (await publicData()).subcampanias.map(
      (row: any) => row.id,
    );
    for (const id of [828, 829, 830, 831, 832]) {
      expect(publicScopes).not.toContain(String(id));
      const scope = await get('/v1/impact/subcampanias/' + id);
      const record = await get('/v1/impact/registros/' + id * 1000);
      expect(scope.status).toBe(404);
      expect(record.status).toBe(404);
      expect(scope.body.error.codigo).toBe('RECURSO_NO_VISIBLE');
      expect(record.body.error.codigo).toBe('RECURSO_NO_VISIBLE');
    }
    expect((await get('/v1/impact/campanias/802')).status).toBe(404);
    expect(
      (await get('/v1/impact/registros/999999999')).body.error.codigo,
    ).toBe('RECURSO_NO_VISIBLE');
  });

  it('filtros de organización/especie/fecha y ámbito actúan igual sobre indicadores, mapa y lista', async () => {
    const first = await publicData('/v1/impact/global?planta_id=8');
    const second = await publicData('/v1/impact/global?planta_id=9');
    expect(first.indicadores).toMatchObject({
      plantacion_inicial: 30,
      reposiciones: 4,
      registros: 3,
    });
    expect(second.indicadores).toMatchObject({
      plantacion_inicial: 20,
      reposiciones: 0,
      registros: 1,
    });
    expect(second.mapa.map((row: any) => row.registro_id)).toEqual(['827000']);
    expect(
      (await publicData('/v1/impact/global?organizacion_id=1')).indicadores
        .plantacion_inicial,
    ).toBe(50);
    expect(
      (await publicData('/v1/impact/global?organizacion_id=2')).indicadores
        .plantacion_inicial,
    ).toBe(50);
    expect(
      (await publicData('/v1/impact/global?organizacion_id=999999')).indicadores
        .registros,
    ).toBe(0);
    const day = await sql(
      "SELECT ((now() AT TIME ZONE 'America/La_Paz')::date-1)::text",
    );
    const date = await publicData(
      '/v1/impact/global?desde=' + day + '&hasta=' + day,
    );
    expect(date.indicadores).toEqual({
      plantacion_inicial: 20,
      reposiciones: 4,
      bajas_reportadas: 0,
      registros: 2,
    });
    expect(
      (await publicData('/v1/impact/global?campania_id=800&subcampania_id=826'))
        .indicadores.plantacion_inicial,
    ).toBe(25);
  });

  it('cursor estable pagina hechos sin repetirlos ni modificar indicadores o mapa', async () => {
    const first = await publicData('/v1/impact/global?limite=2');
    expect(first.registros.map((row: any) => row.id)).toEqual([
      '827000',
      '826001',
    ]);
    expect(first.siguiente_cursor).toBe('826001');
    const second = await publicData(
      '/v1/impact/global?limite=2&cursor=' + first.siguiente_cursor,
    );
    expect(second.registros.map((row: any) => row.id)).toEqual([
      '826000',
      '820000',
    ]);
    expect(second.siguiente_cursor).toBeNull();
    expect(second.indicadores).toEqual(first.indicadores);
    expect(second.mapa).toEqual(first.mapa);
  });

  it('nombre y afiliación al plantar no siguen al perfil;NO_DECLARADA y legado no disponible son distintos', async () => {
    const group = await publicData('/v1/impact/registros/826000');
    const legacy = await publicData('/v1/impact/registros/827000');
    expect(group.personas[0]).toMatchObject({
      nombre: 'Plantador histórico INT05',
      es_responsable: true,
      afiliacion: {
        estado: 'DECLARADA',
        tipo: 'ORGANIZACION_REGISTRADA',
        nombre: 'Organización sintética al plantar',
        organizacion_id: '1',
      },
    });
    expect(
      group.personas.some(
        (row: any) => row.afiliacion.estado === 'NO_DECLARADA',
      ),
    ).toBe(true);
    expect(legacy.personas[0]).toMatchObject({
      nombre: null,
      afiliacion: {
        estado: 'HISTORICA_NO_DISPONIBLE',
        nombre: null,
        tipo: null,
        organizacion_id: null,
      },
    });
    expect(JSON.stringify(group)).not.toContain('Perfil actual cambiado');
    expect(JSON.stringify(legacy)).not.toContain('Participante local');
    expect(group.seguimiento.bajas_reportadas).toBe(6);
    expect(group.seguimiento.reposiciones_registradas).toBe(4);
    expect(group.seguimiento.bajas).toEqual([
      { evento_id: '900060', fecha: expect.stringMatching(/Z$/), cantidad: 6 },
    ]);
    expect(group.seguimiento.reposiciones).toEqual([
      {
        registro_id: '826001',
        fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        cantidad: 4,
        url_publica: '/api/v1/impact/registros/826001',
      },
    ]);
    expect(group.fotos).toEqual([
      { id: '900050', url: '/api/v1/impact/imagenes/900050' },
    ]);
  });

  it('foto elegible sin JWT entrega JPEG sin EXIF;pendiente y general no abren original privado', async () => {
    const image = await get('/v1/impact/imagenes/900050');
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/jpeg');
    const metadata = await sharp(image.body).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.exif).toBeUndefined();
    expect(image.body.equals(photo)).toBe(false);
    expect((await get('/v1/impact/imagenes/900051')).status).toBe(404);
    expect((await get('/evidencias-trazabilidad/900051', 800)).status).toBe(
      404,
    );
    expect(
      (await get('/v1/impact/registros/826000')).body.data.fotos,
    ).not.toContainEqual(expect.objectContaining({ id: '900051' }));
  });

  it('retiro de elegibilidad cierra registro y foto en la misma audiencia mientras conserva la consulta propia', async () => {
    await sql("UPDATE public.subcampania SET estado='PAUSADA' WHERE id=826");
    try {
      expect((await get('/v1/impact/registros/826000')).status).toBe(404);
      expect((await get('/v1/impact/imagenes/900050')).status).toBe(404);
      const global = await publicData();
      expect(global.indicadores.plantacion_inicial).toBe(25);
      expect(global.mapa.map((row: any) => row.registro_id)).not.toContain(
        '826000',
      );
      const own = await get('/v1/plantaciones/mis-registros', 801);
      expect(own.status).toBe(200);
      expect(
        own.body.data.registros.find((row: any) => row.id === '826000')
          .url_publica,
      ).toBeNull();
      expect(
        (await get('/v1/plantaciones/826000/detalle-propio', 801)).status,
      ).toBe(200);
    } finally {
      await sql("UPDATE public.subcampania SET estado='ACTIVA' WHERE id=826");
    }
  });

  it('Mis registros exige JWT vigente/cuenta activa y no acepta identidad suplantada por headers', async () => {
    for (const response of [
      await get('/v1/plantaciones/mis-registros'),
      await get('/v1/plantaciones/mis-registros').set(
        'Authorization',
        'Bearer ' + jwt.sign({ sub: 'a-http-801' }, { expiresIn: -1 }),
      ),
      await get('/v1/plantaciones/mis-registros')
        .set('x-auth-id', 'a-http-801')
        .set('x-user-role', 'ADMIN'),
      await get('/v1/plantaciones/mis-registros', 800).set(
        'x-auth-id',
        'a-http-801',
      ),
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toContain('Authorization');
    }
    expect((await get('/v1/plantaciones/mis-registros', 805)).status).toBe(403);
  });

  it('autor retirado recupera sus hechos y participante histórico ve relación;unión deduplica autor+participante', async () => {
    const response = await get('/v1/plantaciones/mis-registros', 801);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toContain('Authorization');
    const rows = response.body.data.registros;
    expect(rows).toHaveLength(7);
    expect(rows.filter((row: any) => row.id === '826000')).toHaveLength(1);
    expect(rows.find((row: any) => row.id === '826000')).toMatchObject({
      relaciones: ['AUTOR', 'PARTICIPANTE'],
      cantidad_total_plantada: 25,
      url_publica: '/api/v1/impact/registros/826000',
    });
    expect(rows.find((row: any) => row.id === '827000').relaciones).toEqual([
      'PARTICIPANTE',
    ]);
    expect(rows.find((row: any) => row.id === '828000').url_publica).toBeNull();
    expect(
      (await get('/v1/plantaciones/828000/detalle-propio', 801)).status,
    ).toBe(200);
    expect(
      (await get('/v1/subcampanias/826/contexto-registro', 801)).status,
    ).toBe(404);
    expect(
      (await get('/v1/plantaciones/mis-registros', 804)).body.data.registros,
    ).toEqual([]);
    expect(
      (await get('/v1/plantaciones/826000/detalle-propio', 804)).status,
    ).toBe(404);
  });

  it('detalle propio conserva observación solo para autor y no amplía el dato al corresponsable', async () => {
    const author = await get('/v1/plantaciones/826000/detalle-propio', 801);
    const participant = await get(
      '/v1/plantaciones/826000/detalle-propio',
      802,
    );
    expect(author.status).toBe(200);
    expect(participant.status).toBe(200);
    expect(author.body.data.observaciones_autor).toBe(
      'OBSERVACION_PRIVADA_AUTOR_INT05',
    );
    expect(participant.body.data.observaciones_autor).toBeNull();
    expect(
      JSON.stringify(await publicData('/v1/impact/registros/826000')),
    ).not.toContain('OBSERVACION_PRIVADA_AUTOR_INT05');
  });

  it('Mis registros pagina unión histórica sin repetición e IDs ajenos no cambian actor', async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await get(
        '/v1/plantaciones/mis-registros?limite=2' +
          (cursor ? '&cursor=' + cursor : ''),
        801,
      );
      expect(response.status).toBe(200);
      ids.push(...response.body.data.registros.map((row: any) => row.id));
      cursor = response.body.data.siguiente_cursor;
    } while (cursor);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(
      (await get('/v1/plantaciones/mis-registros?usuario_id=801', 804)).status,
    ).toBe(422);
  });

  it('contrato rechaza ID/fecha/límite inválidos sin exponer SQL y GET plan sigue autenticado', async () => {
    for (const path of [
      '/v1/impact/global?limite=0',
      '/v1/impact/global?limite=101',
      '/v1/impact/global?planta_id=1.5',
      '/v1/impact/global?desde=2026-02-30',
      '/v1/impact/global?desde=2026-10-10&hasta=2026-10-01',
      '/v1/impact/registros/0',
    ]) {
      const response = await get(path);
      expect(response.status).toBe(422);
      expect(JSON.stringify(response.body)).not.toMatch(
        /pg_|SELECT|statement|syntax/,
      );
    }
    expect((await get('/subcampanias/826/plan')).status).toBe(401);
    expect((await get('/subcampanias/826/plan', 801)).status).toBe(200);
  });

  it('081 conserva cierre raw y RPC privadas en anon/authenticated;service_role mantiene proyección', async () => {
    const result = JSON.parse(
      await sql(`SELECT jsonb_build_object(
      'raw',coalesce((SELECT bool_or(has_table_privilege(role,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
        FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','pa_int02b_public_probe']) role
        WHERE n.nspname='public' AND t.relname IN('registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable','evidencias_trazabilidad','subcampania_equipo','asignacion_vivero_subcampania','subcampania','evento_plantacion','lote_vivero','evento_lote_vivero','v_lote_vivero_saldos')),false),
      'catalogos_mutacion',coalesce((SELECT bool_or(has_table_privilege(role,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated','pa_int02b_public_probe']) role WHERE n.nspname='public' AND t.relname IN('planta','tipo_planta','comunidad','division_administrativa')),false),
      'rpc_publica',coalesce((SELECT bool_or(has_function_privilege(role,p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','pa_int02b_public_probe']) role
        WHERE n.nspname='public' AND p.proname IN('pa_i_personas','pa_i_registro','pa_impacto_leer','pa_mis_registros_leer')),false),
      'rpc_servicio',has_function_privilege('service_role','public.pa_impacto_leer(bigint,bigint,bigint,bigint,bigint,date,date,bigint,integer)'::regprocedure,'EXECUTE'))`),
    );
    expect(result).toEqual({
      raw: false,
      catalogos_mutacion: false,
      rpc_publica: false,
      rpc_servicio: true,
    });
  });

  it('captura ejemplos de HTTP real para el contrato/frontend', async () => {
    const examples: Record<string, unknown> = {};
    for (const [key, path] of Object.entries({
      global: '/v1/impact/global',
      campania: '/v1/impact/campanias/800',
      subcampania: '/v1/impact/subcampanias/826',
      registro: '/v1/impact/registros/826000',
    })) {
      const response = await get(path);
      expect(response.status).toBe(200);
      examples[key] = response.body;
    }
    const own = await get('/v1/plantaciones/mis-registros', 801);
    expect(own.status).toBe(200);
    examples.mis_registros = own.body;
    writeFileSync(
      '/private/tmp/pa-int05-ejemplos-runtime.json',
      JSON.stringify(examples, null, 2) + '\n',
    );
  });
});
