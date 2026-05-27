import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  CerrarSubcampaniaDto,
  EstadoFinalSubcampania,
} from '../api/dto/cerrar-subcampania.dto';
import { MotivoCierreParcial } from '../domain/enums/motivo-cierre-parcial.enum';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasCierreService } from '../application/subcampanias-cierre.service';

function buildAuthService(rol: string): SubcampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (String(r ?? '').toUpperCase() !== 'ADMIN')
        throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
}

function buildSupabase(opts: {
  subcampaniaRow: any;
  updateResult?: { data: any; error: any };
}): SupabaseService {
  const subSingle = jest
    .fn()
    .mockResolvedValue(
      opts.subcampaniaRow
        ? { data: opts.subcampaniaRow, error: null }
        : { data: null, error: { message: 'nf' } },
    );
  const subIs = jest.fn().mockReturnValue({ single: subSingle });
  const subEq = jest.fn().mockReturnValue({ is: subIs });
  const subSelect = jest.fn().mockReturnValue({ eq: subEq });

  const updateSingle = jest
    .fn()
    .mockResolvedValue(
      opts.updateResult ?? {
        data: { id: 1, estado: 'COMPLETADA', fase_mantenimiento: 'MANTENIMIENTO_ACTIVO' },
        error: null,
      },
    );
  const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
  const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
  const update = jest.fn().mockReturnValue({ eq: updateEq });

  return {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({ select: subSelect, update }),
    }),
  } as unknown as SupabaseService;
}

const baseDto: CerrarSubcampaniaDto = {
  estado_final: EstadoFinalSubcampania.COMPLETADA,
  fecha_cierre_operativo: '2026-12-01T00:00:00Z',
  fecha_fin_mantenimiento: '2029-12-01',
};

describe('SubcampaniasCierreService', () => {
  it('cierra correctamente como COMPLETADA y setea fase_mantenimiento', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
    });
    const service = new SubcampaniasCierreService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const result = await service.cerrar(1, baseDto, 'auth-1');
    expect(result.success).toBe(true);
    expect((result.data as any).fase_mantenimiento).toBe(
      'MANTENIMIENTO_ACTIVO',
    );
    expect((result.data as any).estado).toBe('COMPLETADA');
  });

  it('cierra como FINALIZADA_PARCIAL con motivo válido', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
      updateResult: {
        data: {
          id: 1,
          estado: 'FINALIZADA_PARCIAL',
          fase_mantenimiento: 'MANTENIMIENTO_ACTIVO',
          motivo_cierre_parcial: MotivoCierreParcial.FALTA_STOCK,
        },
        error: null,
      },
    });
    const service = new SubcampaniasCierreService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const dto: CerrarSubcampaniaDto = {
      ...baseDto,
      estado_final: EstadoFinalSubcampania.FINALIZADA_PARCIAL,
      motivo_cierre_parcial: MotivoCierreParcial.FALTA_STOCK,
    };
    const result = await service.cerrar(1, dto, 'auth-1');
    expect((result.data as any).estado).toBe('FINALIZADA_PARCIAL');
    expect((result.data as any).motivo_cierre_parcial).toBe('FALTA_STOCK');
  });

  it('lanza 422 si FINALIZADA_PARCIAL no incluye motivo', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
    });
    const service = new SubcampaniasCierreService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const dto: CerrarSubcampaniaDto = {
      ...baseDto,
      estado_final: EstadoFinalSubcampania.FINALIZADA_PARCIAL,
    };
    await expect(service.cerrar(1, dto, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si la transición es inválida (no ACTIVA)', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'BORRADOR' },
    });
    const service = new SubcampaniasCierreService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.cerrar(1, baseDto, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 404 si la subcampaña no existe', async () => {
    const supabase = buildSupabase({ subcampaniaRow: null });
    const service = new SubcampaniasCierreService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.cerrar(99, baseDto, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
    });
    const service = new SubcampaniasCierreService(
      supabase,
      buildAuthService('GENERAL'),
    );
    await expect(service.cerrar(1, baseDto, 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
