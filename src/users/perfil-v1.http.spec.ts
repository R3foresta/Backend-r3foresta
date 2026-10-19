import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureGlobalRoutes } from '../app.routes';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ImpactController } from '../impact/impact.controller';
import { ImpactService } from '../impact/impact.service';
import { PerfilV1Controller } from './perfil-v1.controller';
import { PerfilV1Service } from './perfil-v1.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('PA-T-INT02-A contrato HTTP', () => {
  let app: INestApplication<Server>;
  const secret = 'isolated-profile-secret';
  const jwt = new JwtService({ secret });
  const register = jest.fn(() => ({
    success: true,
    token: 'ceremony-test-token',
  }));
  const rpc = jest.fn((name: string, params: Record<string, unknown>) => {
    if (name === 'pa_actor_verificar') {
      return Promise.resolve(
        ['vol', 'inactive', 'admin', 'general', 'validator'].includes(
          String(params.p_auth_id),
        )
          ? {
              data: {
                usuario_id: '9007199254740995',
                rol:
                  (
                    {
                      admin: 'ADMIN',
                      general: 'GENERAL',
                      validator: 'VALIDADOR',
                    } as Record<string, string>
                  )[String(params.p_auth_id)] ?? 'VOLUNTARIO',
                activo: params.p_auth_id !== 'inactive',
              },
              error: null,
            }
          : { data: null, error: null },
      );
    }
    if (name === 'pa_perfil_leer' || name === 'pa_perfil_actualizar') {
      return {
        data: {
          usuario_id: '9007199254740995',
          nombre: 'Voluntario',
          apellido: null,
          afiliacion: null,
          rol_global: 'VOLUNTARIO',
          contacto: 'no debe salir',
        },
        error: null,
      };
    }
    if (name === 'pa_organizaciones_seleccionables') {
      if (params.p_consulta === 'largo') {
        const rows = [
          { organizacion_id: '11', nombre: 'Z'.repeat(2000) },
          { organizacion_id: '12', nombre: 'Última' },
        ];
        return {
          data: params.p_despues_id === '11' ? rows.slice(1) : rows,
          error: null,
        };
      }
      return {
        data: [
          {
            organizacion_id: '9007199254740993',
            nombre: 'Bosque Vivo',
            orden_nombre: 'bosque vivo',
          },
        ],
        error: null,
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        PerfilV1Controller,
        UsersController,
        ImpactController,
        AuthController,
      ],
      providers: [
        PerfilV1Service,
        UsersService,
        VerifiedActorGuard,
        {
          provide: AuthService,
          useValue: {
            register,
            generateChallenge: () => ({ challenge: 'challenge' }),
          },
        },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: () => {
              const row = {
                id: Number('9007199254740995'),
                auth_id: 'vol',
                username: 'Voluntario',
                nombre: 'Voluntario',
                apellido: null,
                rol: 'VOLUNTARIO',
                activo: true,
              };
              const query = {
                select: () => query,
                eq: () => query,
                single: () => Promise.resolve({ data: row, error: null }),
              };
              return { rpc, from: () => query };
            },
          },
        },
        {
          provide: ImpactService,
          useValue: {
            listOrganizations: () => [{ id: 1, nombre: 'Bosque Vivo' }],
            getCampaignDetail: () => ({ campania_id: 7, registros: [] }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    jest
      .spyOn(module.get(UsersService), 'listarParaSelector')
      .mockResolvedValue([
        { id: 1, nombre: 'Interno', rol: 'GENERAL', foto_perfil_url: null },
      ]);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    configureGlobalRoutes(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });
  const token = (payload: Record<string, unknown>) => jwt.sign(payload);
  const valid = () =>
    token({ sub: 'vol', exp: Math.floor(Date.now() / 1000) + 60 });

  it('exige JWT y rechaza firma, vencimiento, claims y header ajeno', async () => {
    const path = '/api/v1/usuarios/me/perfil';
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('x-auth-id', 'vol')
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set(
        'Authorization',
        `Bearer ${new JwtService({ secret: 'other' }).sign({ sub: 'vol', exp: 9999999999 })}`,
      )
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token({ sub: 'vol', exp: 1 })}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token({ sub: 'vol' })}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token({ sub: '', exp: 9999999999 })}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${valid()}`)
      .set('x-auth-id', 'other')
      .expect(401);
  });

  it('lee perfil propio con BIGINT cadena y headers privados', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me/perfil')
      .set('Authorization', `Bearer ${valid()}`)
      .set('x-auth-id', 'vol')
      .expect(200);
    expect((response.body as { data: unknown }).data).toEqual({
      usuario_id: '9007199254740995',
      nombre: 'Voluntario',
      apellido: null,
      afiliacion: null,
      rol_global: 'VOLUNTARIO',
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toContain('Authorization');
    const spoof = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me/perfil')
      .set('Authorization', `Bearer ${valid()}`)
      .set('x-user-role', 'ADMIN')
      .expect(200);
    expect(
      (spoof.body as { data: { rol_global: string } }).data.rol_global,
    ).toBe('VOLUNTARIO');
    await request(app.getHttpServer())
      .get('/api/v1/usuarios/me/perfil')
      .set(
        'Authorization',
        `Bearer ${token({ sub: 'inactive', exp: Math.floor(Date.now() / 1000) + 60 })}`,
      )
      .expect(403);
  });

  it('rechaza autoridad y campos desconocidos antes de tocar persistencia', async () => {
    const path = '/api/v1/usuarios/me/perfil';
    const before = rpc.mock.calls.length;
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${valid()}`)
      .send({ rol_global: 'ADMIN' })
      .expect(422);
    await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${valid()}`)
      .send({
        afiliacion: {
          tipo: 'ORGANIZACION_REGISTRADA',
          organizacion_id: '2',
          nombre: 'Falso',
        },
      })
      .expect(422);
    expect(
      rpc.mock.calls
        .slice(before)
        .filter(([name]) => name === 'pa_perfil_actualizar'),
    ).toHaveLength(0);
    const legacy = await request(app.getHttpServer())
      .post('/api/users/register-form')
      .set('Authorization', `Bearer ${valid()}`)
      .send({ nombre: 'Voluntario', rol: 'GENERAL' })
      .expect(422);
    expect((legacy.body as { codigo: unknown }).codigo).toBe(
      'CAMPO_NO_PERMITIDO',
    );
  });

  it('normaliza perfil, valida ID y ofrece selector mínimo a VOLUNTARIO', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/usuarios/me/perfil')
      .set('Authorization', `Bearer ${valid()}`)
      .send({
        nombre: ' A\u0301na ',
        afiliacion: {
          tipo: 'ORGANIZACION_REGISTRADA',
          organizacion_id: '9007199254740993',
        },
      })
      .expect(200);
    expect(rpc).toHaveBeenCalledWith(
      'pa_perfil_actualizar',
      expect.objectContaining({
        p_nombre: 'Ána',
        p_organizacion_id: '9007199254740993',
      }),
    );
    await request(app.getHttpServer())
      .patch('/api/v1/usuarios/me/perfil')
      .set('Authorization', `Bearer ${valid()}`)
      .send({ afiliacion: { tipo: 'OTRA', nombre: ' Organización ' } })
      .expect(200);
    expect(rpc).toHaveBeenCalledWith(
      'pa_perfil_actualizar',
      expect.objectContaining({
        p_organizacion_otra: 'Organización',
        p_organizacion_id: null,
      }),
    );
    await request(app.getHttpServer())
      .patch('/api/v1/usuarios/me/perfil')
      .set('Authorization', `Bearer ${valid()}`)
      .send({ afiliacion: null })
      .expect(200);
    const selector = await request(app.getHttpServer())
      .get('/api/v1/participacion/organizaciones-seleccionables')
      .set('Authorization', `Bearer ${valid()}`)
      .expect(200);
    expect((selector.body as { data: unknown }).data).toEqual([
      { organizacion_id: '9007199254740993', nombre: 'Bosque Vivo' },
    ]);
    expect(
      (selector.body as { siguiente_cursor: unknown }).siguiente_cursor,
    ).toBeNull();
  });

  it('mantiene Impacto público con token ausente o vencido', async () => {
    for (const path of [
      '/api/v1/impact/organizations',
      '/api/v1/impact/organizations/1/campaigns/7',
    ]) {
      const visitor = await request(app.getHttpServer()).get(path).expect(200);
      const expired = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token({ sub: 'vol', exp: 1 })}`)
        .expect(200);
      expect(expired.body).toEqual(visitor.body);
      expect(visitor.headers['cache-control']).toBe('no-store');
    }
  });

  it('rechaza autoridad en alta pública y conserva la excepción WebAuthn', async () => {
    const payload = {
      username: ' Ana ',
      registration: {},
      challenge: 'challenge',
    };
    for (const field of [
      'rol',
      'activo',
      'actor_id',
      'permisos',
      'capacidades',
    ]) {
      const before = register.mock.calls.length;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...payload, [field]: 'ADMIN' })
        .expect(422);
      expect(register.mock.calls).toHaveLength(before);
    }
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(payload)
      .expect(201);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Ana' }),
      expect.any(String),
    );
    await request(app.getHttpServer()).get('/api/auth/challenge').expect(200);
  });

  it('cierra directorio interno a VOLUNTARIO y conserva roles operativos', async () => {
    for (const path of ['/api/users', '/api/users/rol/GENERAL']) {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${valid()}`)
        .set('x-user-role', 'ADMIN')
        .expect(403);
      for (const sub of ['admin', 'general', 'validator']) {
        await request(app.getHttpServer())
          .get(path)
          .set(
            'Authorization',
            `Bearer ${token({ sub, exp: Math.floor(Date.now() / 1000) + 60 })}`,
          )
          .expect(200);
      }
    }
  });

  it('pagina nombres largos con cursor acotado y no devuelve claves internas', async () => {
    const first = await request(app.getHttpServer())
      .get(
        '/api/v1/participacion/organizaciones-seleccionables?consulta=largo&limite=1',
      )
      .set('Authorization', `Bearer ${valid()}`)
      .expect(200);
    const body = first.body as {
      data: { organizacion_id: string; nombre: string }[];
      siguiente_cursor: string;
    };
    expect(body.data[0].nombre).toHaveLength(2000);
    expect(body.siguiente_cursor.length).toBeLessThanOrEqual(1024);
    const next = await request(app.getHttpServer())
      .get(
        `/api/v1/participacion/organizaciones-seleccionables?consulta=largo&limite=1&cursor=${body.siguiente_cursor}`,
      )
      .set('Authorization', `Bearer ${valid()}`)
      .expect(200);
    expect((next.body as { data: unknown }).data).toEqual([
      { organizacion_id: '12', nombre: 'Última' },
    ]);
  });

  it('conserva aliases propios con ID exacta y edición opcional sin rol', async () => {
    const profile = await request(app.getHttpServer())
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${valid()}`)
      .expect(200);
    expect((profile.body as { id: unknown }).id).toBe('9007199254740995');
    await request(app.getHttpServer())
      .post('/api/users/register-form')
      .set('Authorization', `Bearer ${valid()}`)
      .send({ nombre: ' Voluntario ', organizacion: null })
      .expect(201);
    expect(rpc).toHaveBeenCalledWith(
      'pa_perfil_actualizar',
      expect.objectContaining({
        p_usuario_id: '9007199254740995',
        p_auth_id: 'vol',
        p_nombre: 'Voluntario',
        p_cambiar_afiliacion: true,
        p_organizacion_id: null,
        p_organizacion_otra: null,
        p_datos_historicos: {},
      }),
    );
  });
});
