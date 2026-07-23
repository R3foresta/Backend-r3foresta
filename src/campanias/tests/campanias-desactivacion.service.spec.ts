import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasAuthService } from '../application/campanias-auth.service';
import { CampaniasDesactivacionService } from '../application/campanias-desactivacion.service';

function buildAuthService(rol = 'ADMIN'): CampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 42, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((role: string) => {
      if (role !== 'ADMIN') throw new ForbiddenException();
    }),
  } as unknown as CampaniasAuthService;
}

function buildPreviewSupabase(config: {
  campania?: { id: number } | null;
  subcampanias?: Array<{
    id: number;
    estado: string;
    total_plantado_inicial: number;
  }>;
  asignaciones?: Array<{
    id: number;
    saldo_asignado_disponible: number;
  }>;
}): SupabaseService {
  const from = jest.fn((tabla: string) => {
    if (tabla === 'campania') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data:
                  config.campania === undefined ? { id: 15 } : config.campania,
                error:
                  config.campania === null ? { message: 'not found' } : null,
              }),
            }),
          }),
        }),
      };
    }

    if (tabla === 'subcampania') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: config.subcampanias ?? [],
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    if (tabla === 'asignacion_vivero_subcampania') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gt: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: config.asignaciones ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

function buildRpcSupabase(result: {
  data: unknown;
  error: { code?: string; message?: string } | null;
}): { supabase: SupabaseService; rpc: jest.Mock } {
  const rpc = jest.fn().mockResolvedValue(result);
  return {
    supabase: {
      getAdminClient: jest.fn().mockReturnValue({ rpc }),
    } as unknown as SupabaseService,
    rpc,
  };
}

describe('CampaniasDesactivacionService.preview', () => {
  it('resume una campaña elegible y sus devoluciones', async () => {
    const supabase = buildPreviewSupabase({
      subcampanias: [
        { id: 1, estado: 'BORRADOR', total_plantado_inicial: 0 },
        { id: 2, estado: 'ACTIVA', total_plantado_inicial: 0 },
        { id: 3, estado: 'CANCELADA', total_plantado_inicial: 0 },
      ],
      asignaciones: [
        { id: 10, saldo_asignado_disponible: 120 },
        { id: 11, saldo_asignado_disponible: 30 },
      ],
    });
    const service = new CampaniasDesactivacionService(
      supabase,
      buildAuthService(),
    );

    const result = await service.preview(15, 'auth-admin');

    expect(result).toEqual({
      success: true,
      data: {
        campania_id: 15,
        elegible: true,
        subcampanias_vivas: 3,
        subcampanias_a_cancelar: 2,
        borradores: 1,
        activas_sin_plantar: 1,
        ya_canceladas: 1,
        asignaciones_con_saldo: 2,
        unidades_a_devolver: 150,
        bloqueos: [],
      },
    });
  });

  it('devuelve 200 lógico con bloqueos estructurados', async () => {
    const service = new CampaniasDesactivacionService(
      buildPreviewSupabase({
        subcampanias: [
          { id: 7, estado: 'COMPLETADA', total_plantado_inicial: 25 },
        ],
      }),
      buildAuthService(),
    );

    const result = await service.preview(15, 'auth-admin');

    expect(result.data.elegible).toBe(false);
    expect(result.data.bloqueos).toEqual([
      expect.objectContaining({
        subcampania_id: 7,
        codigo: 'SUBCAMPANIA_CON_PLANTACIONES',
      }),
      expect.objectContaining({
        subcampania_id: 7,
        codigo: 'ESTADO_NO_ELEGIBLE',
      }),
    ]);
  });

  it('rechaza a un actor que no sea ADMIN', async () => {
    const service = new CampaniasDesactivacionService(
      buildPreviewSupabase({}),
      buildAuthService('GENERAL'),
    );

    await expect(service.preview(15, 'auth-general')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('responde 404 si la campaña no existe o ya fue desactivada', async () => {
    const service = new CampaniasDesactivacionService(
      buildPreviewSupabase({ campania: null }),
      buildAuthService(),
    );

    await expect(service.preview(99, 'auth-admin')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('CampaniasDesactivacionService.desactivar', () => {
  it('ejecuta la RPC con el usuario resuelto y normaliza el resumen', async () => {
    const { supabase, rpc } = buildRpcSupabase({
      data: [
        {
          campania_id: 15,
          deleted_at: '2026-07-23T18:00:00.000Z',
          subcampanias_canceladas: 20,
          asignaciones_devueltas: 3,
          unidades_devueltas: 450,
        },
      ],
      error: null,
    });
    const service = new CampaniasDesactivacionService(
      supabase,
      buildAuthService(),
    );

    const result = await service.desactivar(
      15,
      { motivo: '  Limpieza operativa  ' },
      'auth-admin',
    );

    expect(rpc).toHaveBeenCalledWith(
      'fn_campania_desactivar_sin_plantaciones',
      {
        p_campania_id: 15,
        p_actor_user_id: 42,
        p_motivo: 'Limpieza operativa',
      },
    );
    expect(result.data).toEqual({
      message: 'Campaña desactivada correctamente.',
      campania_id: 15,
      deleted_at: '2026-07-23T18:00:00.000Z',
      subcampanias_canceladas: 20,
      asignaciones_devueltas: 3,
      unidades_devueltas: 450,
    });
  });

  it('rechaza un motivo vacío después de trim', async () => {
    const { supabase, rpc } = buildRpcSupabase({ data: null, error: null });
    const service = new CampaniasDesactivacionService(
      supabase,
      buildAuthService(),
    );

    await expect(
      service.desactivar(15, { motivo: '   ' }, 'auth-admin'),
    ).rejects.toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      { code: 'P0002', message: 'Campania 15 ya desactivada.' },
      NotFoundException,
    ],
    [
      { code: 'P0003', message: 'La campania no es elegible.' },
      UnprocessableEntityException,
    ],
    [{ code: '40001', message: 'conflicto concurrente' }, ConflictException],
    [{ code: 'P0001', message: 'El motivo es invalido.' }, BadRequestException],
    [
      {
        code: 'PGRST202',
        message: 'fn_campania_desactivar_sin_plantaciones not found',
      },
      InternalServerErrorException,
    ],
    [
      {
        code: '42501',
        message: 'permission denied for function',
      },
      InternalServerErrorException,
    ],
  ])('mapea el error RPC %#', async (error, expectedException) => {
    const { supabase } = buildRpcSupabase({ data: null, error });
    const service = new CampaniasDesactivacionService(
      supabase,
      buildAuthService(),
    );

    await expect(
      service.desactivar(15, { motivo: 'Motivo válido' }, 'auth-admin'),
    ).rejects.toThrow(expectedException);
  });
});
