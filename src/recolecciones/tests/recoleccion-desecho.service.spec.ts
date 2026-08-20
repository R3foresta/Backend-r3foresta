import { ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionDesechoService } from '../application/recoleccion-desecho.service';

function createSupabaseMock(recoleccion: unknown, rpcResult: unknown) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: recoleccion, error: null }),
  };
  const rpcSingle = jest
    .fn()
    .mockResolvedValue({ data: rpcResult, error: null });

  return {
    client: {
      from: jest.fn().mockReturnValue(query),
      rpc: jest.fn().mockReturnValue({ single: rpcSingle }),
    },
    query,
    rpcSingle,
  };
}

describe('RecoleccionDesechoService', () => {
  it('permite al creador registrar el descarte y devuelve los saldos', async () => {
    const supabase = createSupabaseMock(
      { id: 31, usuario_id: 7 },
      {
        recoleccion_movimiento_id: 100,
        recoleccion_id: 31,
        cantidad_desechada: 50,
        unidad_medida: 'UNIDAD',
        saldo_antes: 100,
        saldo_despues: 50,
        estado_operativo: 'ABIERTO',
      },
    );
    const supabaseService = {
      getClient: jest.fn().mockReturnValue(supabase.client),
    };
    const authService = {
      getUserByAuthId: jest
        .fn()
        .mockResolvedValue({ id: 7, nombre: 'Recolector', rol: 'GENERAL' }),
    };
    const service = new RecoleccionDesechoService(
      supabaseService as unknown as SupabaseService,
      authService as unknown as RecoleccionAuthService,
    );

    const result = await service.registrar(31, { cantidad: 50 }, 'auth-7');

    expect(supabase.client.rpc).toHaveBeenCalledWith(
      'fn_recoleccion_registrar_desecho',
      {
        p_recoleccion_id: 31,
        p_cantidad_desechada: 50,
        p_usuario_id: 7,
      },
    );
    expect(result.data.saldo_despues).toBe(50);
    expect(result.data.estado_operativo).toBe('ABIERTO');
  });

  it('permite a ADMIN registrar el descarte sobre una recoleccion ajena', async () => {
    const supabase = createSupabaseMock(
      { id: 31, usuario_id: 7 },
      {
        recoleccion_movimiento_id: 101,
        recoleccion_id: 31,
        cantidad_desechada: 100,
        unidad_medida: 'UNIDAD',
        saldo_antes: 100,
        saldo_despues: 0,
        estado_operativo: 'CERRADO',
      },
    );
    const service = new RecoleccionDesechoService(
      {
        getClient: jest.fn().mockReturnValue(supabase.client),
      } as unknown as SupabaseService,
      {
        getUserByAuthId: jest
          .fn()
          .mockResolvedValue({ id: 9, nombre: 'Admin', rol: 'ADMIN' }),
      } as unknown as RecoleccionAuthService,
    );

    const result = await service.registrar(31, { cantidad: 100 }, 'auth-admin');

    expect(result.data.estado_operativo).toBe('CERRADO');
    expect(supabase.client.rpc).toHaveBeenCalled();
  });

  it('rechaza que otro usuario que no es ADMIN registre el descarte', async () => {
    const supabase = createSupabaseMock({ id: 31, usuario_id: 7 }, null);
    const service = new RecoleccionDesechoService(
      {
        getClient: jest.fn().mockReturnValue(supabase.client),
      } as unknown as SupabaseService,
      {
        getUserByAuthId: jest
          .fn()
          .mockResolvedValue({ id: 9, nombre: 'Otro usuario', rol: 'GENERAL' }),
      } as unknown as RecoleccionAuthService,
    );

    await expect(
      service.registrar(31, { cantidad: 10 }, 'auth-9'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(supabase.client.rpc).not.toHaveBeenCalled();
  });
});
