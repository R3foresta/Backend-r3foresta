import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegistrarPlantacionDto } from '../api/dto/registrar-plantacion.dto';
import { PlantacionAuthService } from '../application/plantacion-auth.service';
import { PlantacionCreationService } from '../application/plantacion-creation.service';

function buildDto(
  overrides: Partial<RegistrarPlantacionDto> = {},
): RegistrarPlantacionDto {
  return {
    subcampania_id: 10,
    es_reposicion: false,
    fecha_plantacion: '2026-05-20',
    latitud: -16.5,
    longitud: -68.15,
    observaciones: 'OK',
    coresponsable_ids: [],
    detalles: [
      { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 50 },
    ],
    evidencia_ids: [101, 102],
    ...overrides,
  } as RegistrarPlantacionDto;
}

function buildSupabaseWithRpc(result: { data: any; error: any }) {
  const single = jest.fn().mockResolvedValue(result);
  const rpc = jest.fn().mockReturnValue({ single });
  const supabase = {
    getClient: jest.fn().mockReturnValue({ rpc }),
  } as unknown as SupabaseService;
  return { supabase, rpc, single };
}

function buildAuthService(): jest.Mocked<
  Pick<PlantacionAuthService, 'getUserByAuthId' | 'assertCanWrite'>
> {
  return {
    getUserByAuthId: jest.fn().mockResolvedValue({
      id: 99,
      nombre: 'Andy',
      rol: 'GENERAL',
    }),
    assertCanWrite: jest.fn(),
  };
}

describe('PlantacionCreationService', () => {
  it('mapea dto a parametros RPC y respuesta a shape esperado', async () => {
    const auth = buildAuthService();
    const { supabase, rpc } = buildSupabaseWithRpc({
      data: {
        registro_plantacion_id: 500,
        codigo_trazabilidad: 'PLT-001-SUB-001-CMP-2026-001',
        cantidad_total_plantada: 50,
        gps_dentro_poligono: true,
        gps_distancia_a_poligono_m: 0,
        despachos: [
          {
            evento_id: 7001,
            lote_vivero_id: 2,
            codigo_trazabilidad_lote: 'VIV-000002-REC-000001',
            cantidad_afectada: 50,
            saldo_vivo_antes: 100,
            saldo_vivo_despues: 50,
            lote_finalizado: false,
            motivo_cierre: null,
          },
        ],
        coresponsable_ids_vinculados: [],
        evidencia_ids_vinculadas: [101, 102],
      },
      error: null,
    });

    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    const result = await service.registrar(buildDto(), 'auth-99');

    expect(auth.getUserByAuthId).toHaveBeenCalledWith('auth-99');
    expect(auth.assertCanWrite).toHaveBeenCalledWith('GENERAL');
    expect(rpc).toHaveBeenCalledWith('fn_m3_registrar_plantacion', {
      p_subcampania_id: 10,
      p_es_reposicion: false,
      p_registro_plantacion_origen_id: null,
      p_fecha_plantacion: '2026-05-20',
      p_responsable_id: 99,
      p_latitud: -16.5,
      p_longitud: -68.15,
      p_observaciones: 'OK',
      p_coresponsable_ids: [],
      p_detalles: [
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 50 },
      ],
      p_evidencia_ids: [101, 102],
    });

    expect(result.success).toBe(true);
    expect(result.data.registro_plantacion_id).toBe(500);
    expect(result.data.codigo_trazabilidad).toBe(
      'PLT-001-SUB-001-CMP-2026-001',
    );
    expect(result.data.despachos).toHaveLength(1);
    expect(result.data.despachos[0]).toMatchObject({
      evento_id: 7001,
      lote_vivero_id: 2,
      cantidad_afectada: 50,
      saldo_vivo_antes: 100,
      saldo_vivo_despues: 50,
      lote_finalizado: false,
      motivo_cierre: null,
    });
    expect(result.data.evidencia_ids_vinculadas).toEqual([101, 102]);
  });

  it('normaliza coresponsables (deduplica y quita responsable)', async () => {
    const auth = buildAuthService();
    const { supabase, rpc } = buildSupabaseWithRpc({
      data: {
        registro_plantacion_id: 1,
        codigo_trazabilidad: 'PLT-001-X',
        cantidad_total_plantada: 50,
        gps_dentro_poligono: true,
        gps_distancia_a_poligono_m: 0,
        despachos: [],
        coresponsable_ids_vinculados: [3, 4],
        evidencia_ids_vinculadas: [101],
      },
      error: null,
    });

    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    await service.registrar(
      buildDto({ coresponsable_ids: [4, 99, 3, 4, 99] }),
      'auth-99',
    );

    const callArgs = rpc.mock.calls[0][1];
    expect(callArgs.p_coresponsable_ids).toEqual([3, 4]);
  });

  it('lanza BadRequestException cuando la RPC falla', async () => {
    const auth = buildAuthService();
    const { supabase } = buildSupabaseWithRpc({
      data: null,
      error: { message: 'Saldo insuficiente' },
    });

    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    await expect(service.registrar(buildDto(), 'auth-99')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza es_reposicion=true sin origen antes de llamar la RPC', async () => {
    const auth = buildAuthService();
    const { supabase, rpc } = buildSupabaseWithRpc({
      data: null,
      error: null,
    });
    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    await expect(
      service.registrar(
        buildDto({
          es_reposicion: true,
          registro_plantacion_origen_id: undefined,
        }),
        'auth-99',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza detalles duplicados antes de llamar la RPC', async () => {
    const auth = buildAuthService();
    const { supabase, rpc } = buildSupabaseWithRpc({
      data: null,
      error: null,
    });
    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    await expect(
      service.registrar(
        buildDto({
          detalles: [
            { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 5 },
            { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 7 },
          ],
        }),
        'auth-99',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(rpc).not.toHaveBeenCalled();
  });
});
