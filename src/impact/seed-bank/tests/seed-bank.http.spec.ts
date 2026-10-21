import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import sharp from 'sharp';
import { configureGlobalRoutes } from '../../../app.routes';
import { SupabaseService } from '../../../supabase/supabase.service';
import { ParticipacionImagenService } from '../../../participacion/cargas/participacion-imagen.service';
import { SeedBankService } from '../../application/seed-bank.service';
import { SeedBankController } from '../seed-bank.controller';
import type { SeedDetail, SeedOverview, SeedPage } from '../seed-bank.types';

function asJson<T>(
  response: request.Response,
): Omit<request.Response, 'body'> & { body: { success: true; data: T } } {
  return response as Omit<request.Response, 'body'> & {
    body: { success: true; data: T };
  };
}

import { seedFixture } from '../../../../test/fixtures/seed-bank.fixture';

describe('Banco público de semillas: HTTP y servicios reales con Supabase sustituido', () => {
  let app: INestApplication<Server>;
  let fixture: ReturnType<typeof seedFixture>;
  let unavailableAdmin = false;
  const publicClient = jest.fn(() => {
    throw new Error('No se debe usar el cliente público.');
  });
  const path = '/api/v1/impact/seed-bank';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SeedBankController],
      providers: [
        SeedBankService,
        ParticipacionImagenService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: SupabaseService,
          useValue: {
            getClient: publicClient,
            getAdminClient: () => {
              if (unavailableAdmin) throw new Error('private-key-missing');
              return fixture.client;
            },
          },
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
  afterAll(async () => app?.close());
  beforeEach(() => {
    fixture = seedFixture();
    unavailableAdmin = false;
    publicClient.mockClear();
  });
  afterEach(() => expect(publicClient).not.toHaveBeenCalled());

  it('consulta resumen sin credenciales sobre todos los recolectores, viveros, estados y páginas', async () => {
    const response = await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .then(asJson<SeedOverview>);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.summary).toEqual({
      collectionsCount: 7,
      speciesCount: 3,
      locationsCount: 3,
      mintedCollectionsCount: 1,
      lastCollectionAt: '2026-10-21',
      totalsByUnit: [
        { unit: 'G', collected: 1825.3, available: null },
        { unit: 'UNIDAD', collected: 10, available: 4 },
      ],
    });
    expect(
      response.body.data.filters.species.map((item: { id: number }) => item.id),
    ).toEqual([11, 12, 13]);
    expect(
      response.body.data.filters.locations.map(
        (item: { id: number }) => item.id,
      ),
    ).toEqual([1, 2, 3]);
    expect(
      fixture.reads
        .filter((item) => item.table === 'recoleccion')
        .map((item) => item.from),
    ).toEqual([0, 2, 4, 6]);
    expect(fixture.calls.some((item) => item.select.includes('*'))).toBe(false);
  });

  it('ordena con desempate por ID, aplica filtros antes del conteo y conserva el resumen global', async () => {
    const first = await request(app.getHttpServer())
      .get(`${path}/collections?pageSize=2`)
      .expect(200)
      .then(asJson<SeedPage>);
    expect(first.body.data).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 7,
      totalPages: 4,
    });
    expect(
      first.body.data.items.map((item: { id: number }) => item.id),
    ).toEqual([8, 7]);
    const second = await request(app.getHttpServer())
      .get(`${path}/collections?pageSize=2&page=2`)
      .expect(200)
      .then(asJson<SeedPage>);
    expect(
      second.body.data.items.map((item: { id: number }) => item.id),
    ).toEqual([5, 4]);
    const asc = await request(app.getHttpServer())
      .get(`${path}/collections?sort=date-asc&pageSize=100`)
      .expect(200)
      .then(asJson<SeedPage>);
    expect(asc.body.data.items.map((item: { id: number }) => item.id)).toEqual([
      1, 2, 3, 4, 5, 7, 8,
    ]);
    const range = await request(app.getHttpServer())
      .get(
        `${path}/collections?from=2026-10-02&to=2026-10-03&locationId=2&speciesId=11`,
      )
      .expect(200)
      .then(asJson<SeedPage>);
    expect(range.body.data).toMatchObject({
      total: 1,
      totalPages: 1,
      items: [{ id: 2, saldo_actual: null }],
    });
    const summary = await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .then(asJson<SeedOverview>);
    expect(summary.body.data.summary.collectionsCount).toBe(7);
  });

  it.each([
    ['q=arbol', [8, 7, 4, 2, 1]],
    ['q=Cedrela', [3]],
    ['q=REC-FIXTURE-4', [4]],
    ['speciesId=12', [5, 3]],
    ['locationId=2', [3, 2]],
    ['blockchain=with-link', [3]],
    ['blockchain=without-link', [8, 7, 5, 4, 2, 1]],
    ['speciesId=9999', []],
  ])('filtra por %s', async (query, ids) => {
    const response = await request(app.getHttpServer())
      .get(`${path}/collections?${query}`)
      .expect(200)
      .then(asJson<SeedPage>);
    expect(
      response.body.data.items.map((item: { id: number }) => item.id),
    ).toEqual(ids);
    expect(response.body.data.total).toBe(ids.length);
  });

  it('mantiene cero y null, normaliza KG y permite los cuatro estados aunque el Bearer sea inválido', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/collections`)
      .set('Authorization', 'Bearer invalid')
      .set('x-auth-id', 'untrusted')
      .expect(200)
      .then(asJson<SeedPage>);
    const items = response.body.data.items;
    expect(
      new Set(
        items.map((item: { estado_registro: string }) => item.estado_registro),
      ),
    ).toEqual(
      new Set(['BORRADOR', 'PENDIENTE_VALIDACION', 'VALIDADO', 'RECHAZADO']),
    );
    expect(
      items.find((item: { id: number }) => item.id === 1)?.saldo_actual,
    ).toBe(0);
    expect(
      items.find((item: { id: number }) => item.id === 2)?.saldo_actual,
    ).toBeNull();
    expect(items.find((item: { id: number }) => item.id === 5)).toMatchObject({
      cantidad_inicial_canonica: 1500,
      unidad_canonica: 'G',
      saldo_actual: 250,
    });
    expect(
      items.every(
        (item: { tipo_material: string }) => item.tipo_material === 'SEMILLA',
      ),
    ).toBe(true);
  });

  it('coinciden lista y ficha; las fotos no revelan originales, captions, metadata o identidad', async () => {
    const list = await request(app.getHttpServer())
      .get(`${path}/collections`)
      .expect(200)
      .then(asJson<SeedPage>);
    const detail = await request(app.getHttpServer())
      .get(`${path}/collections/3`)
      .expect(200)
      .then(asJson<SeedDetail>);
    expect(detail.body.data).toMatchObject(
      list.body.data.items.find((item: { id: number }) => item.id === 3),
    );
    expect(detail.body.data).toMatchObject({
      metodo: 'Manual',
      observaciones_publicas: null,
      fotos: [
        { id: 31, url: `${path}/collections/3/photos/31`, descripcion: null },
      ],
      blockchain: { token_id: '42', network: null, minted_at: null },
    });
    expect(detail.body.data.fotos).toHaveLength(1);
    const forbidden = [
      'usuario_id',
      'vivero_id',
      'correo',
      'nombre_recolector_snapshot',
      'observaciones',
      'metadata',
      'bucket',
      'ruta_archivo',
      'referencia',
    ];
    const check = (value: unknown) => {
      if (value && typeof value === 'object')
        for (const [key, child] of Object.entries(value)) {
          expect(forbidden).not.toContain(key);
          check(child);
        }
    };
    check(detail.body);
    check(list.body);
    expect(JSON.stringify(detail.body)).not.toContain('private');
  });

  it('no publica fotos de registros sin validación y revalida al descargar', async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/collections/1`)
      .expect(200)
      .then(asJson<SeedDetail>);
    expect(response.body.data.fotos).toEqual([]);
    await request(app.getHttpServer())
      .get(`${path}/collections/1/photos/33`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${path}/collections/3/photos/32`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${path}/collections/3/photos/33`)
      .expect(404);
    expect(fixture.state.downloads).toEqual([]);
    fixture.tables.recoleccion.find((row) => row.id === 3)!.estado_registro =
      'RECHAZADO';
    await request(app.getHttpServer())
      .get(`${path}/collections/3/photos/31`)
      .expect(404);
  });

  it('sirve JPEG sanitizado sin EXIF mediante una descarga privada controlada', async () => {
    fixture.state.original = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#00aa00' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'private-photographer' } } })
      .jpeg()
      .toBuffer();
    const response = await request(app.getHttpServer())
      .get(`${path}/collections/3/photos/31`)
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(fixture.state.downloads).toEqual(['recoleccion_fotos/fixture.jpg']);
    const metadata = await sharp(response.body as Buffer).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it.each(['0', '-1', 'abc', '9007199254740992'])(
    'rechaza ID %s',
    async (id) => {
      await request(app.getHttpServer())
        .get(`${path}/collections/${id}`)
        .expect(400);
    },
  );
  it.each(['999', '6'])(
    'devuelve 404 para ID inexistente o ESQUEJE %s',
    async (id) => {
      await request(app.getHttpServer())
        .get(`${path}/collections/${id}`)
        .expect(404);
    },
  );
  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1e2',
    'page=01',
    'page=9007199254740992',
    'pageSize=101',
    'pageSize=0',
    'pageSize=2&pageSize=3',
    'speciesId=0',
    'locationId=abc',
    'from=2026-02-30',
    'from=2026-10-21T00:00:00Z',
    'from=2026-10-21&to=2026-10-01',
    'blockchain=all',
    'sort=unknown',
    'usuario_id=1',
    'q=a&q=b',
    `q=${'a'.repeat(151)}`,
  ])('rechaza query inválido: %s', async (query) => {
    await request(app.getHttpServer())
      .get(`${path}/collections?${query}`)
      .expect(400);
    expect(fixture.calls).toEqual([]);
  });

  it('distingue vacío real, página vacía, error de DB, infraestructura y configuración privada ausente', async () => {
    const page = await request(app.getHttpServer())
      .get(`${path}/collections?page=99`)
      .expect(200)
      .then(asJson<SeedPage>);
    expect(page.body.data).toMatchObject({
      items: [],
      total: 7,
      totalPages: 1,
    });
    fixture.tables.recoleccion = [];
    const overview = await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .then(asJson<SeedOverview>);
    expect(overview.body.data.summary).toMatchObject({
      collectionsCount: 0,
      totalsByUnit: [],
      lastCollectionAt: null,
    });
    const empty = await request(app.getHttpServer())
      .get(`${path}/collections`)
      .expect(200)
      .then(asJson<SeedPage>);
    expect(empty.body.data).toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
    });
    fixture.state.errorTable = 'recoleccion';
    const error = await request(app.getHttpServer()).get(path).expect(503);
    expect(JSON.stringify(error.body)).not.toContain('private');
    fixture.state.errorTable = '';
    fixture.state.throwTable = 'recoleccion';
    await request(app.getHttpServer()).get(`${path}/collections`).expect(503);
    unavailableAdmin = true;
    await request(app.getHttpServer()).get(path).expect(503);
  });

  it.each([
    'v_ubicacion_enriquecida',
    'tipos_entidad_evidencia',
    'evidencias_trazabilidad',
  ])('no oculta fallos de %s como fotos o banco vacío', async (table) => {
    fixture.state.errorTable = table;
    await request(app.getHttpServer()).get(`${path}/collections/3`).expect(503);
  });

  it('mantiene las rutas anónimas y el DTO de filtros en Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    for (const endpoint of [
      path,
      `${path}/collections`,
      `${path}/collections/{id}`,
      `${path}/collections/{id}/photos/{photoId}`,
    ]) {
      expect(document.paths[endpoint].get?.security).toBeUndefined();
    }
    const names = document.paths[`${path}/collections`].get?.parameters?.map(
      (parameter) => ('name' in parameter ? parameter.name : ''),
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'q',
        'speciesId',
        'locationId',
        'from',
        'to',
        'blockchain',
        'sort',
        'page',
        'pageSize',
      ]),
    );
  });
});
