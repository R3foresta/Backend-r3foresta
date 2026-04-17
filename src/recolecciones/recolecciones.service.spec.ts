import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainService } from '../blockchain/blockchain.service';
import { UbicacionesReadService } from '../common/ubicaciones/ubicaciones-read.service';
import { PinataService } from '../pinata/pinata.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RecoleccionElegibilidadService } from './recoleccion-elegibilidad.service';
import { RecoleccionesService } from './recolecciones.service';

function createQueryBuilder(result: {
  data: any;
  error: any;
  count?: number | null;
}) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

describe('RecoleccionesService', () => {
  let service: RecoleccionesService;
  let supabaseService: { getClient: jest.Mock };
  let ubicacionesReadService: { getUbicacionesByIds: jest.Mock };

  beforeEach(async () => {
    supabaseService = {
      getClient: jest.fn(),
    };
    ubicacionesReadService = {
      getUbicacionesByIds: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoleccionesService,
        RecoleccionElegibilidadService,
        {
          provide: SupabaseService,
          useValue: supabaseService,
        },
        {
          provide: PinataService,
          useValue: {},
        },
        {
          provide: BlockchainService,
          useValue: {},
        },
        {
          provide: UbicacionesReadService,
          useValue: ubicacionesReadService,
        },
      ],
    }).compile();

    service = module.get(RecoleccionesService);
  });

  it('proyecta columnas canonicas sin aliases legacy de cantidad/unidad', () => {
    const select = (service as any).getCanonicalRecoleccionSelect() as string;

    expect(select).toContain('cantidad_inicial_canonica');
    expect(select).toContain('unidad_canonica');
    expect(select).toContain('blockchain_hash_validacion');
    expect(select).not.toContain('cantidad:cantidad_inicial_canonica');
    expect(select).not.toContain('unidad:unidad_canonica');
  });

  it('incluye elegibilidad y motivo en el detalle de recoleccion', async () => {
    const recoleccionQuery = createQueryBuilder({
      data: {
        id: 9,
        estado_registro: 'VALIDADO',
        estado_operativo: 'ABIERTO',
        saldo_actual: 40,
        cantidad_inicial_canonica: 50,
        planta_id: 12,
        planta: {
          nombre_cientifico: 'Swietenia macrophylla',
          nombre_comun_principal: 'Mara',
        },
      },
      error: null,
    });
    const evidenciasQuery = createQueryBuilder({
      data: [],
      error: null,
    });

    const client = {
      from: jest.fn((table: string) => {
        if (table === 'recoleccion') {
          return recoleccionQuery;
        }

        if (table === 'evidencias_trazabilidad') {
          return evidenciasQuery;
        }

        throw new Error(`Tabla no esperada en test: ${table}`);
      }),
      storage: {
        from: jest.fn(() => ({
          getPublicUrl: jest.fn(() => ({
            data: { publicUrl: 'https://example.test/evidencia.jpg' },
          })),
        })),
      },
    };

    supabaseService.getClient.mockReturnValue(client);

    const response = await service.findOne(9, 45);

    expect(response.data.saldo_actual).toBe(40);
    expect(response.data.estado_operativo).toBe('ABIERTO');
    expect(response.data.elegible_para_vivero).toBe(false);
    expect(response.data.motivo_no_elegibilidad_para_vivero).toBe(
      'La recoleccion no tiene saldo suficiente para la cantidad solicitada.',
    );
    expect(response.data.cantidad_solicitada_vivero_evaluada).toBe(45);
  });

  it('lista recolecciones por vivero sin depender de token_id y expone elegibilidad operativa', async () => {
    const viveroQuery = createQueryBuilder({
      data: { id: 3 },
      error: null,
    });
    const recoleccionesQuery = createQueryBuilder({
      data: [
        {
          id: 1,
          vivero_id: 3,
          estado_registro: 'BORRADOR',
          estado_operativo: 'ABIERTO',
          saldo_actual: 20,
          cantidad_inicial_canonica: 20,
          planta_id: 5,
          planta: {
            nombre_cientifico: 'Cedrela odorata',
            nombre_comun_principal: 'Cedro',
          },
        },
        {
          id: 2,
          vivero_id: 3,
          estado_registro: 'VALIDADO',
          estado_operativo: 'ABIERTO',
          saldo_actual: 20,
          cantidad_inicial_canonica: 20,
          planta_id: 6,
          planta: {
            nombre_cientifico: 'Ceiba speciosa',
            nombre_comun_principal: 'Toborochi',
          },
        },
      ],
      error: null,
      count: 2,
    });
    const evidenciasQuery = createQueryBuilder({
      data: [],
      error: null,
      count: 0,
    });

    const client = {
      from: jest.fn((table: string) => {
        if (table === 'vivero') {
          return viveroQuery;
        }

        if (table === 'recoleccion') {
          return recoleccionesQuery;
        }

        if (table === 'evidencias_trazabilidad') {
          return evidenciasQuery;
        }

        throw new Error(`Tabla no esperada en test: ${table}`);
      }),
      storage: {
        from: jest.fn(() => ({
          getPublicUrl: jest.fn(() => ({
            data: { publicUrl: 'https://example.test/evidencia.jpg' },
          })),
        })),
      },
    };

    supabaseService.getClient.mockReturnValue(client);

    const response = await service.findByVivero(3, {
      page: 1,
      limit: 10,
      cantidad_solicitada_vivero: 10,
    });

    expect(recoleccionesQuery.not).not.toHaveBeenCalled();
    expect(recoleccionesQuery.eq).not.toHaveBeenCalledWith(
      'estado_registro',
      'VALIDADO',
    );
    expect(response.data).toHaveLength(2);
    expect(response.data[0].elegible_para_vivero).toBe(false);
    expect(response.data[0].motivo_no_elegibilidad_para_vivero).toBe(
      'La recoleccion no esta validada.',
    );
    expect(response.data[1].elegible_para_vivero).toBe(true);
    expect(response.data[1].cantidad_solicitada_vivero_evaluada).toBe(10);
  });
});
