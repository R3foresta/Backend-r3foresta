import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureGlobalRoutes } from '../../app.routes';
import { InternalActorGuard } from '../../auth/internal-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionesController } from '../api/recolecciones.controller';
import { RecoleccionFormDataParser } from '../api/parsers/recoleccion-formdata.parser';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionCreationService } from '../application/recoleccion-creation.service';
import { RecoleccionDesechoService } from '../application/recoleccion-desecho.service';
import { RecoleccionEliminacionService } from '../application/recoleccion-eliminacion.service';
import { RecoleccionDraftService } from '../application/recoleccion-draft.service';
import { RecoleccionElegibilidadService } from '../application/recoleccion-elegibilidad.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';
import { RecoleccionUbicacionService } from '../application/recoleccion-ubicacion.service';
import { RecoleccionValidacionService } from '../application/recoleccion-validacion.service';
import { RecoleccionesService } from '../application/recolecciones.service';

type Row = Record<string, unknown>;
type HistorialResponse = { planta: unknown; data: Row[]; pagination: unknown };
const plants: Row[] = [
  {
    id: 1,
    especie: 'Cedro',
    nombre_cientifico: 'Cedrela',
    variedad: null,
    nombre_comun_principal: 'Cedro',
    imagen_url: null,
  },
  {
    id: 2,
    especie: 'Sin registros',
    nombre_cientifico: null,
    variedad: null,
    nombre_comun_principal: null,
    imagen_url: null,
  },
];
const base = {
  planta_id: 1,
  tipo_material: 'SEMILLA',
  estado_registro: 'VALIDADO',
  eliminado_en: null,
  fecha: '2026-01-01',
  created_at: '2026-01-01T12:00:00Z',
  cantidad_inicial_canonica: 10,
  unidad_canonica: 'G',
  saldo_actual: 10,
  estado_operativo: 'ABIERTO',
  nombre_recolector_snapshot: 'Recolector histórico',
  codigo_trazabilidad: 'REC',
};
const collections: Row[] = [
  { ...base, id: 11, usuario_id: 7, usuario: { id: 7, nombre: 'Admin' } },
  {
    ...base,
    id: 12,
    usuario_id: 8,
    usuario: { id: 8, nombre: 'Otra persona' },
    saldo_actual: 0,
    estado_operativo: 'CERRADO',
    nombre_recolector_snapshot: 'Nombre original',
    nombre_cientifico_snapshot: 'Nombre histórico',
    planta: { nombre_cientifico: 'Nombre actual' },
  },
  {
    ...base,
    id: 13,
    usuario_id: 9,
    fecha: '2026-01-02',
    created_at: '2026-01-01T10:00:00Z',
    unidad_canonica: 'UNIDAD',
  },
  {
    ...base,
    id: 14,
    usuario_id: 9,
    fecha: '2026-01-01',
    created_at: '2026-01-01T13:00:00Z',
  },
  { ...base, id: 90, planta_id: 2, tipo_material: 'ESQUEJE' },
  { ...base, id: 96, planta_id: 3 },
  { ...base, id: 91, tipo_material: 'ESQUEJE' },
  { ...base, id: 92, estado_registro: 'BORRADOR' },
  { ...base, id: 93, estado_registro: 'PENDIENTE_VALIDACION' },
  { ...base, id: 94, estado_registro: 'RECHAZADO' },
  { ...base, id: 95, eliminado_en: '2026-01-01' },
];
// Emula el subconjunto PostgREST usado por la lectura, sin servicios externos.
class Query {
  private filters: Array<[string, unknown]> = [];
  private orders: Array<[string, boolean]> = [];
  private start = 0;
  private end = Infinity;
  constructor(
    private rows: Row[],
    private fail = false,
  ) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  order(key: string, options: { ascending: boolean }) {
    this.orders.push([key, options.ascending]);
    return this;
  }
  range(start: number, end: number) {
    this.start = start;
    this.end = end;
    return this;
  }
  private result() {
    const filtered = this.rows.filter((row) =>
      this.filters.every(([key, value]) => row[key] === value),
    );
    filtered.sort((a, b) => {
      for (const [key, ascending] of this.orders) {
        if (a[key] === b[key]) continue;
        return (a[key] as string | number) > (b[key] as string | number)
          ? ascending
            ? 1
            : -1
          : ascending
            ? -1
            : 1;
      }
      return 0;
    });
    return {
      data: filtered.slice(this.start, this.end + 1),
      count: filtered.length,
      error: this.fail ? { message: 'fallo sintético' } : null,
    };
  }
  maybeSingle() {
    const result = this.result();
    return Promise.resolve({ ...result, data: result.data[0] ?? null });
  }
  then(resolve: (value: ReturnType<Query['result']>) => unknown) {
    return Promise.resolve(this.result()).then(resolve);
  }
}

