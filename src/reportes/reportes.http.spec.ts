import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureGlobalRoutes } from '../app.routes';
import { SupabaseService } from '../supabase/supabase.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

describe('Reportes de plantaciones administrativos HTTP', () => {
  let app: INestApplication<Server>;
  const secret = 'reportes-plantaciones-fixture';
  const jwt = new JwtService({ secret });
  const base = '/api/v1/reportes/plantaciones';
  const consulta = base + '?desde=2026-01-01&hasta=2026-11-18';
  const bearer = (sub: string) =>
    'Bearer ' + jwt.sign({ sub, rol: 'ADMIN' }, { expiresIn: 600 });
  const resultado = {
    observado_en: '2026-11-18T18:30:00.000Z',
    totales: { registros: 1, iniciales: 40, reposiciones: 0, total: 40 },
  };
  const lectura = jest.fn();
  const rpc = jest.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === 'pa_actor_verificar') {
      const roles: Record<string, string> = {
        admin: 'ADMIN',
        general: 'GENERAL',
        inactive: 'ADMIN',
      };
      const auth = String(params.p_auth_id);
      return {
        data: roles[auth]
          ? {
              usuario_id: '9007199254740993',
              rol: roles[auth],
              activo: auth !== 'inactive',
            }
          : null,
        error: null,
      };
    }
    if (name === 'reportes_plantaciones_leer') return lectura(params);
    throw new Error('RPC inesperada');
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [
        ReportesService,
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
    lectura.mockReset().mockResolvedValue({ data: resultado, error: null });
  });

  afterAll(async () => app?.close());

  it('consulta fechas, identidad e IDs exactos con una lectura protegida', async () => {
    const result = await request(app.getHttpServer())
      .get(
        consulta +
          '&organizacion_id=9007199254740995&campania_id=2&planta_id=3',
      )
      .set('Authorization', bearer('admin'))
      .expect(200);
    expect(result.body).toEqual({ success: true, data: resultado });
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.headers.vary).toBe('Authorization');
    expect(lectura).toHaveBeenCalledTimes(1);
    expect(lectura).toHaveBeenCalledWith({
      p_actor_id: '9007199254740993',
      p_auth_id: 'admin',
      p_desde: '2026-01-01',
      p_hasta: '2026-11-18',
      p_organizacion_id: '9007199254740995',
      p_campania_id: '2',
      p_planta_id: '3',
    });
  });

  it.each([
    ['?desde=2026-02-30&hasta=2026-11-18', 'desde'],
    ['?desde=2026-11-18&hasta=2026-01-01', 'hasta'],
    ['?desde=2026-01-01', 'hasta'],
    ['?desde=2026-01-01&hasta=2026-11-18&planta_id=01', 'planta_id'],
    ['?desde=2026-01-01&hasta=2026-11-18&planta_id=1&planta_id=2', 'planta_id'],
    ['?desde=2026-01-01&hasta=2026-11-18&actor_id=2', 'query'],
  ])('rechaza filtros inválidos (%s)', async (query, campo) => {
    const result = await request(app.getHttpServer())
      .get(base + query)
      .set('Authorization', bearer('admin'))
      .expect(422);
    expect(result.body.error.campos).toEqual([campo]);
    expect(lectura).not.toHaveBeenCalled();
  });

  it('rechaza una cuenta interna sin autoridad aunque su token declare ADMIN', async () => {
    await request(app.getHttpServer())
      .get(consulta)
      .set('Authorization', bearer('general'))
      .set('x-user-role', 'ADMIN')
      .expect(403);
    expect(lectura).not.toHaveBeenCalled();
  });

  it('rechaza una revocación detectada por la lectura de base de datos', async () => {
    lectura.mockResolvedValueOnce({ data: null, error: { code: 'PT403' } });
    await request(app.getHttpServer())
      .get(consulta)
      .set('Authorization', bearer('admin'))
      .expect(403);
  });

  it('responde 503 cuando falla la lectura en lugar de devolver valores vacíos', async () => {
    lectura.mockResolvedValueOnce({ data: null, error: { code: '42883' } });
    await request(app.getHttpServer())
      .get(consulta)
      .set('Authorization', bearer('admin'))
      .expect(503);
  });

  it('revalida el permiso de exportación con sesión, cuenta activa y rol', async () => {
    const permiso = base + '/permiso-exportacion';
    const result = await request(app.getHttpServer())
      .get(permiso)
      .set('Authorization', bearer('admin'))
      .expect(204);
    expect(result.headers['cache-control']).toBe('private, no-store');
    await request(app.getHttpServer()).get(permiso).expect(401);
    await request(app.getHttpServer())
      .get(permiso)
      .set('Authorization', bearer('general'))
      .expect(403);
    await request(app.getHttpServer())
      .get(permiso)
      .set('Authorization', bearer('inactive'))
      .expect(403);
    expect(lectura).not.toHaveBeenCalled();
  });
});
