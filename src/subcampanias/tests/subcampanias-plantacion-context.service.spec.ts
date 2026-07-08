import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasPlantacionContextService } from '../application/subcampanias-plantacion-context.service';

function buildAuthService(usuario: {
  id: number;
  nombre: string;
  rol: string;
}): SubcampaniasAuthService {
  return {
    getUserByAuthId: jest.fn().mockResolvedValue(usuario),
  } as unknown as SubcampaniasAuthService;
}

type Resultado = { data: unknown; error: unknown };

type QueryBuilderMock = {
  select: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  then: (
    onFulfilled?: (value: Resultado) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

// Builder encadenable y awaitable: cualquier terminal resuelve al resultado.
function chain(result: Resultado): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.is = jest.fn().mockReturnValue(builder);
  builder.in = jest.fn().mockReturnValue(builder);
  builder.order = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

type Fila = Record<string, unknown>;

function buildSupabase(opts: {
  subcampania?: Fila | null;
  equipo?: Fila[];
  poligono?: unknown;
  metas?: Fila[];
  asignaciones?: Fila[];
  registros?: Fila[];
  detalles?: Fila[];
  zona?: Fila | null;
}): SupabaseService {
  const from = jest.fn().mockImplementation((table: string) => {
    switch (table) {
      case 'subcampania':
        return chain(
          opts.subcampania
            ? { data: opts.subcampania, error: null }
            : { data: null, error: { message: 'not found' } },
        );
      case 'subcampania_equipo':
        return chain({ data: opts.equipo ?? [], error: null });
      case 'subcampania_meta_especie':
        return chain({ data: opts.metas ?? [], error: null });
      case 'asignacion_vivero_subcampania':
        return chain({ data: opts.asignaciones ?? [], error: null });
      case 'registro_plantacion':
        return chain({ data: opts.registros ?? [], error: null });
      case 'registro_plantacion_detalle':
        return chain({ data: opts.detalles ?? [], error: null });
      case 'division_administrativa':
        return chain({ data: opts.zona ?? null, error: null });
      default:
        return chain({ data: null, error: null });
    }
  });

  const rpc = jest
    .fn()
    .mockResolvedValue({ data: opts.poligono ?? null, error: null });

  return {
    getClient: jest.fn().mockReturnValue({ from, rpc }),
  } as unknown as SupabaseService;
}

const POLIGONO = { type: 'Polygon', coordinates: [] };

const SUBCAMPANIA_ACTIVA = {
  id: 123,
  campania_id: 10,
  nombre: 'Subcampaña Norte',
  estado: 'ACTIVA',
  fase_mantenimiento: 'NO_APLICA',
  zona_id: 44,
  meta_total_arboles: 500,
  total_plantado_inicial: 120,
  tolerancia_gps_metros: 30,
  nombre_zona_snapshot: 'Comunidad X',
  codigo_trazabilidad: 'SUB-001-CMP-2026-001',
  campania: { id: 10, nombre: 'Campaña 2026' },
};

const EQUIPO = [
  {
    usuario_id: 7,
    rol: 'OPERARIO',
    usuario: { id: 7, nombre: 'Usuario Campo' },
  },
  {
    usuario_id: 9,
    rol: 'OPERARIO',
    usuario: { id: 9, nombre: 'Otro Operario' },
  },
];

const PLANTA_MOLLE = {
  id: 5,
  especie: 'Molle',
  nombre_cientifico: 'Schinus molle',
  nombre_comun_principal: 'Molle',
};

const METAS = [{ planta_id: 5, cantidad_objetivo: 200, planta: PLANTA_MOLLE }];

const ASIGNACIONES = [
  {
    id: 55,
    lote_vivero_id: 31,
    cantidad_asignada: 100,
    cantidad_consumida: 20,
    cantidad_devuelta: 0,
    cantidad_mermada: 0,
    saldo_asignado_disponible: 80,
    fecha_asignacion: '2026-07-01T10:00:00.000Z',
    lote: {
      id: 31,
      codigo_trazabilidad: 'VIV-000031',
      planta_id: 5,
      vivero: { id: 1, nombre: 'Vivero Central' },
      planta: PLANTA_MOLLE,
    },
  },
  {
    id: 60,
    lote_vivero_id: 32,
    cantidad_asignada: 70,
    cantidad_consumida: 0,
    cantidad_devuelta: 0,
    cantidad_mermada: 0,
    saldo_asignado_disponible: 70,
    fecha_asignacion: '2026-07-03T10:00:00.000Z',
    lote: {
      id: 32,
      codigo_trazabilidad: 'VIV-000032',
      planta_id: 5,
      vivero: { id: 1, nombre: 'Vivero Central' },
      planta: PLANTA_MOLLE,
    },
  },
];

const USUARIO_OPERARIO = { id: 7, nombre: 'Usuario Campo', rol: 'GENERAL' };

function buildService(
  supabaseOpts: Parameters<typeof buildSupabase>[0],
  usuario = USUARIO_OPERARIO,
) {
  return new SubcampaniasPlantacionContextService(
    buildSupabase(supabaseOpts),
    buildAuthService(usuario),
  );
}

describe('SubcampaniasPlantacionContextService.obtener', () => {
  it('lanza 404 si la subcampaña no existe o está eliminada', async () => {
    const service = buildService({ subcampania: null });
    await expect(service.obtener(999, 'auth-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lanza 403 si el rol global no es operativo (VOLUNTARIO)', async () => {
    const service = buildService(
      { subcampania: SUBCAMPANIA_ACTIVA, equipo: EQUIPO },
      { id: 7, nombre: 'Vol', rol: 'VOLUNTARIO' },
    );
    await expect(service.obtener(123, 'auth-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lanza 403 si el usuario no pertenece al equipo, incluso siendo ADMIN', async () => {
    const service = buildService(
      { subcampania: SUBCAMPANIA_ACTIVA, equipo: EQUIPO },
      { id: 99, nombre: 'Admin Fuera', rol: 'ADMIN' },
    );
    await expect(service.obtener(123, 'auth-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lanza 409 si la subcampaña no está ACTIVA', async () => {
    const service = buildService({
      subcampania: { ...SUBCAMPANIA_ACTIVA, estado: 'BORRADOR' },
      equipo: EQUIPO,
    });
    await expect(service.obtener(123, 'auth-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lanza 422 informando todos los motivos: sin plan, sin polígono y sin stock', async () => {
    const service = buildService({
      subcampania: SUBCAMPANIA_ACTIVA,
      equipo: EQUIPO,
      poligono: null,
      metas: [],
      asignaciones: [],
    });

    let error: unknown;
    try {
      await service.obtener(123, 'auth-1');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const mensaje = (error as UnprocessableEntityException).message;
    expect(mensaje).toContain('plan por especie');
    expect(mensaje).toContain('polígono');
    expect(mensaje).toContain('stock asignado disponible');
  });

  it('lanza 422 si solo queda stock con saldo 0 (se filtra)', async () => {
    const agotada = {
      ...ASIGNACIONES[0],
      saldo_asignado_disponible: 0,
      cantidad_consumida: 100,
    };
    const service = buildService({
      subcampania: SUBCAMPANIA_ACTIVA,
      equipo: EQUIPO,
      poligono: POLIGONO,
      metas: METAS,
      asignaciones: [agotada],
    });
    await expect(service.obtener(123, 'auth-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('devuelve el contexto completo en el happy path', async () => {
    const service = buildService({
      subcampania: SUBCAMPANIA_ACTIVA,
      equipo: EQUIPO,
      poligono: POLIGONO,
      metas: METAS,
      asignaciones: ASIGNACIONES,
      registros: [{ id: 900 }, { id: 901 }],
      detalles: [
        { planta_id: 5, cantidad: 50 },
        { planta_id: 5, cantidad: 30 },
      ],
    });

    const res = await service.obtener(123, 'auth-1');

    expect(res.success).toBe(true);

    // Subcampaña
    expect(res.data.subcampania).toMatchObject({
      id: 123,
      codigo_trazabilidad: 'SUB-001-CMP-2026-001',
      estado: 'ACTIVA',
      campania_id: 10,
      campania_nombre: 'Campaña 2026',
      zona_id: 44,
      zona_nombre: 'Comunidad X',
      meta_total_arboles: 500,
      total_plantado_inicial: 120,
      tolerancia_gps_metros: 30,
      poligono: POLIGONO,
    });

    // Usuario
    expect(res.data.usuario).toEqual({
      id: 7,
      nombre: 'Usuario Campo',
      rol_global: 'GENERAL',
      rol_en_subcampania: 'OPERARIO',
      puede_registrar: true,
      motivo_bloqueo: null,
    });

    // Equipo
    expect(res.data.equipo).toEqual([
      { usuario_id: 7, nombre_usuario: 'Usuario Campo', rol: 'OPERARIO' },
      { usuario_id: 9, nombre_usuario: 'Otro Operario', rol: 'OPERARIO' },
    ]);

    // Plan por especie: plantado = 50 + 30 = 80, pendiente = 200 - 80 = 120
    expect(res.data.plan_por_especie).toEqual([
      {
        planta_id: 5,
        nombre_comun_principal: 'Molle',
        nombre_cientifico: 'Schinus molle',
        cantidad_objetivo: 200,
        plantado_inicial: 80,
        pendiente_meta: 120,
      },
    ]);

    // Stock por especie: suma 80 + 70 = 150, orden_consumo FIFO 1 y 2
    expect(res.data.stock_por_especie).toHaveLength(1);
    const stock = res.data.stock_por_especie[0];
    expect(stock).toMatchObject({
      planta_id: 5,
      nombre_comun_principal: 'Molle',
      nombre_cientifico: 'Schinus molle',
      stock_asignado_disponible: 150,
    });
    expect(stock.asignaciones).toEqual([
      {
        asignacion_id: 55,
        lote_vivero_id: 31,
        codigo_lote: 'VIV-000031',
        vivero_nombre: 'Vivero Central',
        fecha_asignacion: '2026-07-01',
        cantidad_asignada: 100,
        cantidad_consumida: 20,
        cantidad_devuelta: 0,
        cantidad_mermada: 0,
        saldo_asignado_disponible: 80,
        orden_consumo: 1,
      },
      {
        asignacion_id: 60,
        lote_vivero_id: 32,
        codigo_lote: 'VIV-000032',
        vivero_nombre: 'Vivero Central',
        fecha_asignacion: '2026-07-03',
        cantidad_asignada: 70,
        cantidad_consumida: 0,
        cantidad_devuelta: 0,
        cantidad_mermada: 0,
        saldo_asignado_disponible: 70,
        orden_consumo: 2,
      },
    ]);

    // Reglas espejo del backend
    expect(res.data.reglas).toEqual({
      max_dias_retroactivos: 10,
      gps_fuera_poligono_bloquea: false,
      precision_gps_advertencia_m: 50,
      requiere_evidencia: true,
      min_fotos: 1,
      max_fotos: 10,
      permite_exceder_meta_especie: false,
      orden_consumo_asignaciones: 'fecha_asignacion ASC, asignacion_id ASC',
    });
  });

  it('usa pendiente_meta = 0 cuando el plantado alcanzó el objetivo', async () => {
    const service = buildService({
      subcampania: SUBCAMPANIA_ACTIVA,
      equipo: EQUIPO,
      poligono: POLIGONO,
      metas: METAS,
      asignaciones: ASIGNACIONES,
      registros: [{ id: 900 }],
      detalles: [{ planta_id: 5, cantidad: 200 }],
    });

    const res = await service.obtener(123, 'auth-1');
    expect(res.data.plan_por_especie[0].pendiente_meta).toBe(0);
  });

  it('resuelve zona_nombre desde division_administrativa si no hay snapshot', async () => {
    const service = buildService({
      subcampania: { ...SUBCAMPANIA_ACTIVA, nombre_zona_snapshot: null },
      equipo: EQUIPO,
      poligono: POLIGONO,
      metas: METAS,
      asignaciones: ASIGNACIONES,
      zona: { id: 44, nombre: 'Comunidad X (lookup)' },
    });

    const res = await service.obtener(123, 'auth-1');
    expect(res.data.subcampania.zona_nombre).toBe('Comunidad X (lookup)');
  });
});
