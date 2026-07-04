import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasConsultasService } from '../application/subcampanias-consultas.service';

function buildSupabase(config: {
  subcampanias: any[];
  equipo?: any[];
  zonas?: any[];
  planEspecies?: any[];
  asignaciones?: any[];
  registros?: any[];
  eventos?: any[];
}): SupabaseService {
  const fromMock = jest.fn((tabla: string) => {
    if (tabla === 'subcampania') {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.is = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.order = jest
        .fn()
        .mockResolvedValue({ data: config.subcampanias, error: null });
      return chain;
    }
    if (tabla === 'subcampania_equipo') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest
            .fn()
            .mockResolvedValue({ data: config.equipo ?? [], error: null }),
        }),
      } as any;
    }
    if (tabla === 'division_administrativa') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest
            .fn()
            .mockResolvedValue({ data: config.zonas ?? [], error: null }),
        }),
      } as any;
    }
    if (tabla === 'subcampania_meta_especie') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: config.planEspecies ?? [],
            error: null,
          }),
        }),
      } as any;
    }
    if (tabla === 'asignacion_vivero_subcampania') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: config.asignaciones ?? [],
            error: null,
          }),
        }),
      } as any;
    }
    if (tabla === 'registro_plantacion') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest
            .fn()
            .mockResolvedValue({ data: config.registros ?? [], error: null }),
        }),
      } as any;
    }
    if (tabla === 'evento_plantacion') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest
            .fn()
            .mockResolvedValue({ data: config.eventos ?? [], error: null }),
        }),
      } as any;
    }
    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  return {
    getClient: jest.fn().mockReturnValue({ from: fromMock }),
  } as unknown as SupabaseService;
}

describe('SubcampaniasConsultasService.listar (payload enriquecido)', () => {
  it('devuelve [] si no hay subcampañas', async () => {
    const supabase = buildSupabase({ subcampanias: [] });
    const service = new SubcampaniasConsultasService(supabase);
    const result = await service.listar({ campania_id: 1 });
    expect(result.data).toEqual([]);
  });

  it('incluye equipo (array vacío si no hay miembros), zona_nombre desde division_administrativa y avance_pct calculado', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        {
          id: 10,
          campania_id: 1,
          nombre: 'Sub A',
          descripcion: null,
          tipo: 'REFORESTACION',
          estado: 'BORRADOR',
          fase_mantenimiento: 'NO_APLICA',
          zona_id: 100,
          area_hectareas: 3.5,
          meta_total_arboles: 200,
          codigo_trazabilidad: 'SUB-001',
          total_plantado_inicial: 50,
          total_repuesto: 0,
          total_muerto_acumulado: 0,
          saldo_vivo_actual: 50,
          nombre_zona_snapshot: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      zonas: [{ id: 100, nombre: 'Comunidad X' }],
    });
    const service = new SubcampaniasConsultasService(supabase);
    const result = await service.listar({ campania_id: 1 });
    const item = result.data[0] as any;

    expect(item.zona_nombre).toBe('Comunidad X');
    expect(item.area_hectareas).toBe(3.5);
    expect(item.plantados).toBe(50);
    expect(item.avance_pct).toBe(25);
    expect(item.has_plan_especies).toBe(false);
    expect(item.personas_count).toBe(0);
    expect(item.lotes_count).toBe(0);
    expect(item.eventos_count).toBe(0);
    expect(item.equipo).toEqual([]);
  });

  it('avance_pct es null cuando meta_total_arboles es 0', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        {
          id: 10,
          campania_id: 1,
          nombre: 'Sub A',
          descripcion: null,
          tipo: 'REFORESTACION',
          estado: 'BORRADOR',
          fase_mantenimiento: 'NO_APLICA',
          zona_id: 100,
          area_hectareas: null,
          meta_total_arboles: 0,
          codigo_trazabilidad: 'SUB-001',
          total_plantado_inicial: 0,
          total_repuesto: 0,
          total_muerto_acumulado: 0,
          saldo_vivo_actual: 0,
          nombre_zona_snapshot: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const service = new SubcampaniasConsultasService(supabase);
    const result = await service.listar({ campania_id: 1 });
    const item = result.data[0] as any;
    expect(item.avance_pct).toBeNull();
    expect(item.area_hectareas).toBeNull();
  });

  it('avance_pct queda acotado a 100 cuando plantados supera meta', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        {
          id: 10,
          campania_id: 1,
          nombre: 'Sub A',
          descripcion: null,
          tipo: 'REFORESTACION',
          estado: 'ACTIVA',
          fase_mantenimiento: 'NO_APLICA',
          zona_id: 100,
          area_hectareas: 1,
          meta_total_arboles: 100,
          codigo_trazabilidad: 'SUB-001',
          total_plantado_inicial: 150,
          total_repuesto: 0,
          total_muerto_acumulado: 0,
          saldo_vivo_actual: 150,
          nombre_zona_snapshot: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const service = new SubcampaniasConsultasService(supabase);
    const result = await service.listar({ campania_id: 1 });
    expect((result.data[0] as any).avance_pct).toBe(100);
  });

  it('cuenta miembros del equipo (COORDINADOR + OPERARIO), has_plan_especies=true, lotes_count totales y eventos operativos', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        {
          id: 10,
          campania_id: 1,
          nombre: 'Sub A',
          descripcion: null,
          tipo: 'REFORESTACION',
          estado: 'ACTIVA',
          fase_mantenimiento: 'NO_APLICA',
          zona_id: 100,
          area_hectareas: 1,
          meta_total_arboles: 100,
          codigo_trazabilidad: 'SUB-001',
          total_plantado_inicial: 40,
          total_repuesto: 0,
          total_muerto_acumulado: 0,
          saldo_vivo_actual: 40,
          nombre_zona_snapshot: 'Zona Snapshot',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      equipo: [
        {
          subcampania_id: 10,
          usuario_id: 1,
          rol: 'COORDINADOR',
          usuario: { id: 1, nombre: 'Coord', foto_perfil_url: null },
        },
        {
          subcampania_id: 10,
          usuario_id: 2,
          rol: 'OPERARIO',
          usuario: { id: 2, nombre: 'Op', foto_perfil_url: null },
        },
      ],
      planEspecies: [{ subcampania_id: 10 }],
      asignaciones: [
        { subcampania_id: 10 },
        { subcampania_id: 10 },
        { subcampania_id: 10 },
      ],
      registros: [{ subcampania_id: 10 }, { subcampania_id: 10 }],
      eventos: [{ subcampania_id: 10 }],
    });
    const service = new SubcampaniasConsultasService(supabase);
    const result = await service.listar({ campania_id: 1 });
    const item = result.data[0] as any;

    expect(item.personas_count).toBe(2);
    expect(item.has_plan_especies).toBe(true);
    expect(item.lotes_count).toBe(3);
    expect(item.eventos_count).toBe(3);
    // Prefiere snapshot cuando existe
    expect(item.zona_nombre).toBe('Zona Snapshot');
    expect(item.equipo).toHaveLength(2);
    expect(item.coordinador).toEqual({ id: 1, nombre: 'Coord' });
  });
});
