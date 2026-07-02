import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { GuardarPlanDto } from '../api/dto/guardar-plan.dto';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasPlanService } from '../application/subcampanias-plan.service';

function buildAuthService(rol: string): SubcampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 3, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (String(r ?? '').toUpperCase() !== 'ADMIN')
        throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
}

function buildSupabase(opts: {
  subcampaniaRow: any;
  insertedRows?: any[];
  insertError?: any;
  deleteError?: any;
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

  const deleteEq = jest
    .fn()
    .mockResolvedValue({ data: null, error: opts.deleteError ?? null });
  const deleteFn = jest.fn().mockReturnValue({ eq: deleteEq });

  const insertSelect = jest.fn().mockResolvedValue({
    data: opts.insertedRows ?? [],
    error: opts.insertError ?? null,
  });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'subcampania') return { select: subSelect };
    if (table === 'subcampania_meta_especie') {
      return { delete: deleteFn, insert };
    }
    return {};
  });

  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

const validDto: GuardarPlanDto = {
  metas: [
    { planta_id: 1, porcentaje_objetivo: 60, cantidad_objetivo: 300 },
    { planta_id: 2, porcentaje_objetivo: 40, cantidad_objetivo: 200 },
  ],
};

describe('SubcampaniasPlanService.guardar', () => {
  it('reemplaza el plan cuando la subcampaña esta en BORRADOR', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'BORRADOR', meta_total_arboles: 500 },
      insertedRows: validDto.metas,
    });
    const service = new SubcampaniasPlanService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.guardar(1, validDto, 'auth-1');
    expect(result.success).toBe(true);
    expect(result.data.metas).toHaveLength(2);
  });

  it('lanza 422 si la subcampaña no esta en BORRADOR', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'ACTIVA', meta_total_arboles: 500 },
    });
    const service = new SubcampaniasPlanService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.guardar(1, validDto, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 422 si un planta_id aparece dos veces', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'BORRADOR', meta_total_arboles: 500 },
    });
    const service = new SubcampaniasPlanService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const dto: GuardarPlanDto = {
      metas: [
        { planta_id: 1, porcentaje_objetivo: 50, cantidad_objetivo: 250 },
        { planta_id: 1, porcentaje_objetivo: 50, cantidad_objetivo: 250 },
      ],
    };
    await expect(service.guardar(1, dto, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 404 si la subcampaña no existe', async () => {
    const supabase = buildSupabase({ subcampaniaRow: null });
    const service = new SubcampaniasPlanService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.guardar(99, validDto, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({
      subcampaniaRow: { id: 1, estado: 'BORRADOR', meta_total_arboles: 500 },
    });
    const service = new SubcampaniasPlanService(
      supabase,
      buildAuthService('GENERAL'),
    );
    await expect(service.guardar(1, validDto, 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
