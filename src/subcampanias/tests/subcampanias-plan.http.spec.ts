import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureGlobalRoutes } from '../../app.routes';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasController } from '../api/subcampanias.controller';
import { GuardarPlanDto } from '../api/dto/guardar-plan.dto';
import { SubcampaniaPlanAuthGuard } from '../api/guards/subcampania-plan-auth.guard';
import { SubcampaniasActivacionService } from '../application/subcampanias-activacion.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasCancelacionService } from '../application/subcampanias-cancelacion.service';
import { SubcampaniasCierreService } from '../application/subcampanias-cierre.service';
import { SubcampaniasConsultasService } from '../application/subcampanias-consultas.service';
import { SubcampaniasCreationService } from '../application/subcampanias-creation.service';
import { SubcampaniasEdicionService } from '../application/subcampanias-edicion.service';
import { SubcampaniasEquipoService } from '../application/subcampanias-equipo.service';
import { SubcampaniasPlanService } from '../application/subcampanias-plan.service';
import { SubcampaniasPlantacionContextService } from '../application/subcampanias-plantacion-context.service';
import { SubcampaniasPoligonoService } from '../application/subcampanias-poligono.service';
import { SubcampaniasService } from '../application/subcampanias.service';
import { SubcampaniasModule } from '../subcampanias.module';

