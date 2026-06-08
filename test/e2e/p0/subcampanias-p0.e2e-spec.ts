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

describe('P0 Subcampanias - contrato HTTP', () => {
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

  it('crea subcampania heredando tipo y rechaza tipo explicito en payload', async () => {
    const tag = uniqueP0Tag('qa_p0_subcampania_tipo');
    const org = await createP0Organizacion(client, created, tag, 'Org inicial');
    const campania = await createCampania(tag, [org.id]);

    const subcampania = await createSubcampania(tag, campania.id, 'A');

    const detailResponse = await getSubcampania(subcampania.id);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data).toMatchObject({
      id: subcampania.id,
      campania_id: campania.id,
      tipo: 'REFORESTACION',
      estado: 'BORRADOR',
    });

    const campaniaResponse = await getCampania(campania.id);
    expect(campaniaResponse.body.data).toMatchObject({
      estado_derivado: 'BORRADOR',
      count_subcampanias: 1,
    });

    const withTipoResponse = await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('x-auth-id', refs.admin.authId)
      .send({
        ...buildSubcampaniaPayload(tag, campania.id, 'Con tipo', refs.zona.id),
        tipo: 'ARBORIZACION',
      });

    expect(withTipoResponse.status).toBe(400);
  });

  it('valida poligono, equipo, activacion, snapshots y estado derivado de campania', async () => {
    const tag = uniqueP0Tag('qa_p0_subcampania_flujo');
    const orgInicial = await createP0Organizacion(
      client,
      created,
      tag,
      'Org inicial',
    );
    const campania = await createCampania(tag, [orgInicial.id]);
    const sub1 = await createSubcampania(tag, campania.id, 'A');

    const activateWithoutPolygon = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub1.id}/activar`)
      .set('x-auth-id', refs.admin.authId);

    expect(activateWithoutPolygon.status).toBe(422);

    const invalidPolygon = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub1.id}/poligono`)
      .set('x-auth-id', refs.admin.authId)
      .send({
        poligono: {
          type: 'Polygon',
          coordinates: [
            [
              [-68.1193, -16.2902],
              [-68.119, -16.291],
              [-68.118, -16.2905],
            ],
          ],
        },
      });

    expect(invalidPolygon.status).toBe(400);

    await setValidPolygon(sub1.id);

    const subWithPolygon = await getSubcampania(sub1.id);
    expect(subWithPolygon.body.data.poligono_geojson).toMatchObject({
      type: 'Polygon',
    });

    const activateWithoutCoordinator = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub1.id}/activar`)
      .set('x-auth-id', refs.admin.authId);

    expect(activateWithoutCoordinator.status).toBe(422);

    await addTeamMembers(sub1.id, [
      { usuario_id: refs.admin.id, rol: 'COORDINADOR' },
    ]);
    await addTeamMembers(sub1.id, [
      { usuario_id: refs.operario.id, rol: 'OPERARIO' },
    ]);

    const duplicateUser = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub1.id}/equipo`)
      .set('x-auth-id', refs.admin.authId)
      .send([{ usuario_id: refs.operario.id, rol: 'OPERARIO' }]);
    expect(duplicateUser.status).toBe(422);

    const secondCoordinator = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub1.id}/equipo`)
      .set('x-auth-id', refs.admin.authId)
      .send([{ usuario_id: refs.operario.id, rol: 'COORDINADOR' }]);
    expect(secondCoordinator.status).toBe(422);

    const teamResponse = await request(app.getHttpServer())
      .get(`/api/subcampanias/${sub1.id}/equipo`)
      .set('x-auth-id', refs.admin.authId);
    expect(teamResponse.status).toBe(200);
    expect(
      teamResponse.body.data.filter((m: any) => m.rol === 'COORDINADOR'),
    ).toHaveLength(1);
    expect(
      teamResponse.body.data.map((m: any) => Number(m.usuario_id)),
    ).toEqual(expect.arrayContaining([refs.admin.id, refs.operario.id]));

    const activateSub1 = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub1.id}/activar`)
      .set('x-auth-id', refs.admin.authId);

    expect(activateSub1.status).toBe(201);

    const sub1Active = await getSubcampania(sub1.id);
    expect(sub1Active.body.data).toMatchObject({
      estado: 'ACTIVA',
      saldo_vivo_actual: 0,
      nombre_zona_snapshot: refs.zona.nombre,
      nombre_coordinador_snapshot: refs.admin.nombre,
    });
    expect(sub1Active.body.data.nombres_organizaciones_snapshot).toEqual(
      expect.arrayContaining([orgInicial.nombre]),
    );

    const campaniaActiva = await getCampania(campania.id);
    expect(campaniaActiva.body.data).toMatchObject({
      estado_derivado: 'ACTIVA',
      count_subcampanias: 1,
    });

    const sub2 = await createSubcampania(tag, campania.id, 'B');
    const campaniaConBorrador = await getCampania(campania.id);
    expect(campaniaConBorrador.body.data).toMatchObject({
      estado_derivado: 'ACTIVA',
      count_subcampanias: 2,
    });

    const orgNueva = await createP0Organizacion(
      client,
      created,
      tag,
      'Org agregada',
    );
    const associateOrg = await request(app.getHttpServer())
      .post(`/api/campanias/${campania.id}/organizaciones`)
      .set('x-auth-id', refs.admin.authId)
      .send({ organizacion_ids: [orgNueva.id] });
    expect(associateOrg.status).toBe(201);

    await setValidPolygon(sub2.id);
    await addTeamMembers(sub2.id, [
      { usuario_id: refs.admin.id, rol: 'COORDINADOR' },
    ]);

    const activateSub2 = await request(app.getHttpServer())
      .post(`/api/subcampanias/${sub2.id}/activar`)
      .set('x-auth-id', refs.admin.authId);
    expect(activateSub2.status).toBe(201);

    const sub2Active = await getSubcampania(sub2.id);
    expect(sub2Active.body.data).toMatchObject({
      estado: 'ACTIVA',
      nombre_zona_snapshot: refs.zona.nombre,
      nombre_coordinador_snapshot: refs.admin.nombre,
    });
    expect(sub2Active.body.data.nombres_organizaciones_snapshot).toEqual(
      expect.arrayContaining([orgInicial.nombre, orgNueva.nombre]),
    );

    const sub1AfterOrgChange = await getSubcampania(sub1.id);
    expect(
      sub1AfterOrgChange.body.data.nombres_organizaciones_snapshot,
    ).toEqual(expect.arrayContaining([orgInicial.nombre]));
    expect(
      sub1AfterOrgChange.body.data.nombres_organizaciones_snapshot,
    ).not.toContain(orgNueva.nombre);
  });

  async function createCampania(tag: string, organizacionIds: number[]) {
    const response = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', refs.admin.authId)
      .send({
        nombre: `[${tag}] Campania`,
        tipo: 'REFORESTACION',
        descripcion: `[${tag}] flujo subcampanias`,
        fecha_estimada_inicio: '2026-06-01',
        fecha_estimada_fin: '2026-12-31',
        organizacion_ids: organizacionIds,
      });

    expect(response.status).toBe(201);
    const campania = response.body.data;
    created.campaniaIds.push(Number(campania.id));
    return {
      id: Number(campania.id),
      codigo_trazabilidad: String(campania.codigo_trazabilidad),
    };
  }

  async function createSubcampania(
    tag: string,
    campaniaId: number,
    suffix: string,
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('x-auth-id', refs.admin.authId)
      .send(buildSubcampaniaPayload(tag, campaniaId, suffix, refs.zona.id));

    expect(response.status).toBe(201);
    const subcampania = response.body.data;
    created.subcampaniaIds.push(Number(subcampania.id));
    return {
      id: Number(subcampania.id),
      codigo_trazabilidad: String(subcampania.codigo_trazabilidad),
    };
  }

  async function setValidPolygon(subcampaniaId: number) {
    const response = await request(app.getHttpServer())
      .post(`/api/subcampanias/${subcampaniaId}/poligono`)
      .set('x-auth-id', refs.admin.authId)
      .send({
        poligono: buildValidPolygon(),
      });

    expect(response.status).toBe(201);
  }

  async function addTeamMembers(
    subcampaniaId: number,
    members: Array<{ usuario_id: number; rol: 'COORDINADOR' | 'OPERARIO' }>,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/subcampanias/${subcampaniaId}/equipo`)
      .set('x-auth-id', refs.admin.authId)
      .send(members);

    expect(response.status).toBe(201);
    return response.body.data;
  }

  function getCampania(campaniaId: number) {
    return request(app.getHttpServer())
      .get(`/api/campanias/${campaniaId}`)
      .set('x-auth-id', refs.admin.authId);
  }

  function getSubcampania(subcampaniaId: number) {
    return request(app.getHttpServer())
      .get(`/api/subcampanias/${subcampaniaId}`)
      .set('x-auth-id', refs.admin.authId);
  }
});

function buildSubcampaniaPayload(
  tag: string,
  campaniaId: number,
  suffix: string,
  zonaId: number,
) {
  return {
    campania_id: campaniaId,
    nombre: `[${tag}] Subcampania ${suffix}`,
    descripcion: `[${tag}] subcampania ${suffix}`,
    zona_id: zonaId,
    meta_total_arboles: 100,
    fecha_estimada_inicio: '2026-06-15',
    fecha_estimada_fin: '2026-10-15',
    tolerancia_gps_metros: 50,
  };
}

function buildValidPolygon() {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [-68.1193, -16.2902],
        [-68.119, -16.291],
        [-68.118, -16.2905],
        [-68.1193, -16.2902],
      ],
    ],
  };
}