describe('Historial administrativo de semillas (HTTP y servicio)', () => {
  let app: INestApplication<Server>;
  const secret = 'historial-semillas-fixture';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });
  let failingTable: string | null = null;
  const from = jest.fn((table: string) => {
    if (table === 'planta') return new Query(plants, failingTable === table);
    if (table === 'recoleccion')
      return new Query(collections, failingTable === table);
    throw new Error(`Tabla inesperada: ${table}`);
  });
  const rpc = jest.fn(
    (_name: string, { p_auth_id }: { p_auth_id: string }) => ({
      data: { usuario_id: '7', rol: p_auth_id, activo: true },
      error: null,
    }),
  );
  const asRole = (role: string) => `Bearer ${jwt.sign({ sub: role })}`;
  const url = '/api/recolecciones/stock-summary/1/historial';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [RecoleccionesController],
      providers: [
        InternalActorGuard,
        RecoleccionesService,
        RecoleccionConsultasService,
        RecoleccionAuthService,
        { provide: ConfigService, useValue: { get: () => secret } },
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => ({ from, rpc }) },
        },
        {
          provide: RecoleccionUbicacionService,
          useValue: {
            enrichRecoleccionesWithUbicaciones: (rows: Row[]) =>
              Promise.resolve(rows),
          },
        },
        {
          provide: RecoleccionEvidenciasService,
          useValue: {
            getEvidenciasMapByRecoleccionIds: () => Promise.resolve(new Map()),
          },
        },
        {
          provide: RecoleccionElegibilidadService,
          useValue: {
            evaluarRecoleccionElegibleParaInicioVivero: () => ({
              elegible: false,
              motivo_no_elegibilidad: null,
              cantidad_solicitada: null,
            }),
          },
        },
        ...[
          RecoleccionCreationService,
          RecoleccionDraftService,
          RecoleccionDesechoService,
          RecoleccionEliminacionService,
          RecoleccionValidacionService,
          RecoleccionFormDataParser,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    failingTable = null;
  });
  it('incluye otros autores y cerradas, filtra material/estado/eliminación y pagina con orden estable', async () => {
    const first = await request(app.getHttpServer())
      .get(`${url}?page=1&limit=2`)
      .set('Authorization', asRole('ADMIN'))
      .expect(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    const firstBody = first.body as HistorialResponse;
    expect(firstBody.planta).toEqual({
      planta_id: 1,
      especie: 'Cedro',
      nombre_cientifico: 'Cedrela',
      variedad: null,
      nombre_comun_principal: 'Cedro',
      imagen_url: null,
    });
    expect(firstBody.data.map((row: Row) => row.id)).toEqual([13, 14]);
    expect(firstBody.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
    const second = await request(app.getHttpServer())
      .get(`${url}?page=2&limit=2`)
      .set('Authorization', asRole('ADMIN'))
      .expect(200);
    const secondBody = second.body as HistorialResponse;
    expect(secondBody.data.map((row: Row) => row.id)).toEqual([12, 11]);
    expect(secondBody.data[0]).toMatchObject({
      usuario_id: 8,
      nombre_recolector_snapshot: 'Nombre original',
      nombre_cientifico_snapshot: 'Nombre histórico',
      nombre_cientifico: 'Nombre histórico',
      planta: { nombre_cientifico: 'Nombre actual' },
      cantidad_inicial_canonica: 10,
      saldo_actual: 0,
      unidad_canonica: 'G',
      estado_operativo: 'CERRADO',
    });
    expect(secondBody.pagination).toMatchObject({
      page: 2,
      total: 4,
      hasNextPage: false,
      hasPrevPage: true,
    });
  });
  it('devuelve cabecera y lista vacía para planta existente sin semillas validadas', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/recolecciones/stock-summary/2/historial')
      .set('Authorization', asRole('ADMIN'))
      .expect(200);
    expect(response.body).toMatchObject({
      planta: { planta_id: 2 },
      data: [],
      pagination: { total: 0, totalPages: 0 },
    });
  });
  it.each(['GENERAL', 'VALIDADOR', 'VOLUNTARIO'])(
    'deniega %s incluso con rol de cabecera ADMIN',
    async (role) => {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', asRole(role))
        .set('x-user-role', 'ADMIN')
        .expect(403);
      expect(from).not.toHaveBeenCalled();
    },
  );
  it('rechaza un Bearer inválido', async () => {
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer invalido')
      .expect(401);
    expect(from).not.toHaveBeenCalled();
  });
  it('exige Bearer aunque se envíe x-auth-id', async () => {
    await request(app.getHttpServer())
      .get(url)
      .set('x-auth-id', 'ADMIN')
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'abc', '9007199254740992'])(
    'rechaza ID inválido %s',
    async (id) => {
      await request(app.getHttpServer())
        .get(`/api/recolecciones/stock-summary/${id}/historial`)
        .set('Authorization', asRole('ADMIN'))
        .expect(400);
      expect(from).not.toHaveBeenCalled();
    },
  );
  it.each([
    'page=0',
    'page=1.5',
    'page=2147483648',
    'limit=0',
    'limit=51',
    'limit=x',
  ])('rechaza paginación inválida %s', async (query) => {
    await request(app.getHttpServer())
      .get(`${url}?${query}`)
      .set('Authorization', asRole('ADMIN'))
      .expect(400);
    expect(from).not.toHaveBeenCalled();
  });
  it.each(['planta', 'recoleccion'])(
    'responde 500 si falla la lectura de %s',
    async (table) => {
      failingTable = table;
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', asRole('ADMIN'))
        .expect(500);
    },
  );
  it('responde 404 para planta inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/recolecciones/stock-summary/999/historial')
      .set('Authorization', asRole('ADMIN'))
      .expect(404);
  });
});
