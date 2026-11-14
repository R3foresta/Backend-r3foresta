import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureGlobalRoutes } from '../app.routes';
import { InternalActorGuard } from '../auth/internal-actor.guard';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { ViveroAuthService } from '../lotes-vivero/application/vivero-auth.service';
import { RecoleccionAuthService } from '../recolecciones/application/recoleccion-auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EvidenciasTrazabilidadController } from './evidencias-trazabilidad.controller';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';

// Controller/DTO/servicio/guard reales; DB y Storage sintéticos sin .env.
// El contrato genérico excluye T5 incluso para quien puede consultar su evento.
describe('T5: las rutas genéricas excluyen fotos privadas', () => {
  const secret = 't5-evidencia-generica-fixture';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });
  const evento = '9007199255741001';
  const base = '/api/evidencias-trazabilidad';
  let app: INestApplication;
  let rows: Record<string, any>[];
  const getPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://storage.invalid/public/legado.jpg' } }));
  const assertEvento = jest.fn(async (user: { id: string }, id: string) => {
    if (user.id !== '7' || id !== evento) throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
  });
  const queryCalls: unknown[][] = [];
  const tipoIds: Record<string, number> = { RECOLECCION: 1, EVENTO_LOTE_VIVERO: 9, LOTE_VIVERO: 10 };

  function table(name: string) {
    const conditions: Array<(row: any) => boolean> = [];
    let codigo = '';
    const resolve = () => {
      if (name === 'tipos_entidad_evidencia') return { data: { id: tipoIds[codigo], codigo }, error: null };
      const data = rows.filter((row) => conditions.every((c) => c(row)));
      return { data, count: data.length, error: null };
    };
    const q: any = {};
    for (const method of ['select', 'order', 'range']) q[method] = () => q;
    q.eq = (key: string, value: unknown) => { conditions.push((r) => String(r[key]) === String(value)); return q; };
    q.neq = (key: string, value: unknown) => { queryCalls.push(['neq', key, value]); conditions.push((r) => r[key] !== value); return q; };
    q.gt = (key: string, value: unknown) => { conditions.push((r) => BigInt(r[key]) > BigInt(String(value))); return q; };
    q.is = (key: string, value: unknown) => { conditions.push((r) => r[key] === value); return q; };
    q.ilike = (key: string, value: string) => { if (key === 'codigo') codigo = value.toUpperCase(); return q; };
    q.not = () => q;
    q.maybeSingle = async () => resolve();
    q.single = async () => { const result = resolve(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; };
    q.then = (resolvePromise: any, reject: any) => Promise.resolve(resolve()).then(resolvePromise, reject);
    return q;
  }
  function get(path: string, authId = 'authorized') {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${jwt.sign({ sub: authId })}`);
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })], controllers: [EvidenciasTrazabilidadController],
      providers: [InternalActorGuard, EvidenciasTrazabilidadService, EvidenceFileService,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined } },
        { provide: SupabaseService, useValue: { getAdminClient: () => ({ from: table,
          rpc: async (_: string, args: { p_auth_id: string }) => ({ data: { usuario_id: args.p_auth_id === 'authorized' ? '7' : '8', rol: 'GENERAL', activo: true }, error: null }),
          storage: { from: () => ({ getPublicUrl }) },
        }), getClient: () => { throw new Error('Cliente público no permitido'); } } },
        { provide: RecoleccionAuthService, useValue: { getUserByAuthId: async (id: string) => ({ id: id === 'authorized' ? '7' : '8', rol: 'GENERAL' }), isGlobalReviewer: () => false } },
        { provide: ViveroAuthService, useValue: { getUserByAuthId: async (id: string) => ({ id: id === 'authorized' ? '7' : '8', rol: 'GENERAL' }), assertEvento, assertLote: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication(); configureGlobalRoutes(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    rows = [{ id: '101', tipo_entidad_id: 9, entidad_id: evento, bucket: 'vivero_incorporaciones',
      ruta_archivo: 'vivero/incorporaciones/7/solicitud/foto.jpg', eliminado_en: null,
      tipo_entidad: { id: 9, codigo: 'EVENTO_LOTE_VIVERO' },
    }];
    queryCalls.length = 0; getPublicUrl.mockClear(); assertEvento.mockClear();
  });

  it.each(['authorized', 'without-scope'])('por ID devuelve404 para %s sin fabricarURL ni pedirStorage', async (actor) => {
    const response = await get(`${base}/101`, actor).expect(404);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Authorization');
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/ruta_archivo|signed_url|public_url/);
  });
  it.each([
    `${base}?tipo_entidad_codigo=EVENTO_LOTE_VIVERO&entidad_id=${evento}`,
    `${base}/entidad/EVENTO_LOTE_VIVERO/${evento}`,
  ])('excluyeT5 antes de conteo en %s con permisoM2', async (path) => {
    const response = await get(path).expect(200);
    expect(response.body.data).toEqual([]); expect(response.body.pagination.total).toBe(0);
    expect(queryCalls).toContainEqual(['neq', 'bucket', 'vivero_incorporaciones']);
    expect(assertEvento).toHaveBeenCalledWith({ id: '7', rol: 'GENERAL' }, evento);
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Authorization');
  });
  it.each([
    `${base}?tipo_entidad_codigo=EVENTO_LOTE_VIVERO&entidad_id=${evento}`,
    `${base}/entidad/EVENTO_LOTE_VIVERO/${evento}`,
  ])('mantiene denegación por objeto en %s sin permisoM2', async (path) => {
    const response = await get(path, 'without-scope').expect(403);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
  it('conserva el contrato de foto legada pública después de autorizar su evento', async () => {
    rows[0] = { ...rows[0], bucket: 'recoleccion_fotos', ruta_archivo: 'legado.jpg' };
    const response = await get(`${base}/101`).expect(200);
    expect(response.body.data.public_url).toBe('https://storage.invalid/public/legado.jpg');
    expect(assertEvento).toHaveBeenCalled();
  });
  it('exige Bearer incluso con x-auth-id para una foto privada', async () => {
    await request(app.getHttpServer()).get(`${base}/101`).set('x-auth-id', 'authorized').expect(401);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
