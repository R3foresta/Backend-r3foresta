import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearAsignacionDto } from '../api/dto/crear-asignacion.dto';
import { ViveroAsignacionesService } from '../application/vivero-asignaciones.service';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { PropositoAsignacion } from '../domain/enums/proposito-asignacion.enum';

function buildAuthService(): ViveroAuthService {
  return {
    getUserByAuthId: jest.fn().mockResolvedValue({
      id: 11,
      nombre: 'Op Vivero',
      rol: 'GENERAL',
    }),
    assertCanWrite: jest.fn(),
  } as unknown as ViveroAuthService;
}

function buildSupabase(opts: {
  loteEstado?: string;
  subcampania?: { id: number; nombre: string; estado: string } | null;
}): SupabaseService {
  const loteMaybeSingle = jest.fn().mockResolvedValue({
    data: { id: 55, estado_lote: opts.loteEstado ?? 'ACTIVO' },
    error: null,
  });
  const loteEq = jest.fn().mockReturnValue({ maybeSingle: loteMaybeSingle });
  const loteSelect = jest.fn().mockReturnValue({ eq: loteEq });

  const subMaybeSingle = jest.fn().mockResolvedValue({
    data:
      opts.subcampania === undefined
        ? { id: 33, nombre: 'Sub QA', estado: 'ACTIVA' }
        : opts.subcampania,
    error: null,
  });
  const subIs = jest.fn().mockReturnValue({ maybeSingle: subMaybeSingle });
  const subEq = jest.fn().mockReturnValue({ is: subIs });
  const subSelect = jest.fn().mockReturnValue({ eq: subEq });

  const rpc = jest.fn().mockResolvedValue({ data: {}, error: null });

  return {
    getClient: jest.fn().mockReturnValue({
      rpc,
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'lote_vivero') return { select: loteSelect };
        if (table === 'subcampania') return { select: subSelect };
        return {};
      }),
    }),
  } as unknown as SupabaseService;
}

const baseDto: CrearAsignacionDto = {
  subcampania_id: 33,
  cantidad_asignada: 100,
  proposito: PropositoAsignacion.PLANTACION_INICIAL,
};

describe('ViveroAsignacionesService (guardas por estado / proposito)', () => {
  it('rechaza asignacion a subcampaña BORRADOR con 409', async () => {
    const supabase = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'BORRADOR' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    await expect(
      service.crearAsignacion(55, baseDto, 'auth-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza asignacion a subcampaña CANCELADA con 409', async () => {
    const supabase = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'CANCELADA' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    await expect(
      service.crearAsignacion(55, baseDto, 'auth-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza PLANTACION_INICIAL contra subcampaña COMPLETADA con 422', async () => {
    const supabase = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'COMPLETADA' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    await expect(
      service.crearAsignacion(55, baseDto, 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('acepta REPOSICION contra subcampaña COMPLETADA', async () => {
    const supabase = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'COMPLETADA' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    const dto: CrearAsignacionDto = {
      ...baseDto,
      proposito: PropositoAsignacion.REPOSICION,
    };
    const result = await service.crearAsignacion(55, dto, 'auth-1');
    expect(result.success).toBe(true);
  });

  it('acepta PLANTACION_INICIAL contra subcampaña ACTIVA', async () => {
    const supabase = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'ACTIVA' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    const result = await service.crearAsignacion(55, baseDto, 'auth-1');
    expect(result.success).toBe(true);
  });
});
