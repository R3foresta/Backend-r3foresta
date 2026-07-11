import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasActivityService } from '../application/campanias-activity.service';
import { CampaniasConsultasService } from '../application/campanias-consultas.service';
import { CampaniasMetricsService } from '../application/campanias-metrics.service';

function buildSupabase(config: {
  subcampanias: any[];
  registrosCount?: number;
  eventosCount?: number;
}): SupabaseService {
  const fromMock = jest.fn((tabla: string) => {
    if (tabla === 'subcampania') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest
              .fn()
              .mockResolvedValue({ data: config.subcampanias, error: null }),
          }),
        }),
      } as any;
    }
    if (tabla === 'registro_plantacion') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            count: config.registrosCount ?? 0,
            error: null,
          }),
        }),
      } as any;
    }
    if (tabla === 'evento_plantacion') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            count: config.eventosCount ?? 0,
            error: null,
          }),
        }),
      } as any;
    }
    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  return {
    getClient: jest.fn().mockReturnValue({ from: fromMock }),
  } as unknown as SupabaseService;
}

function buildConsultasService(): CampaniasConsultasService {
  return {
    asegurarExiste: jest.fn().mockResolvedValue(undefined),
  } as unknown as CampaniasConsultasService;
}

function buildActivityService(items: any[] = []): CampaniasActivityService {
  return {
    listar: jest.fn().mockResolvedValue(items),
  } as unknown as CampaniasActivityService;
}

function buildGlobalSupabase(config: {
  campanias: any[];
  estados: any[];
  subcampanias: any[];
}): SupabaseService {
  const fromMock = jest.fn((tabla: string) => {
    if (tabla === 'campania') {
      return {
        select: jest.fn().mockReturnValue({
          is: jest.fn().mockResolvedValue({
            data: config.campanias,
            error: null,
          }),
        }),
      } as any;
    }
    if (tabla === 'subcampania') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            is: jest.fn().mockResolvedValue({
              data: config.subcampanias,
              error: null,
            }),
          }),
        }),
      } as any;
    }
    if (tabla === 'campania_estado') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: config.estados,
            error: null,
          }),
        }),
      } as any;
    }
    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  return {
    getClient: jest.fn().mockReturnValue({ from: fromMock }),
  } as unknown as SupabaseService;
}

