import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasActivacionService } from '../application/subcampanias-activacion.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasHistorialService } from '../application/subcampanias-historial.service';

type Estado = {
  estado: string;
  meta_total_arboles: number;
  poligono_geom: any;
  zona_id: number;
};

type PlanRow = {
  planta_id: number;
  porcentaje_objetivo: number;
  cantidad_objetivo: number;
};

const DEFAULT_PLAN: PlanRow[] = [
  { planta_id: 1, porcentaje_objetivo: 60, cantidad_objetivo: 300 },
  { planta_id: 2, porcentaje_objetivo: 40, cantidad_objetivo: 200 },
];

function buildAuthService(rol: string): SubcampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 99, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (String(r ?? '').toUpperCase() !== 'ADMIN')
        throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
}

function buildHistorialService(): SubcampaniasHistorialService {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
  } as unknown as SubcampaniasHistorialService;
}

function buildSupabase(opts: {
  subcampaniaRow?: (Estado & { id: number; campania_id: number }) | null;
  subcampaniaError?: any;
  coordinadorRow?: any;
  reservasRows?: any[];
  reservasError?: any;
  planRows?: PlanRow[];
  planError?: any;
  updateResult?: { data: any; error: any };
}): SupabaseService {
  const subSingle = jest
    .fn()
    .mockResolvedValue(
      opts.subcampaniaRow
        ? { data: opts.subcampaniaRow, error: null }
        : { data: null, error: opts.subcampaniaError ?? { message: 'nf' } },
    );
  const subIs = jest.fn().mockReturnValue({ single: subSingle });
  const subEq = jest.fn().mockReturnValue({ is: subIs });
  const subSelect = jest.fn().mockReturnValue({ eq: subEq });

  const coordMaybeSingle = jest
    .fn()
    .mockResolvedValue(
      opts.coordinadorRow
        ? { data: opts.coordinadorRow, error: null }
        : { data: null, error: null },
    );
  const coordEq2 = jest.fn().mockReturnValue({ maybeSingle: coordMaybeSingle });
  const coordEq1 = jest.fn().mockReturnValue({ eq: coordEq2 });
  const coordSelect = jest.fn().mockReturnValue({ eq: coordEq1 });

  const zonaSingle = jest
    .fn()
    .mockResolvedValue({ data: { nombre: 'Zona X' }, error: null });
  const zonaEq = jest.fn().mockReturnValue({ single: zonaSingle });
  const zonaSelect = jest.fn().mockReturnValue({ eq: zonaEq });

  const orgsEq = jest
    .fn()
    .mockResolvedValue({ data: [{ organizacion: { nombre: 'Org A' } }] });
  const orgsSelect = jest.fn().mockReturnValue({ eq: orgsEq });

  const reservasEq2 = jest.fn().mockResolvedValue({
    data: opts.reservasRows ?? [],
    error: opts.reservasError ?? null,
  });
  const reservasEq1 = jest.fn().mockReturnValue({ eq: reservasEq2 });
  const reservasSelect = jest.fn().mockReturnValue({ eq: reservasEq1 });

  const planEq = jest.fn().mockResolvedValue({
    data: opts.planRows ?? DEFAULT_PLAN,
    error: opts.planError ?? null,
  });
  const planSelect = jest.fn().mockReturnValue({ eq: planEq });

  const updateSingle = jest
    .fn()
    .mockResolvedValue(
      opts.updateResult ?? { data: { id: 1, estado: 'ACTIVA' }, error: null },
    );
  const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
  const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
  const update = jest.fn().mockReturnValue({ eq: updateEq });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'subcampania') {
      return { select: subSelect, update };
    }
    if (table === 'subcampania_equipo') {
      return { select: coordSelect };
    }
    if (table === 'division_administrativa') {
      return { select: zonaSelect };
    }
    if (table === 'campania_organizacion') {
      return { select: orgsSelect };
    }
    if (table === 'asignacion_vivero_subcampania') {
      return { select: reservasSelect };
    }
    if (table === 'subcampania_meta_especie') {
      return { select: planSelect };
    }
    return {};
  });

  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

const validSub = {
  id: 1,
  campania_id: 50,
  estado: 'BORRADOR',
  meta_total_arboles: 500,
  poligono_geom: 'POLYGON(...)',
  zona_id: 10,
};

describe('SubcampaniasActivacionService', () => {
  it('activa con 0 stock cuando el plan es válido y se cumplen pre-condiciones (RN-PLA-09)', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub },
      coordinadorRow: {
        usuario_id: 7,
        usuario: { id: 7, nombre: 'Coord Pepe' },
      },
      reservasRows: [], // 0 asignaciones — RN-PLA-09 permite activar
      updateResult: {
        data: {
          id: 1,
          estado: 'ACTIVA',
          nombre_zona_snapshot: 'Zona X',
          nombre_coordinador_snapshot: 'Coord Pepe',
          nombres_organizaciones_snapshot: ['Org A'],
        },
        error: null,
      },
    });
    const historialService = buildHistorialService();
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      historialService,
    );

    const result = await service.activar(1, 'auth-1');
    expect(result.success).toBe(true);
    expect((result.data as any).estado).toBe('ACTIVA');
    expect((result.data as any).nombre_zona_snapshot).toBe('Zona X');
    expect((result.data as any).nombre_coordinador_snapshot).toBe('Coord Pepe');
    expect((result.data as any).nombres_organizaciones_snapshot).toEqual([
      'Org A',
    ]);
    expect(historialService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        subcampaniaId: 1,
        tipo: 'SUBCAMPANIA_ACTIVADA',
        actorUserId: 99,
        estadoDestino: 'ACTIVA',
      }),
    );
  });

  it('lanza 404 si no encuentra la subcampaña', async () => {
    const supabase = buildSupabase({ subcampaniaRow: null });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(99, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza 422 si no tiene polígono', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub, poligono_geom: null },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si no hay coordinador', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub },
      coordinadorRow: null,
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si el plan por especie está vacío', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
      planRows: [],
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si SUM(cantidad_objetivo) no coincide con meta_total_arboles', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub, meta_total_arboles: 500 },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
      planRows: [
        { planta_id: 1, porcentaje_objetivo: 60, cantidad_objetivo: 200 },
        { planta_id: 2, porcentaje_objetivo: 40, cantidad_objetivo: 200 },
      ],
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si SUM(porcentaje_objetivo) ≠ 100', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
      planRows: [
        { planta_id: 1, porcentaje_objetivo: 30, cantidad_objetivo: 300 },
        { planta_id: 2, porcentaje_objetivo: 40, cantidad_objetivo: 200 },
      ],
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si el estado actual no es BORRADOR', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub, estado: 'ACTIVA' },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { ...validSub },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('GENERAL'),
      buildHistorialService(),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
