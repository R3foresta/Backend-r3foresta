import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureGlobalRoutes } from '../app.routes';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { UsuariosAdministracionService } from './application/usuarios-administracion.service';
import { UsuariosAdministracionController } from './usuarios-administracion.controller';

describe('Usuarios administrativos HTTP: JWT real y RPC sustituida', () => {
  let app: INestApplication<Server>;
  const secret = 'usuarios-http-fixture';
  const jwt = new JwtService({ secret });
  const token = (sub: string, claims: Record<string, unknown> = {}) =>
    'Bearer ' + jwt.sign({ sub, ...claims }, { expiresIn: 600 });
  const observado_en = '2026-11-03T16:00:00.000Z';
  const usuario = {
    usuario_id: '9007199254740995',
    nombre: 'José',
    username: 'jose-fixture',
    rol_global: 'VOLUNTARIO',
    activo: true,
    revision_autoridad: '9007199254740997',
  };
  const listing = jest.fn();
  const rpc = jest.fn((name: string, params: Record<string, unknown>) => {
    if (name === 'pa_actor_verificar') {
      const roles: Record<string, string> = {
        admin: 'ADMIN',
        general: 'GENERAL',
        validator: 'VALIDADOR',
        volunteer: 'VOLUNTARIO',
        contextual: 'VOLUNTARIO',
        inactive: 'ADMIN',
      };
      const sub = String(params.p_auth_id);
      return Promise.resolve({
        data: roles[sub]
          ? {
              usuario_id: '9007199254740993',
              rol: roles[sub],
              activo: sub !== 'inactive',
            }
          : null,
        error: null,
      });
    }
    if (name === 'pa_usuarios_administracion_leer') return listing(params);
    throw new Error('RPC inesperada');
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsuariosAdministracionController],
      providers: [
        UsuariosAdministracionService,
        VerifiedActorGuard,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => secret } },
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => ({ rpc }) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    rpc.mockClear();
    listing.mockReset().mockResolvedValue({
      data: { data: [usuario], observado_en },
      error: null,
    });
  });
  afterAll(async () => app?.close());

  it('entrega selector mínimo sin caché pública e IDs/revisión como texto', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('admin'))
      .expect(200);
    expect(response.body).toEqual({
      data: [usuario],
      observado_en,
      siguiente_cursor: null,
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Authorization');
    expect(Object.keys(response.body.data[0])).toEqual(Object.keys(usuario));
    expect(listing).toHaveBeenCalledWith({
      p_actor_id: '9007199254740993',
      p_auth_id: 'admin',
      p_consulta: null,
      p_rol_global: null,
      p_despues_id: null,
      p_limite: 21,
    });
  });

  it('normaliza búsqueda y filtra por rol sin aceptar actor desde query', async () => {
    listing.mockResolvedValueOnce({
      data: {
        data: [{ ...usuario, rol_global: 'VALIDADOR' }],
        observado_en,
      },
      error: null,
    });
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .query({
        consulta: ' Jose\u0301_% ',
        rol_global: 'VALIDADOR',
        limite: '3',
      })
      .set('Authorization', token('admin'))
      .expect(200);
    expect(listing).toHaveBeenCalledWith(
      expect.objectContaining({
        p_consulta: 'José_%',
        p_rol_global: 'VALIDADOR',
        p_limite: 4,
      }),
    );
  });

  it.each(['general', 'validator', 'volunteer', 'contextual'])(
    'niega %s aunque JWT y header afirmen ADMIN',
    async (sub) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/usuarios')
        .set('Authorization', token(sub, { rol: 'ADMIN' }))
        .set('x-user-role', 'ADMIN')
        .expect(403);
      expect(response.body.error.codigo).toBe('CAPACIDAD_INSUFICIENTE');
      expect(listing).not.toHaveBeenCalled();
    },
  );

  it('exige JWT válido y cuenta activa; x-auth-id nunca autentica', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('x-auth-id', 'admin')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', 'Bearer inventado')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('admin'))
      .set('x-auth-id', 'otra-cuenta')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('missing'))
      .expect(401);
    const inactive = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('inactive'))
      .expect(403);
    expect(inactive.body.error.codigo).toBe('CUENTA_INACTIVA');
    expect(listing).not.toHaveBeenCalled();
  });

  it.each([
    { consulta: 'A' },
    { rol_global: 'PLANTADOR' },
    { limite: '21' },
    { actor_id: '1' },
    { cursor: 'inventado' },
    { rol_global: ['ADMIN', 'GENERAL'] },
  ])('rechaza query inválida %j antes del directorio SQL', async (query) => {
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .query(query)
      .set('Authorization', token('admin'))
      .expect(422);
    expect(listing).not.toHaveBeenCalled();
  });

  it('pagina con cursor y rechaza reutilizarlo cambiando los filtros', async () => {
    listing.mockResolvedValueOnce({
      data: {
        data: [usuario, { ...usuario, usuario_id: '9007199254740997' }],
        observado_en,
      },
      error: null,
    });
    const first = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .query({ limite: '1' })
      .set('Authorization', token('admin'))
      .expect(200);
    expect(first.body.data).toEqual([usuario]);
    expect(first.body.siguiente_cursor).toEqual(expect.any(String));
    listing.mockResolvedValueOnce({
      data: { data: [], observado_en },
      error: null,
    });
    const second = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .query({ limite: '1', cursor: first.body.siguiente_cursor })
      .set('Authorization', token('admin'))
      .expect(200);
    expect(second.body.siguiente_cursor).toBeNull();
    expect(listing).toHaveBeenLastCalledWith(
      expect.objectContaining({ p_despues_id: usuario.usuario_id }),
    );
    await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .query({
        limite: '1',
        cursor: first.body.siguiente_cursor,
        rol_global: 'ADMIN',
      })
      .set('Authorization', token('admin'))
      .expect(422);
    expect(listing).toHaveBeenCalledTimes(2);
  });

  it('respeta revocación entre guard y consulta SQL, sin responder directorio vacío', async () => {
    listing.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PT403',
        details: JSON.stringify({
          codigo: 'CAPACIDAD_INSUFICIENTE',
          mensaje: 'No tiene capacidad para esta operación.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        }),
      },
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('admin'))
      .expect(403);
    expect(response.body.error.codigo).toBe('CAPACIDAD_INSUFICIENTE');
    expect(response.body.data).toBeUndefined();
  });

  it('oculta fallos internos y campos privados inesperados de SQL', async () => {
    listing.mockRejectedValueOnce(
      new Error('secreto privado de infraestructura'),
    );
    const failed = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('admin'))
      .expect(503);
    expect(JSON.stringify(failed.body)).not.toContain('secreto privado');
    listing.mockResolvedValueOnce({
      data: {
        data: [
          {
            ...usuario,
            correo: 'privado@example.test',
            auth_id: 'identidad-privada',
          },
        ],
        observado_en,
      },
      error: null,
    });
    const incompatible = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', token('admin'))
      .expect(503);
    expect(JSON.stringify(incompatible.body)).not.toContain(
      'privado@example.test',
    );
  });
});