describe('CampaniasMetricsService', () => {
  it('calcula el resumen global y diferencia activas de totales', async () => {
    const supabase = buildGlobalSupabase({
      campanias: [{ id: 1 }, { id: 2 }, { id: 3 }],
      estados: [
        { campania_id: 1, estado_derivado: 'ACTIVA' },
        { campania_id: 2, estado_derivado: 'BORRADOR' },
        { campania_id: 3, estado_derivado: 'EN_MANTENIMIENTO' },
      ],
      subcampanias: [
        {
          estado: 'ACTIVA',
          area_hectareas: 2.25,
          meta_total_arboles: 100,
          total_plantado_inicial: 80,
          total_repuesto: 20,
          saldo_vivo_actual: 75,
        },
        {
          estado: 'COMPLETADA',
          area_hectareas: 1.5,
          meta_total_arboles: 50,
          total_plantado_inicial: 50,
          total_repuesto: 0,
          saldo_vivo_actual: 45,
        },
      ],
    });
    const service = new CampaniasMetricsService(
      supabase,
      buildConsultasService(),
      buildActivityService(),
    );

    await expect(service.obtenerResumenGlobal()).resolves.toEqual({
      arboles_plantados_total: 130,
      avance_meta_pct: 86.67,
      supervivencia_pct: 80,
      hectareas_total: 3.75,
      campanias_activas: 1,
      campanias_totales: 3,
      subcampanias_activas: 1,
      subcampanias_totales: 2,
    });
  });

  it('devuelve porcentajes en cero cuando no hay campañas', async () => {
    const supabase = buildGlobalSupabase({
      campanias: [],
      estados: [],
      subcampanias: [],
    });
    const service = new CampaniasMetricsService(
      supabase,
      buildConsultasService(),
      buildActivityService(),
    );

    const metrics = await service.obtenerResumenGlobal();
    expect(metrics).toMatchObject({
      avance_meta_pct: 0,
      supervivencia_pct: 0,
      campanias_totales: 0,
      subcampanias_totales: 0,
    });
  });

  it('acota los porcentajes globales a 100 ante datos por encima de la meta', async () => {
    const service = new CampaniasMetricsService(
      buildGlobalSupabase({
        campanias: [{ id: 1 }],
        estados: [{ campania_id: 1, estado_derivado: 'ACTIVA' }],
        subcampanias: [
          {
            estado: 'ACTIVA',
            area_hectareas: 1,
            meta_total_arboles: 10,
            total_plantado_inicial: 12,
            total_repuesto: 0,
            saldo_vivo_actual: 15,
          },
        ],
      }),
      buildConsultasService(),
      buildActivityService(),
    );

    const metrics = await service.obtenerResumenGlobal();
    expect(metrics.avance_meta_pct).toBe(100);
    expect(metrics.supervivencia_pct).toBe(100);
  });

  it('calcula supervivencia = 0 cuando plantado_total = 0', async () => {
    const supabase = buildSupabase({ subcampanias: [] });
    const service = new CampaniasMetricsService(
      supabase,
      buildConsultasService(),
      buildActivityService(),
    );
    const metrics = await service.obtener(1);
    expect(metrics.supervivencia_pct).toBe(0);
    expect(metrics.hectareas).toBe(0);
    expect(metrics.comunidades_count).toBe(0);
    expect(metrics.eventos_count).toBe(0);
    expect(metrics.ultima_actividad).toBeNull();
    expect(metrics.co2_proyectado_ton).toBe(0);
  });

  it('calcula supervivencia_pct con base en saldo_vivo / (plantado_inicial + repuesto)', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        {
          id: 1,
          area_hectareas: 2.5,
          zona_id: 100,
          total_plantado_inicial: 100,
          total_repuesto: 20,
          saldo_vivo_actual: 90,
        },
        {
          id: 2,
          area_hectareas: 1.5,
          zona_id: 100,
          total_plantado_inicial: 80,
          total_repuesto: 0,
          saldo_vivo_actual: 60,
        },
      ],
      registrosCount: 3,
      eventosCount: 2,
    });
    const service = new CampaniasMetricsService(
      supabase,
      buildConsultasService(),
      buildActivityService([
        {
          id: 'registro-1',
          tipo: 'plantacion',
          autor: 'Pedro',
          detalle: '90 árboles',
          ubicacion: 'Sub 1',
          timestamp: '2026-07-01T10:00:00Z',
        },
      ]),
    );
    const metrics = await service.obtener(1);

    // plantado = (100+20) + (80+0) = 200 ; saldo = 90+60 = 150 ; supervivencia = 75%
    expect(metrics.supervivencia_pct).toBe(75);
    expect(metrics.hectareas).toBe(4);
    // Comunidades distintas: solo la 100
    expect(metrics.comunidades_count).toBe(1);
    expect(metrics.eventos_count).toBe(5);
    expect(metrics.ultima_actividad).toEqual({
      autor: 'Pedro',
      detalle: '90 árboles',
      timestamp: '2026-07-01T10:00:00Z',
    });
    // 150 * 0.022 = 3.3
    expect(metrics.co2_proyectado_ton).toBe(3.3);
  });

  it('cuenta comunidades distintas (zona_id) sin duplicar', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        {
          id: 1,
          area_hectareas: null,
          zona_id: 100,
          total_plantado_inicial: 0,
          total_repuesto: 0,
          saldo_vivo_actual: 0,
        },
        {
          id: 2,
          area_hectareas: null,
          zona_id: 200,
          total_plantado_inicial: 0,
          total_repuesto: 0,
          saldo_vivo_actual: 0,
        },
        {
          id: 3,
          area_hectareas: null,
          zona_id: 100,
          total_plantado_inicial: 0,
          total_repuesto: 0,
          saldo_vivo_actual: 0,
        },
      ],
    });
    const service = new CampaniasMetricsService(
      supabase,
      buildConsultasService(),
      buildActivityService(),
    );
    const metrics = await service.obtener(1);
    expect(metrics.comunidades_count).toBe(2);
    // area null se trata como 0
    expect(metrics.hectareas).toBe(0);
  });
});
