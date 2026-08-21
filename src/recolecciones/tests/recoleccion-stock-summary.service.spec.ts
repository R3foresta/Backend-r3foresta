import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';

function createQueryBuilder(result: {
  data: unknown[] | null;
  error: unknown;
}) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

function createService(options?: {
  plantRows?: unknown[] | null;
  plantError?: unknown;
  collectionRows?: unknown[] | null;
  collectionError?: unknown;
  userRole?: string;
}) {
  const plantsQuery = createQueryBuilder({
    data: options?.plantRows ?? [],
    error: options?.plantError ?? null,
  });
  const collectionsQuery = createQueryBuilder({
    data: options?.collectionRows ?? [],
    error: options?.collectionError ?? null,
  });
  const supabaseService = {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'planta' ? plantsQuery : collectionsQuery,
      ),
    }),
  };
  const authService = {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 42, rol: options?.userRole ?? 'ADMIN' }),
    assertAdminRole: jest.fn((role: string) => {
      if (role !== 'ADMIN') {
        throw new ForbiddenException();
      }
    }),
  };

  const service = new RecoleccionConsultasService(
    supabaseService as any,
    authService as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, plantsQuery, collectionsQuery, authService };
}

describe('RecoleccionConsultasService.findStockSummary', () => {
  it('suma gramos y unidades, y conserva plantas activas con saldo cero', async () => {
    const { service, collectionsQuery, authService } = createService({
      plantRows: [
        { id: 1, especie: 'Caoba', nombre_comun_principal: 'Caoba' },
        { id: 2, especie: 'Cedro', nombre_comun_principal: 'Cedro' },
      ],
      collectionRows: [
        {
          planta_id: 1,
          unidad_canonica: 'G',
          saldo_actual: 120,
          estado_registro: 'VALIDADO',
        },
        {
          planta_id: 1,
          unidad_canonica: 'G',
          saldo_actual: 30.5,
          estado_registro: 'VALIDADO',
        },
        {
          planta_id: 1,
          unidad_canonica: 'UNIDAD',
          saldo_actual: 8,
          estado_registro: 'VALIDADO',
        },
        {
          planta_id: 1,
          unidad_canonica: 'G',
          saldo_actual: 90,
          estado_registro: 'PENDIENTE_VALIDACION',
        },
        {
          planta_id: 999,
          unidad_canonica: 'G',
          saldo_actual: 500,
          estado_registro: 'VALIDADO',
        },
      ],
    });

    const response = await service.findStockSummary('auth-42');

    expect(authService.getUserByAuthId).toHaveBeenCalledWith('auth-42');
    expect(authService.assertAdminRole).toHaveBeenCalledWith('ADMIN');
    expect(collectionsQuery.eq).not.toHaveBeenCalledWith(
      'usuario_id',
      expect.anything(),
    );
    expect(response.data).toEqual([
      expect.objectContaining({
        planta_id: 1,
        gramos_disponibles: 150.5,
        unidades_disponibles: 8,
        pendientes_validacion: 1,
      }),
      expect.objectContaining({
        planta_id: 2,
        gramos_disponibles: 0,
        unidades_disponibles: 0,
        pendientes_validacion: 0,
      }),
    ]);
  });

  it('rechaza el dashboard global para usuarios que no son administradores', async () => {
    const { service } = createService({ userRole: 'GENERAL' });

    await expect(service.findStockSummary('auth-42')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('propaga un error de lectura del saldo como error interno', async () => {
    const { service } = createService({
      collectionError: new Error('database unavailable'),
    });

    await expect(service.findStockSummary('auth-42')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
