import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasActivityService } from '../application/campanias-activity.service';
import { CampaniasConsultasService } from '../application/campanias-consultas.service';

function buildSupabase(config: {
  subcampanias: any[];
  zonas?: any[];
  registros?: any[];
  historial?: any[];
}): SupabaseService {
  const fromMock = jest.fn((tabla: string) => {
    if (tabla === 'subcampania') {
      const result = { data: config.subcampanias, error: null };
      const chain: any = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.is = jest.fn(() => chain);
      chain.then = (
        onResolve: (v: unknown) => unknown,
        onReject?: (v: unknown) => unknown,
      ) => Promise.resolve(result).then(onResolve, onReject);
      return chain;
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
    if (tabla === 'registro_plantacion') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: config.registros ?? [],
                error: null,
              }),
            }),
          }),
        }),
      } as any;
    }
    if (tabla === 'subcampania_historial') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: config.historial ?? [],
                  error: null,
                }),
              }),
            }),
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

describe('CampaniasActivityService', () => {
  it('devuelve [] si la campaña no tiene subcampañas', async () => {
    const supabase = buildSupabase({ subcampanias: [] });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    const items = await service.listar(1, 5);
    expect(items).toEqual([]);
  });

  it('normaliza registro_plantacion como tipo "plantacion" con detalle en árboles', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        { id: 10, nombre: 'Sub A', zona_id: 100, nombre_zona_snapshot: null },
      ],
      zonas: [{ id: 100, nombre: 'Comunidad X' }],
      registros: [
        {
          id: 1,
          subcampania_id: 10,
          cantidad_total_plantada: 12,
          created_at: '2026-07-01T10:00:00Z',
          responsable_id: 5,
          nombre_responsable_snapshot: 'Ana',
          nombre_subcampania_snapshot: null,
          nombre_zona_snapshot: null,
          usuario: null,
        },
      ],
    });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    const items = await service.listar(1, 5);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tipo: 'plantacion',
      autor: 'Ana',
      detalle: '12 árboles',
      ubicacion: 'Sub A · Comunidad X',
      timestamp: '2026-07-01T10:00:00Z',
    });
  });

  it('mapea subcampania_historial a tipos correctos', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        { id: 10, nombre: 'Sub A', zona_id: 100, nombre_zona_snapshot: null },
      ],
      zonas: [{ id: 100, nombre: 'Zona' }],
      historial: [
        {
          id: 1,
          subcampania_id: 10,
          tipo_historial: 'BORRADOR_CREADO',
          observaciones: 'Nueva',
          created_at: '2026-07-02T10:00:00Z',
          actor_user_id: 1,
          usuario: { id: 1, nombre: 'Bruno' },
        },
        {
          id: 2,
          subcampania_id: 10,
          tipo_historial: 'SUBCAMPANIA_ACTIVADA',
          observaciones: null,
          created_at: '2026-07-03T10:00:00Z',
          actor_user_id: 1,
          usuario: { id: 1, nombre: 'Bruno' },
        },
        {
          id: 3,
          subcampania_id: 10,
          tipo_historial: 'COORDINADOR_CAMBIADO',
          observaciones: null,
          created_at: '2026-07-04T10:00:00Z',
          actor_user_id: 1,
          usuario: { id: 1, nombre: 'Bruno' },
        },
      ],
    });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    const items = await service.listar(1, 5);
    // Ordenados desc por timestamp
    expect(items.map((i) => i.tipo)).toEqual([
      'cambio_coordinador',
      'activacion',
      'nueva_subcampana',
    ]);
    // Detalle vacío para eventos sin observaciones
    expect(items[0].detalle).toBe('');
  });

  it('respeta el limit y ordena descendente por timestamp', async () => {
    const supabase = buildSupabase({
      subcampanias: [
        { id: 10, nombre: 'Sub', zona_id: 100, nombre_zona_snapshot: null },
      ],
      zonas: [{ id: 100, nombre: 'Zona' }],
      registros: [
        {
          id: 1,
          subcampania_id: 10,
          cantidad_total_plantada: 5,
          created_at: '2026-07-01T10:00:00Z',
          responsable_id: 1,
          nombre_responsable_snapshot: null,
          nombre_subcampania_snapshot: null,
          nombre_zona_snapshot: null,
          usuario: { id: 1, nombre: 'A' },
        },
      ],
      historial: [
        {
          id: 1,
          subcampania_id: 10,
          tipo_historial: 'SUBCAMPANIA_ACTIVADA',
          observaciones: null,
          created_at: '2026-07-05T10:00:00Z',
          actor_user_id: 1,
          usuario: { id: 1, nombre: 'A' },
        },
        {
          id: 2,
          subcampania_id: 10,
          tipo_historial: 'BORRADOR_CREADO',
          observaciones: null,
          created_at: '2026-06-30T10:00:00Z',
          actor_user_id: 1,
          usuario: { id: 1, nombre: 'A' },
        },
      ],
    });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    const items = await service.listar(1, 2);
    expect(items).toHaveLength(2);
    expect(items[0].timestamp).toBe('2026-07-05T10:00:00Z');
    expect(items[1].timestamp).toBe('2026-07-01T10:00:00Z');
  });

  it('rechaza limit fuera de rango con 400', async () => {
    const supabase = buildSupabase({ subcampanias: [] });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    await expect(service.listar(1, 0)).rejects.toThrow(BadRequestException);
    await expect(service.listar(1, 51)).rejects.toThrow(BadRequestException);
  });

  it('con soloSubcampaniasVivas=true aplica filtro deleted_at IS NULL', async () => {
    const supabase = buildSupabase({ subcampanias: [] });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    await service.listar(1, 5, { soloSubcampaniasVivas: true });
    const client: any = (supabase.getClient as jest.Mock).mock.results[0].value;
    const fromCalls = (client.from as jest.Mock).mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(fromCalls).toContain('subcampania');
    const subChain = (client.from as jest.Mock).mock.results.find(
      (_: any, i: number) => fromCalls[i] === 'subcampania',
    ).value;
    expect(subChain.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('sin opciones NO filtra deleted_at (incluye cancelaciones)', async () => {
    const supabase = buildSupabase({ subcampanias: [] });
    const service = new CampaniasActivityService(
      supabase,
      buildConsultasService(),
    );
    await service.listar(1, 5);
    const client: any = (supabase.getClient as jest.Mock).mock.results[0].value;
    const fromCalls = (client.from as jest.Mock).mock.calls.map(
      (c: any[]) => c[0],
    );
    const subChain = (client.from as jest.Mock).mock.results.find(
      (_: any, i: number) => fromCalls[i] === 'subcampania',
    ).value;
    expect(subChain.is).not.toHaveBeenCalled();
  });
});
