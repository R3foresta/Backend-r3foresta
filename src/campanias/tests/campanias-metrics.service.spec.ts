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

describe('CampaniasMetricsService', () => {
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
