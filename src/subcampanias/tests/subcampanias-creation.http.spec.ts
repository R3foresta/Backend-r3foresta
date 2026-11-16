import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasController } from '../api/subcampanias.controller';
import { SubcampaniasCreationService } from '../application/subcampanias-creation.service';
import { SubcampaniasService } from '../application/subcampanias.service';

describe('POST subcampanias — Bearer y alta privada', () => {
  let app: INestApplication<Server>;
  const secret = 'subcampania-112-http-sintetico';
  const jwt = new JwtService({ secret });
  const dto = {
    campania_id: 1,
    nombre: 'Subcampaña local',
    zona_id: 10,
    meta_total_arboles: 600,
  };
  const rpc = jest.fn<
    Promise<{ data: unknown; error: unknown }>,
    [string, { p_auth_id: string }]
  >();
  const from = jest.fn(() => {
    throw new Error('Consulta directa inesperada');
  });
  const getClient = jest.fn(() => {
    throw new Error('Cliente público inesperado');
  });
  const supabase = {
    getClient,
    getAdminClient: () => ({ rpc, from }),
  } as unknown as SupabaseService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [SubcampaniasController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
          },
        },
        { provide: SupabaseService, useValue: supabase },
        {
          provide: SubcampaniasService,
          useValue: new SubcampaniasCreationService(supabase),
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
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    rpc.mockImplementation((name: string, params: { p_auth_id: string }) => {
      if (name === 'pa_actor_verificar')
        return Promise.resolve({
          data: { usuario_id: '9007199254740993', rol: 'ADMIN', activo: true },
          error: null,
        });
      if (name === 'pa_d_subcampania_crear')
        return Promise.resolve({
          data: {
            ...dto,
            id: 100,
            tipo: 'REFORESTACION',
            estado: 'BORRADOR',
            codigo_trazabilidad: 'SUB-001-CMP-2026-001',
          },
          error: null,
        });
      throw new Error(`RPC inesperada ${name} ${params.p_auth_id}`);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza x-auth-id/x-user-role sin Bearer antes de consultar SQL', async () => {
    await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('x-auth-id', 'admin')
      .set('x-user-role', 'ADMIN')
      .send(dto)
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('crea sin x-auth-id y transmite exclusivamente el sub verificado, sin parsear el BIGINT del actor', async () => {
    const token = jwt.sign({ sub: 'admin-exacto' }, { expiresIn: '5m' });
    const result = await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('Authorization', `Bearer ${token}`)
      .send(dto)
      .expect(201);
    expect(result.body).toMatchObject({
      success: true,
      data: { estado: 'BORRADOR', meta_total_arboles: 600 },
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, 'pa_d_subcampania_crear', {
      p_auth_id: 'admin-exacto',
      p_payload: dto,
    });
    expect(from).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rechaza un x-auth-id discordante con el JWT', async () => {
    const token = jwt.sign({ sub: 'admin' }, { expiresIn: '5m' });
    await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('Authorization', `Bearer ${token}`)
      .set('x-auth-id', 'otro')
      .send(dto)
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza actor o tipo inyectados por body antes del alta', async () => {
    const token = jwt.sign({ sub: 'admin' }, { expiresIn: '5m' });
    await request(app.getHttpServer())
      .post('/api/subcampanias')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...dto, actor_id: 2, tipo: 'FORESTACION' })
      .expect(400);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('pa_actor_verificar');
  });

  it('documenta Bearer y x-auth-id opcional en el POST', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const post = document.paths['/api/subcampanias'].post!;
    expect(post.security).toContainEqual({ bearer: [] });
    expect(post.security).not.toContainEqual({ 'x-auth-id': [] });
    expect(post.parameters).toContainEqual(
      expect.objectContaining({
        name: 'x-auth-id',
        in: 'header',
        required: false,
      }),
    );
  });
});
