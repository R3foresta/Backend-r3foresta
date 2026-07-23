import { INestApplication } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import {
  cleanupP0Data,
  closeP0Resources,
  createP0App,
  createP0Organizacion,
  createP0SupabaseClient,
  loadP0References,
  newP0CreatedIds,
  P0CreatedIds,
  P0Refs,
  uniqueP0Tag,
} from '../../helpers/p0-flow.helpers';

jest.setTimeout(30000);

describe('P0 Campanias - contrato HTTP', () => {
  let app: INestApplication;
  let client: SupabaseClient;
  let refs: P0Refs;
  let created: P0CreatedIds = newP0CreatedIds();

  beforeAll(async () => {
    app = await createP0App();
    client = createP0SupabaseClient();
    refs = await loadP0References(client);
  }, 20000);

  beforeEach(() => {
    created = newP0CreatedIds();
  });

  afterEach(async () => {
    if (client) {
      await cleanupP0Data(client, created);
    }
  });

  afterAll(async () => {
    await closeP0Resources(app, client);
  });

  it('crea campania como ADMIN y expone estado derivado, conteo y organizaciones en detalle', async () => {
    const tag = uniqueP0Tag('qa_p0_campania');
    const orgA = await createP0Organizacion(client, created, tag, 'Org A');
    const orgB = await createP0Organizacion(client, created, tag, 'Org B');

    const payload = buildCampaniaPayload(tag, [orgA.id, orgB.id]);

    const createResponse = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', refs.admin.authId)
      .send(payload);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);

    const campania = createResponse.body.data;
    created.campaniaIds.push(Number(campania.id));

    expect(campania).toMatchObject({
      nombre: payload.nombre,
      tipo: payload.tipo,
      descripcion: payload.descripcion,
      fecha_estimada_inicio: payload.fecha_estimada_inicio,
      fecha_estimada_fin: payload.fecha_estimada_fin,
    });
    expect(campania.codigo_trazabilidad).toMatch(/^CMP-\d{4}-\d{3,}$/);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/campanias/${campania.id}`)
      .set('x-auth-id', refs.admin.authId);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.success).toBe(true);

    const detalle = detailResponse.body.data;
    expect(detalle).toMatchObject({
      id: Number(campania.id),
      nombre: payload.nombre,
      tipo: payload.tipo,
      descripcion: payload.descripcion,
      fecha_estimada_inicio: payload.fecha_estimada_inicio,
      fecha_estimada_fin: payload.fecha_estimada_fin,
      codigo_trazabilidad: campania.codigo_trazabilidad,
      estado_derivado: 'BORRADOR',
      count_subcampanias: 0,
    });

    expect(
      detalle.organizaciones.map((org: any) => Number(org.id)).sort(),
    ).toEqual([orgA.id, orgB.id].sort());
  });

  it.each([
    ['sin nombre', (tag: string) => omit(buildCampaniaPayload(tag), 'nombre')],
    ['sin tipo', (tag: string) => omit(buildCampaniaPayload(tag), 'tipo')],
    [
      'tipo invalido',
      (tag: string) => ({
        ...buildCampaniaPayload(tag),
        tipo: 'CONSERVACION',
      }),
    ],
    [
      'fecha invalida',
      (tag: string) => ({
        ...buildCampaniaPayload(tag),
        fecha_estimada_inicio: 'no-es-fecha',
      }),
    ],
    [
      'fechas invertidas',
      (tag: string) => ({
        ...buildCampaniaPayload(tag),
        fecha_estimada_inicio: '2026-12-31',
        fecha_estimada_fin: '2026-06-01',
      }),
    ],
  ])('rechaza campania %s', async (_caseName, buildPayload) => {
    const tag = uniqueP0Tag('qa_p0_campania_invalid');

    const response = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', refs.admin.authId)
      .send(buildPayload(tag));

    expect(response.status).toBe(400);
  });

  it('rechaza escritura de campania con usuario no ADMIN', async () => {
    const tag = uniqueP0Tag('qa_p0_campania_forbidden');

    const response = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', refs.nonAdmin.authId)
      .send(buildCampaniaPayload(tag));

    expect(response.status).toBe(403);
  });

  it('previsualiza una campaña con borrador sin polígono sin modificar datos', async () => {
    const tag = uniqueP0Tag('qa_p0_campania_preview');
    const createCampaniaResponse = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', refs.admin.authId)
      .send(buildCampaniaPayload(tag));

    expect(createCampaniaResponse.status).toBe(201);
    const campaniaId = Number(createCampaniaResponse.body.data.id);
    created.campaniaIds.push(campaniaId);

    const createSubcampaniaResponse = await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('x-auth-id', refs.admin.authId)
      .send({
        campania_id: campaniaId,
        nombre: `[${tag}] Borrador sin poligono`,
        descripcion: `[${tag}] elegibilidad`,
        zona_id: refs.zona.id,
        meta_total_arboles: 100,
        tolerancia_gps_metros: 50,
      });

    expect(createSubcampaniaResponse.status).toBe(201);
    const subcampaniaId = Number(createSubcampaniaResponse.body.data.id);
    created.subcampaniaIds.push(subcampaniaId);

    const previewResponse = await request(app.getHttpServer())
      .get(`/api/campanias/${campaniaId}/desactivacion/preview`)
      .set('x-auth-id', refs.admin.authId);

    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.data).toMatchObject({
      campania_id: campaniaId,
      elegible: true,
      subcampanias_vivas: 1,
      subcampanias_a_cancelar: 1,
      borradores: 1,
      activas_sin_plantar: 0,
      ya_canceladas: 0,
      asignaciones_con_saldo: 0,
      unidades_a_devolver: 0,
      bloqueos: [],
    });

    const subcampania = await client
      .from('subcampania')
      .select('estado, poligono_geom, deleted_at')
      .eq('id', subcampaniaId)
      .single();
    expect(subcampania.error).toBeNull();
    expect(subcampania.data).toMatchObject({
      estado: 'BORRADOR',
      poligono_geom: null,
      deleted_at: null,
    });
  });

  it('desactiva atómicamente una campaña sin subcampañas y rechaza el reintento', async () => {
    const tag = uniqueP0Tag('qa_p0_campania_desactivar');
    const createResponse = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', refs.admin.authId)
      .send(buildCampaniaPayload(tag));

    expect(createResponse.status).toBe(201);
    const campaniaId = Number(createResponse.body.data.id);
    created.campaniaIds.push(campaniaId);

    const deactivateResponse = await request(app.getHttpServer())
      .post(`/api/campanias/${campaniaId}/desactivar`)
      .set('x-auth-id', refs.admin.authId)
      .send({ motivo: 'Limpieza de datos de prueba P0' });

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.data).toMatchObject({
      campania_id: campaniaId,
      subcampanias_canceladas: 0,
      asignaciones_devueltas: 0,
      unidades_devueltas: 0,
    });
    expect(deactivateResponse.body.data.deleted_at).toEqual(expect.any(String));

    const retryResponse = await request(app.getHttpServer())
      .post(`/api/campanias/${campaniaId}/desactivar`)
      .set('x-auth-id', refs.admin.authId)
      .send({ motivo: 'Segundo intento de desactivacion' });

    expect(retryResponse.status).toBe(404);
  });
});

function buildCampaniaPayload(tag: string, organizacionIds: number[] = []) {
  return {
    nombre: `[${tag}] Campania P0`,
    tipo: 'REFORESTACION',
    descripcion: `[${tag}] flujo base`,
    fecha_estimada_inicio: '2026-06-01',
    fecha_estimada_fin: '2026-12-31',
    ...(organizacionIds.length > 0
      ? { organizacion_ids: organizacionIds }
      : {}),
  };
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
