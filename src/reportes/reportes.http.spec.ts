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

type RespuestaRpc = { data: unknown; error: { code?: string } | null };

describe('Reportes administrativos HTTP', () => {
  let app: INestApplication<Server>;
  const secret = 'reportes-plantaciones-fixture';
  const jwt = new JwtService({ secret });
  const base = '/api/v1/reportes/plantaciones';
  const consulta = base + '?desde=2026-01-01&hasta=2026-11-18';
  const version = 'a'.repeat(64);
  const registros = base + '/registros?desde=2026-01-01&hasta=2026-11-18';
  const detalle = registros + '&especie=3&version_detalle=' + version;
  const vivero = '/api/v1/reportes/vivero';
  const mermas = '/api/v1/reportes/mermas';
  const semillas = '/api/v1/reportes/semillas';
  const movimientos = semillas + '/movimientos';
  const periodoSemillas = '?desde=2026-01-01&hasta=2026-11-19';
  const bearer = (sub: string) =>
    'Bearer ' + jwt.sign({ sub, rol: 'ADMIN' }, { expiresIn: 600 });
  const resultado = {
    observado_en: '2026-11-18T18:30:00.000Z',
    totales: { registros: 1, iniciales: 40, reposiciones: 0, total: 40 },
  };
  const lectura = jest.fn<Promise<RespuestaRpc>, [Record<string, unknown>]>();
  const rpc = jest.fn((name: string, params: Record<string, unknown>) => {
    if (name === 'pa_actor_verificar') {
      const roles: Record<string, string> = {
        admin: 'ADMIN',
        general: 'GENERAL',
        inactive: 'ADMIN',
      };
      const auth = String(params.p_auth_id);
      return Promise.resolve({
        data: roles[auth]
          ? {
              usuario_id: '9007199254740993',
              rol: roles[auth],
              activo: auth !== 'inactive',
            }
          : null,
        error: null,
      });
    }
    if (
      [
        'reportes_plantaciones_leer',
        'reportes_plantaciones_leer_corte',
        'reportes_vivero_leer',
        'reportes_mermas_leer',
        'reportes_mermas_leer_corte',
        'reportes_semillas_saldo_leer',
        'reportes_semillas_movimientos_leer',
        'reportes_semillas_movimientos_leer_corte',
      ].includes(name)
    ) {
      return lectura(params);
    }
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
    expect(result.body).toMatchObject({ error: { campos: [campo] } });
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

  it('propaga los filtros y la versión de la fila al pedir una página', async () => {
    const res = await request(app.getHttpServer())
      .get(
        detalle +
          '&campania_id=42&organizacion_id=9007199254740995&planta_id=3&pagina=2',
      )
      .set('Authorization', bearer('admin'))
      .expect(200);
    expect(res.body).toEqual({ success: true, data: resultado });
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(rpc).toHaveBeenLastCalledWith('reportes_plantaciones_leer_corte', {
      p_actor_id: '9007199254740993',
      p_auth_id: 'admin',
      p_desde: '2026-01-01',
      p_hasta: '2026-11-18',
      p_organizacion_id: '9007199254740995',
      p_campania_id: '42',
      p_planta_id: '3',
      p_especie: '3',
      p_pagina: 2,
      p_version_detalle: version,
    });
  });

  it('admite Sin desglose y conserva el estado de corte obsoleto', async () => {
    lectura.mockResolvedValueOnce({ data: null, error: { code: 'PT409' } });
    await request(app.getHttpServer())
      .get(registros + '&especie=sin_desglose&version_detalle=' + version)
      .set('Authorization', bearer('admin'))
      .expect(409);
    expect(lectura).toHaveBeenCalledWith(
      expect.objectContaining({
        p_especie: 'sin_desglose',
        p_planta_id: null,
        p_pagina: 1,
        p_version_detalle: version,
      }),
    );
  });

  it.each([
    '&especie=3',
    '&version_detalle=' + version,
    '&especie=3&version_detalle=123',
    '&especie=sin_desglose&planta_id=3&version_detalle=' + version,
    '&especie=3&planta_id=4&version_detalle=' + version,
    '&especie=3&pagina=0&version_detalle=' + version,
  ])(
    'rechaza sin leer el detalle con filtros incompatibles %s',
    async (filtros) => {
      await request(app.getHttpServer())
        .get(registros + filtros)
        .set('Authorization', bearer('admin'))
        .expect(422);
      expect(lectura).not.toHaveBeenCalled();
    },
  );

  it('limita el detalle a ADMIN activo y comprueba su autorización en la lectura', async () => {
    await request(app.getHttpServer()).get(detalle).expect(401);
    for (const sub of ['general', 'inactive']) {
      await request(app.getHttpServer())
        .get(detalle)
        .set('Authorization', bearer(sub))
        .expect(403);
    }
    expect(lectura).not.toHaveBeenCalled();
    lectura.mockResolvedValueOnce({ data: null, error: { code: 'PT403' } });
    await request(app.getHttpServer())
      .get(detalle)
      .set('Authorization', bearer('admin'))
      .expect(403);
  });

  it('consulta inventario por especie y vivero con IDs exactos y caché privada', async () => {
    const result = await request(app.getHttpServer())
      .get(vivero + '?planta_id=9007199254740995&vivero_id=9007199254740997')
      .set('Authorization', bearer('admin'))
      .expect(200);
    expect(result.body).toEqual({ success: true, data: resultado });
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(rpc).toHaveBeenLastCalledWith('reportes_vivero_leer', {
      p_actor_id: '9007199254740993',
      p_auth_id: 'admin',
      p_planta_id: '9007199254740995',
      p_vivero_id: '9007199254740997',
    });
  });

  it('consulta mermas con fecha operativa y pagina el detalle', async () => {
    const periodo = '?desde=2026-01-01&hasta=2026-11-18';
    const result = await request(app.getHttpServer())
      .get(mermas + periodo + '&pagina=2&vivero_id=1')
      .set('Authorization', bearer('admin'))
      .expect(200);
    expect(result.body).toEqual({ success: true, data: resultado });
    expect(result.headers['cache-control']).toBe('private, no-store');
    const parametros = {
      p_actor_id: '9007199254740993',
      p_auth_id: 'admin',
      p_desde: '2026-01-01',
      p_hasta: '2026-11-18',
      p_planta_id: null,
      p_vivero_id: '1',
      p_pagina: 2,
    };
    expect(rpc).toHaveBeenLastCalledWith('reportes_mermas_leer', parametros);
    await request(app.getHttpServer())
      .get(mermas + periodo)
      .set('Authorization', bearer('admin'))
      .expect(200);
    expect(rpc).toHaveBeenLastCalledWith('reportes_mermas_leer', {
      ...parametros,
      p_vivero_id: null,
      p_pagina: 1,
    });
  });

  it.each(['', '&pagina=1'])(
    'solicita el detalle completo de mermas en una lectura (%s)',
    async (pagina) => {
      const result = await request(app.getHttpServer())
        .get(
          mermas +
            '?desde=2026-01-01&hasta=2026-11-18&planta_id=3&exportar=1' +
            pagina,
        )
        .set('Authorization', bearer('admin'))
        .expect(200);
      expect(result.body).toEqual({ success: true, data: resultado });
      expect(result.headers['cache-control']).toBe('private, no-store');
      expect(lectura).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenLastCalledWith('reportes_mermas_leer_corte', {
        p_actor_id: '9007199254740993',
        p_auth_id: 'admin',
        p_desde: '2026-01-01',
        p_hasta: '2026-11-18',
        p_planta_id: '3',
        p_vivero_id: null,
        p_pagina: 1,
        p_exportar: true,
      });
    },
  );

  it.each([
    [vivero + '?desde=2026-01-01', 'query'],
    [vivero + '?vivero_id=0', 'vivero_id'],
    [mermas + '?desde=2026-01-01&hasta=2026-11-18&pagina=1&pagina=2', 'pagina'],
    [mermas + '?desde=2026-01-01&hasta=2026-11-18&pagina=1000001', 'pagina'],
    [mermas + '?desde=2026-01-01', 'hasta'],
    [mermas + '?desde=2026-01-01&hasta=2026-11-18&exportar=0', 'exportar'],
    [
      mermas + '?desde=2026-01-01&hasta=2026-11-18&exportar=1&exportar=1',
      'exportar',
    ],
    [
      mermas + '?desde=2026-01-01&hasta=2026-11-18&exportar=1&pagina=2',
      'pagina',
    ],
  ])(
    'rechaza filtros de vivero y mermas inválidos (%s)',
    async (url, campo) => {
      const result = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', bearer('admin'))
        .expect(422);
      expect(result.body).toMatchObject({ error: { campos: [campo] } });
      expect(lectura).not.toHaveBeenCalled();
    },
  );

  it.each([
    vivero,
    mermas + '?desde=2026-01-01&hasta=2026-11-18',
    mermas + '?desde=2026-01-01&hasta=2026-11-18&exportar=1',
  ])(
    'protege la lectura %s ante sesión ausente, general e inactiva',
    async (url) => {
      await request(app.getHttpServer()).get(url).expect(401);
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', bearer('general'))
        .expect(403);
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', bearer('inactive'))
        .expect(403);
      expect(lectura).not.toHaveBeenCalled();
    },
  );
  it('consulta el saldo de semillas con IDs exactos y sin período', async () => {
    const result = await request(app.getHttpServer())
      .get(semillas + '?planta_id=9007199254740995&vivero_id=9007199254740997')
      .set('Authorization', bearer('admin'))
      .expect(200);
    expect(result.body).toEqual({ success: true, data: resultado });
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(rpc).toHaveBeenCalledWith('reportes_semillas_saldo_leer', {
      p_actor_id: '9007199254740993',
      p_auth_id: 'admin',
      p_planta_id: '9007199254740995',
      p_vivero_id: '9007199254740997',
    });
  });

  it.each([
    [periodoSemillas, 1],
    [periodoSemillas + '&pagina=2', 2],
  ])(
    'consulta movimientos por período y pagina (%s)',
    async (query, pagina) => {
      const result = await request(app.getHttpServer())
        .get(movimientos + query + '&vivero_id=9007199254740997')
        .set('Authorization', bearer('admin'))
        .expect(200);
      expect(result.body).toEqual({ success: true, data: resultado });
      expect(rpc).toHaveBeenCalledWith('reportes_semillas_movimientos_leer', {
        p_actor_id: '9007199254740993',
        p_auth_id: 'admin',
        p_desde: '2026-01-01',
        p_hasta: '2026-11-19',
        p_planta_id: null,
        p_vivero_id: '9007199254740997',
        p_pagina: pagina,
      });
    },
  );

  it.each(['', '&pagina=1'])(
    'consulta todos los movimientos de semillas en una lectura privada (%s)',
    async (pagina) => {
      const corte = {
        observado_en: '2026-11-19T18:30:00.000Z',
        filtros: { pagina: 1 },
        tamano_pagina: 25,
        totales: { eventos: 30 },
        detalle: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1) })),
      };
      lectura.mockResolvedValueOnce({ data: corte, error: null });
      const result = await request(app.getHttpServer())
        .get(
          movimientos +
            periodoSemillas +
            '&planta_id=9007199254740995&vivero_id=9007199254740997&exportar=1' +
            pagina,
        )
        .set('Authorization', bearer('admin'))
        .expect(200);
      expect(result.body).toEqual({ success: true, data: corte });
      expect(result.headers['cache-control']).toBe('private, no-store');
      expect(lectura).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenLastCalledWith(
        'reportes_semillas_movimientos_leer_corte',
        {
          p_actor_id: '9007199254740993',
          p_auth_id: 'admin',
          p_desde: '2026-01-01',
          p_hasta: '2026-11-19',
          p_planta_id: '9007199254740995',
          p_vivero_id: '9007199254740997',
          p_pagina: 1,
          p_exportar: true,
        },
      );
    },
  );

  it.each([
    semillas,
    movimientos + periodoSemillas,
    movimientos + periodoSemillas + '&exportar=1',
  ])('protege la lectura de semillas (%s)', async (ruta) => {
    await request(app.getHttpServer()).get(ruta).expect(401);
    await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', bearer('general'))
      .expect(403);
    await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', bearer('inactive'))
      .expect(403);
    expect(lectura).not.toHaveBeenCalled();
  });

  it.each([
    [semillas + periodoSemillas, 'query'],
    [semillas + '?exportar=1', 'query'],
    [movimientos + periodoSemillas + '&exportar=0', 'exportar'],
    [movimientos + periodoSemillas + '&exportar=1&exportar=1', 'exportar'],
    [movimientos + periodoSemillas + '&exportar=1&pagina=2', 'pagina'],
    [movimientos + periodoSemillas + '&pagina=0', 'pagina'],
    [movimientos + '?desde=2026-11-19&hasta=2026-01-01', 'hasta'],
  ])('rechaza filtros de semillas inválidos (%s)', async (ruta, campo) => {
    const result = await request(app.getHttpServer())
      .get(ruta)
      .set('Authorization', bearer('admin'))
      .expect(422);
    expect(result.body).toMatchObject({ error: { campos: [campo] } });
    expect(lectura).not.toHaveBeenCalled();
  });

  it('comunica un corte de exportación no disponible con 503', async () => {
    lectura.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    await request(app.getHttpServer())
      .get(movimientos + periodoSemillas + '&exportar=1')
      .set('Authorization', bearer('admin'))
      .expect(503);
    expect(lectura).toHaveBeenCalledTimes(1);
  });

  it('comunica saldo inválido como lectura no disponible', async () => {
    lectura.mockResolvedValueOnce({ data: null, error: { code: 'PT503' } });
    await request(app.getHttpServer())
      .get(semillas)
      .set('Authorization', bearer('admin'))
      .expect(503);
  });
});
