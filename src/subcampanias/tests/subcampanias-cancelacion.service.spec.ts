import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CancelarSubcampaniaDto } from '../api/dto/cancelar-subcampania.dto';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasCancelacionService } from '../application/subcampanias-cancelacion.service';

function buildAuthService(rol: string): SubcampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 42, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (String(r ?? '').toUpperCase() !== 'ADMIN')
        throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
}

function buildSupabase(rpcResult: { data: any; error: any }): SupabaseService {
  return {
    getAdminClient: jest.fn().mockReturnValue({
      rpc: jest.fn().mockResolvedValue(rpcResult),
    }),
  } as unknown as SupabaseService;
}

const dto: CancelarSubcampaniaDto = {
  motivo: 'Cambio de prioridad institucional',
};

describe('SubcampaniasCancelacionService', () => {
  it('cancela una subcampaña BORRADOR y devuelve estado=CANCELADA', async () => {
    const supabase = buildSupabase({
      data: { id: 5, estado: 'CANCELADA', deleted_at: '2026-07-02T00:00:00Z' },
      error: null,
    });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.cancelar(5, dto, 'auth-1');
    expect(result.success).toBe(true);
    expect(result.data.estado).toBe('CANCELADA');
    expect(result.data.motivo).toBe(dto.motivo);
    expect(supabase.getAdminClient().rpc).toHaveBeenCalledWith(
      'fn_subcampania_cancelar',
      { p_id: 5, p_actor_user_id: 42, p_motivo: dto.motivo },
    );
  });

  it('lanza 409 si el RPC reporta plantaciones existentes', async () => {
    const supabase = buildSupabase({
      data: null,
      error: {
        code: 'P0001',
        message:
          'La subcampania ya tiene plantaciones registradas (total_plantado_inicial = 3). Usar cierre FINALIZADA_PARCIAL.',
      },
    });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    await expect(service.cancelar(5, dto, 'auth-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('lanza 404 si la subcampaña no existe', async () => {
    const supabase = buildSupabase({
      data: null,
      error: { code: 'P0002', message: 'Subcampania 99 no encontrada.' },
    });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.cancelar(99, dto, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza 409 (validacion) si el RPC devuelve P0001 por estado invalido', async () => {
    const supabase = buildSupabase({
      data: null,
      error: {
        code: 'P0001',
        message:
          'Solo se puede cancelar una subcampania en BORRADOR o ACTIVA (estado actual: COMPLETADA).',
      },
    });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    await expect(service.cancelar(5, dto, 'auth-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('lanza 400 si el motivo esta vacio', async () => {
    const supabase = buildSupabase({ data: null, error: null });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    await expect(
      service.cancelar(
        5,
        { motivo: '   ' } as CancelarSubcampaniaDto,
        'auth-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({ data: null, error: null });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('GENERAL'),
    );
    await expect(service.cancelar(5, dto, 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lanza 500 si la RPC no esta desplegada', async () => {
    const supabase = buildSupabase({
      data: null,
      error: { code: 'PGRST202', message: 'fn_subcampania_cancelar not found' },
    });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.cancelar(5, dto, 'auth-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('lanza 500 si falta service_role para ejecutar la RPC', async () => {
    const supabase = buildSupabase({
      data: null,
      error: { code: '42501', message: 'permission denied for function' },
    });
    const service = new SubcampaniasCancelacionService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.cancelar(5, dto, 'auth-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
