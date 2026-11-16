import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasController } from '../api/campanias.controller';
import { CampaniasCreationService } from '../application/campanias-creation.service';
import { CampaniasService } from '../application/campanias.service';

// Controller, guard, JWT, DTO y caso de uso reales. Sólo Supabase es sintético;
// la transacción real se verifica con campania-creacion-111-test.py por separado.
describe('POST campanias — contrato HTTP y actor verificado', () => {
  let app: INestApplication<Server>;
  const secret = 'campania-111-http-sintetico';
  const jwt = new JwtService({ secret });
  const dto = {
    nombre: 'Campaña local',
    tipo: 'REFORESTACION',
    organizacion_ids: [20, 21],
  };
  const created = {
    id: 100,
    nombre: dto.nombre,
    tipo: dto.tipo,
    codigo_trazabilidad: 'CMP-2026-1000',
    descripcion: null,
    fecha_estimada_inicio: null,
    fecha_estimada_fin: null,
    created_at: '2026-11-16T10:00:00-04:00',
  };
  const rpc = jest.fn<
    Promise<{ data: unknown; error: unknown }>,
    [string, Record<string, unknown>]
  >();
  const from = jest.fn(() => {
    throw new Error('Escritura directa inesperada');
  });
  const getClient = jest.fn(() => {
    throw new Error('Cliente público inesperado');
  });
  const supabase = {
    getClient,
    getAdminClient: () => ({ rpc, from }),
  } as unknown as SupabaseService;
  const token = (sub = 'admin-verificado') =>
    jwt.sign({ sub }, { expiresIn: '5m' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [CampaniasController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
          },
        },
        { provide: SupabaseService, useValue: supabase },
        {
          provide: CampaniasService,
          useValue: new CampaniasCreationService(supabase),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    rpc.mockImplementation((name: string) => {
      if (name === 'pa_actor_verificar')
        return Promise.resolve({
          data: { usuario_id: '9007199254740993', rol: 'ADMIN', activo: true },
          error: null,
        });
      if (name === 'fn_crear_campania')
        return Promise.resolve({ data: created, error: null });
      throw new Error('RPC inesperada: ' + name);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('crea con Bearer y sin x-auth-id; transmite sólo el sub verificado a la RPC privada', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/campanias')
      .set('Authorization', `Bearer ${token()}`)
      .send(dto)
      .expect(201);
    expect(result.body).toEqual({
      success: true,
      data: { message: 'Campaña creada correctamente.', ...created },
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, 'fn_crear_campania', {
      p_auth_id: 'admin-verificado',
      p_nombre: dto.nombre,
      p_tipo: dto.tipo,
      p_descripcion: null,
      p_fecha_estimada_inicio: null,
      p_fecha_estimada_fin: null,
      p_organizacion_ids: dto.organizacion_ids,
    });
    expect(from).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rechaza headers legados sin JWT antes de consultar SQL', async () => {
    await request(app.getHttpServer())
      .post('/api/campanias')
      .set('x-auth-id', 'admin-verificado')
      .set('x-user-role', 'ADMIN')
      .send(dto)
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza x-auth-id discordante con el JWT antes de consultar SQL', async () => {
    await request(app.getHttpServer())
      .post('/api/campanias')
      .set('Authorization', `Bearer ${token()}`)
      .set('x-auth-id', 'otro')
      .send(dto)
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza un actor inyectado por body antes de invocar el alta', async () => {
    await request(app.getHttpServer())
      .post('/api/campanias')
      .set('Authorization', `Bearer ${token()}`)
      .send({ ...dto, actor_id: 2 })
      .expect(400);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('pa_actor_verificar');
  });

  it('rechaza la cuenta inactiva en el guard antes del alta', async () => {
    rpc.mockResolvedValue({
      data: { usuario_id: '1', rol: 'ADMIN', activo: false },
      error: null,
    });
    await request(app.getHttpServer())
      .post('/api/campanias')
      .set('Authorization', `Bearer ${token()}`)
      .send(dto)
      .expect(403);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PT403', 403, 'Solo el rol ADMIN puede realizar esta operación.'],
    [
      'PT400',
      400,
      'Las organizaciones asociadas deben existir en el catálogo.',
    ],
    ['PT422', 422, 'Ya existe una campaña con ese nombre.'],
    ['55P03', 503, 'Aborto técnico'],
  ])(
    'un rechazo transaccional %s nunca devuelve success parcial',
    async (code, status, message) => {
      rpc.mockImplementation((name: string) =>
        Promise.resolve(
          name === 'pa_actor_verificar'
            ? {
                data: { usuario_id: '1', rol: 'GENERAL', activo: true },
                error: null,
              }
            : { data: null, error: { code, message } },
        ),
      );
      const result = await request(app.getHttpServer())
        .post('/api/campanias')
        .set('Authorization', `Bearer ${token()}`)
        .set('x-user-role', 'ADMIN')
        .send(dto)
        .expect(status);
      expect((result.body as { success?: boolean }).success).not.toBe(true);
      expect(rpc).toHaveBeenCalledTimes(2);
    },
  );

  it('documenta Bearer, header opcional, asociaciones opcionales y garantía atómica', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const post = document.paths['/api/campanias'].post!;
    expect(post.security).toContainEqual({ bearer: [] });
    expect(post.security).not.toContainEqual({ 'x-auth-id': [] });
    expect(post.parameters).toContainEqual(
      expect.objectContaining({ name: 'x-auth-id', required: false }),
    );
    expect(post.description).toContain('una sola transacción');
    expect(post.responses['503']).toBeDefined();
    expect(post.requestBody).toMatchObject({
      content: {
        'application/json': { schema: { required: ['nombre', 'tipo'] } },
      },
    });
  });
});
