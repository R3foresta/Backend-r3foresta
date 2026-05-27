import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasActivacionService } from '../application/subcampanias-activacion.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';

type Estado = {
  estado: string;
  meta_total_arboles: number;
  poligono_geom: any;
  zona_id: number;
};

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

function buildSupabase(opts: {
  subcampaniaRow?: (Estado & { id: number; campania_id: number }) | null;
  subcampaniaError?: any;
  coordinadorRow?: any;
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
  const coordEq2 = jest
    .fn()
    .mockReturnValue({ maybeSingle: coordMaybeSingle });
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
    return {};
  });

  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

describe('SubcampaniasActivacionService', () => {
  it('activa correctamente cuando se cumplen las pre-condiciones y setea snapshots', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: {
        id: 1,
        campania_id: 50,
        estado: 'BORRADOR',
        meta_total_arboles: 500,
        poligono_geom: 'POLYGON(...)',
        zona_id: 10,
      },
      coordinadorRow: {
        usuario_id: 7,
        usuario: { id: 7, nombre: 'Coord Pepe' },
      },
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
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.activar(1, 'auth-1');
    expect(result.success).toBe(true);
    expect((result.data as any).estado).toBe('ACTIVA');
    expect((result.data as any).nombre_zona_snapshot).toBe('Zona X');
    expect((result.data as any).nombre_coordinador_snapshot).toBe('Coord Pepe');
    expect((result.data as any).nombres_organizaciones_snapshot).toEqual([
      'Org A',
    ]);
  });

  it('lanza 404 si no encuentra la subcampaña', async () => {
    const supabase = buildSupabase({ subcampaniaRow: null });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.activar(99, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza 422 si no tiene polígono', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: {
        id: 1,
        campania_id: 50,
        estado: 'BORRADOR',
        meta_total_arboles: 500,
        poligono_geom: null,
        zona_id: 10,
      },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si no hay coordinador', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: {
        id: 1,
        campania_id: 50,
        estado: 'BORRADOR',
        meta_total_arboles: 500,
        poligono_geom: 'POLYGON(...)',
        zona_id: 10,
      },
      coordinadorRow: null,
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si meta_total_arboles es 0 (transición inválida)', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: {
        id: 1,
        campania_id: 50,
        estado: 'BORRADOR',
        meta_total_arboles: 0,
        poligono_geom: 'POLYGON(...)',
        zona_id: 10,
      },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si el estado actual no es BORRADOR', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: {
        id: 1,
        campania_id: 50,
        estado: 'ACTIVA',
        meta_total_arboles: 500,
        poligono_geom: 'POLYGON(...)',
        zona_id: 10,
      },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: {
        id: 1,
        campania_id: 50,
        estado: 'BORRADOR',
        meta_total_arboles: 500,
        poligono_geom: 'POLYGON(...)',
        zona_id: 10,
      },
      coordinadorRow: { usuario_id: 7, usuario: { id: 7, nombre: 'Coord' } },
    });
    const service = new SubcampaniasActivacionService(
      supabase,
      buildAuthService('GENERAL'),
    );
    await expect(service.activar(1, 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