// Controlador, facade, JWT, validación y servicios reales; solo se sustituye
// la frontera de Supabase. Nunca carga .env ni consulta un servicio externo.
describe('GET/PUT plan — contrato HTTP y sesión', () => {
  let app: INestApplication<Server>;
  const secret = 'isolated-plan-http-test-secret';
  const jwt = new JwtService({ secret });
  const configuration: Record<string, string | undefined> = {
    JWT_SECRET: secret,
  };
  const users = new Map([
    ['admin', { id: 1, nombre: 'Admin', rol: 'ADMIN', activo: true }],
    ['general', { id: 2, nombre: 'General', rol: 'GENERAL', activo: true }],
    [
      'validador',
      { id: 3, nombre: 'Validador', rol: 'VALIDADOR', activo: true },
    ],
    [
      'voluntario',
      { id: 4, nombre: 'Voluntario', rol: 'VOLUNTARIO', activo: true },
    ],
    [
      'coordinador',
      { id: 5, nombre: 'Coordinador', rol: 'GENERAL', activo: true },
    ],
  ]);
  const snapshot = {
    subcampania_id: 1,
    estado: 'ACTIVA',
    meta_total_arboles: 40,
    plan_revision: 3,
    metas: [{ planta_id: 1, porcentaje_objetivo: 100, cantidad_objetivo: 40 }],
  };
  const revision: GuardarPlanDto = {
    meta_total_arboles: 40,
    revision_esperada: 3,
    metas: snapshot.metas,
  };
  const rpc = jest.fn();
  const single = jest.fn<
    Promise<{
      data: { id: number; nombre: string; rol: string } | null;
      error: { code: string; message?: string } | null;
    }>,
    [string]
  >();
  const eq = jest.fn((_column: string, authId: string) => ({
    single: () => single(authId),
  }));
  const from = jest.fn(() => ({ select: () => ({ eq }) }));
  const token = (sub: string) => jwt.sign({ sub }, { expiresIn: 60 });
  const call = (method: 'GET' | 'PUT') =>
    method === 'GET'
      ? request(app.getHttpServer()).get('/api/subcampanias/1/plan')
      : request(app.getHttpServer())
          .put('/api/subcampanias/1/plan')
          .send(revision);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [SubcampaniasController],
      providers: [
        SubcampaniasService,
        SubcampaniasPlanService,
        SubcampaniasEdicionService,
        SubcampaniasAuthService,
        SubcampaniaPlanAuthGuard,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configuration[key] },
        },
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => ({ from }),
            getAdminClient: () => ({
              from,
              rpc: async (name: string, params: Record<string, unknown>) => {
                if (name !== 'pa_actor_verificar')
                  return rpc(name, params) as { data: unknown; error: unknown };
                const result = await single(String(params.p_auth_id));
                return {
                  error: result.error,
                  data: result.data
                    ? {
                        usuario_id: String(result.data.id),
                        rol: result.data.rol,
                        activo: (result.data as { activo?: boolean }).activo,
                      }
                    : null,
                };
              },
            }),
          },
        },
        ...[
          SubcampaniasCreationService,
          SubcampaniasConsultasService,
          SubcampaniasPoligonoService,
          SubcampaniasActivacionService,
          SubcampaniasCierreService,
          SubcampaniasCancelacionService,
          SubcampaniasEquipoService,
          SubcampaniasPlantacionContextService,
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
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    configuration.JWT_SECRET = secret;
    from.mockClear();
    eq.mockClear();
    single.mockReset().mockImplementation((authId: string) =>
      Promise.resolve({
        data: users.get(authId) ?? null,
        error: null,
      }),
    );
    rpc.mockReset().mockResolvedValue({ data: snapshot, error: null });
  });

  it.each([...users.keys()])(
    'permite GET a %s sin exigir pertenencia al equipo',
    async (authId) => {
      const response = await call('GET')
        .set('Authorization', `Bearer ${token(authId)}`)
        .expect(200);
      expect(response.body).toEqual({ success: true, data: snapshot });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toContain('Authorization');
      expect(eq).toHaveBeenCalledWith('auth_id', authId);
      expect(rpc).toHaveBeenCalledWith('fn_subcampania_obtener_plan', {
        p_subcampania_id: 1,
      });
    },
  );

  it.each(['GET', 'PUT'] as const)(
    'rechaza %s con solo x-auth-id',
    async (method) => {
      await call(method).set('x-auth-id', 'admin').expect(401);
      expect(from).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'PUT'] as const)(
    'rechaza %s sin credenciales',
    async (method) => {
      await call(method).expect(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformado', 'invalid.token'],
    [
      'firma ajena',
      new JwtService({ secret: 'another-secret' }).sign(
        { sub: 'admin' },
        { expiresIn: 60 },
      ),
    ],
    ['expirado', jwt.sign({ sub: 'admin' }, { expiresIn: -1 })],
    ['sin identidad', jwt.sign({}, { expiresIn: 60 })],
    ['identidad numérica', jwt.sign({ sub: 1 }, { expiresIn: 60 })],
    ['identidad vacía', jwt.sign({ sub: ' ' }, { expiresIn: 60 })],
    ['sin expiración', jwt.sign({ sub: 'admin' })],
    [
      'algoritmo distinto',
      jwt.sign({ sub: 'admin' }, { expiresIn: 60, algorithm: 'HS384' }),
    ],
  ])('rechaza token %s antes de leer el plan', async (_label, value) => {
    await call('GET').set('Authorization', `Bearer ${value}`).expect(401);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT'] as const)(
    'impide suplantar x-auth-id en %s',
    async (method) => {
      await call(method)
        .set('Authorization', `Bearer ${token('general')}`)
        .set('x-auth-id', 'admin')
        .expect(401);
      expect(from).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('acepta el header opcional cuando coincide con el JWT', async () => {
    await call('GET')
      .set('Authorization', `Bearer ${token('general')}`)
      .set('x-auth-id', 'general')
      .expect(200);
  });

  it.each(['GET', 'PUT'] as const)(
    'rechaza %s si el usuario del JWT ya no existe',
    async (method) => {
      await call(method)
        .set('Authorization', `Bearer ${token('deleted-user')}`)
        .expect(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each(['general', 'validador', 'voluntario', 'coordinador'])(
    'rechaza PUT para %s',
    async (authId) => {
      await call('PUT')
        .set('Authorization', `Bearer ${token(authId)}`)
        .expect(403);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('no usa el rol declarado en un JWT para elevar permisos', async () => {
    const value = jwt.sign({ sub: 'general', rol: 'ADMIN' }, { expiresIn: 60 });
    await call('PUT').set('Authorization', `Bearer ${value}`).expect(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('guarda con el actor ADMIN resuelto desde la base', async () => {
    await call('PUT')
      .set('Authorization', `Bearer ${token('admin')}`)
      .expect(200);
    expect(rpc).toHaveBeenCalledWith('fn_subcampania_revisar_plan', {
      p_subcampania_id: 1,
      p_meta_total_arboles: 40,
      p_metas: snapshot.metas,
      p_actor_user_id: 1,
      p_revision_esperada: 3,
    });
  });

  it('propaga 409 de revisión obsoleta sin reintentar con otra versión', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT409', message: 'Revisión obsoleta' },
    });
    await call('PUT')
      .set('Authorization', `Bearer ${token('admin')}`)
      .expect(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('devuelve 404 para un plan inexistente después de autenticar al usuario', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await call('GET')
      .set('Authorization', `Bearer ${token('general')}`)
      .expect(404);
  });

  it('distingue una falla de verificación de usuario de una sesión inválida', async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'DB unavailable' },
    });
    await call('GET')
      .set('Authorization', `Bearer ${token('general')}`)
      .expect(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza operar con el secret de desarrollo si JWT_SECRET no está configurado', async () => {
    configuration.JWT_SECRET = undefined;
    await call('GET')
      .set('Authorization', `Bearer ${token('general')}`)
      .expect(500);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('PATCH no permite modificar meta junto con otros campos', async () => {
    await request(app.getHttpServer())
      .patch('/api/subcampanias/1')
      .set('Authorization', `Bearer ${token('admin')}`)
      .set('x-auth-id', 'admin')
      .send({ meta_total_arboles: 60, descripcion: 'Cambio' })
      .expect(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('usuario');
  });

  it('el módulo real resuelve el guard con el JWT configurado del login', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: secret })],
        }),
        SubcampaniasModule,
      ],
    })
      .overrideProvider(SupabaseService)
      .useValue({
        getClient: () => ({ from }),
        getAdminClient: () => ({
          from,
          rpc: async (name: string, params: Record<string, unknown>) => {
            if (name !== 'pa_actor_verificar')
              return rpc(name, params) as { data: unknown; error: unknown };
            const result = await single(String(params.p_auth_id));
            return {
              error: result.error,
              data: result.data
                ? {
                    usuario_id: String(result.data.id),
                    rol: result.data.rol,
                    activo: (result.data as { activo?: boolean }).activo,
                  }
                : null,
            };
          },
        }),
      })
      .compile();
    try {
      expect(module.get(SubcampaniaPlanAuthGuard)).toBeDefined();
      expect(module.get(SubcampaniasPlanService)).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
