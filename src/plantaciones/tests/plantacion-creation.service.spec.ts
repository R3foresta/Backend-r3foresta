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
  const from = jest.fn();
  const supabase = {
    getClient: jest.fn().mockReturnValue({ rpc, from }),
  } as unknown as SupabaseService;
  return { supabase, rpc, single, from };
}

function buildRpcRow(overrides: Record<string, unknown> = {}) {
  return {
    registro_plantacion_id: 500,
    codigo_trazabilidad: 'PLT-001-SUB-001-CMP-2026-001',
    cantidad_total_plantada: 50,
    gps_dentro_poligono: true,
    gps_distancia_a_poligono_m: 0,
    consumos: [],
    coresponsable_ids_vinculados: [],
    evidencia_ids_vinculadas: [101, 102],
    ...overrides,
  };
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
        consumos: [
          {
            asignacion_id: 1,
            lote_vivero_id: 2,
            cantidad_consumida: 50,
            saldo_asignado_antes: 100,
            saldo_asignado_despues: 50,
            estado_final: 'ACTIVA',
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
    // Contrato fisico (RN-VIV-52): plantar consume asignaciones, no expone
    // despachos M2. Si `despachos` reaparece en la respuesta, es una regresion.
    expect(result.data).not.toHaveProperty('despachos');
    expect(result.data.consumos).toHaveLength(1);
    expect(result.data.consumos[0]).toMatchObject({
      asignacion_id: 1,
      lote_vivero_id: 2,
      cantidad_consumida: 50,
      saldo_asignado_antes: 100,
      saldo_asignado_despues: 50,
      estado_final: 'ACTIVA',
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
        consumos: [],
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

  it('envia la especie incorporada al plan vigente sin una lectura previa del plan', async () => {
    const auth = buildAuthService();
    const detalles = [
      { asignacion_id: 20, lote_vivero_id: 21, planta_id: 8, cantidad: 12 },
    ];
    const { supabase, rpc, from } = buildSupabaseWithRpc({
      data: buildRpcRow({
        cantidad_total_plantada: 12,
        consumos: [
          {
            asignacion_id: 20,
            lote_vivero_id: 21,
            cantidad_consumida: 12,
            saldo_asignado_antes: 20,
            saldo_asignado_despues: 8,
            estado_final: 'ACTIVA',
          },
        ],
      }),
      error: null,
    });
    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    const result = await service.registrar(buildDto({ detalles }), 'auth-99');

    // La RPC consulta el plan bajo el mismo lock de subcampania que su revision.
    // Una comprobacion previa en la aplicacion podria usar una version obsoleta.
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'fn_m3_registrar_plantacion',
      expect.objectContaining({ p_detalles: detalles, p_responsable_id: 99 }),
    );
    expect(result.data.cantidad_total_plantada).toBe(12);
    expect(result.data.consumos[0]).toMatchObject({
      asignacion_id: 20,
      saldo_asignado_despues: 8,
    });
  });

  it('acepta plantacion inicial autorizada por la RPC sin modificar metas ni cerrar', async () => {
    const auth = buildAuthService();
    const { supabase, rpc, from } = buildSupabaseWithRpc({
      data: buildRpcRow(),
      error: null,
    });
    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    // ADR-PLA-04/05: la RPC puede aceptar 50 con una meta vigente de 40.
    // El servicio no debe introducir otra escritura ni usar la meta como tope.
    const result = await service.registrar(buildDto(), 'auth-99');

    expect(result.data.cantidad_total_plantada).toBe(50);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'fn_m3_registrar_plantacion',
      expect.objectContaining({ p_es_reposicion: false }),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      'especie fuera del plan',
      'La especie (planta_id 8) no esta en el plan de especies de la subcampania 10 (SUBCAMPANIA_META_ESPECIE).',
    ],
    [
      'stock inicial insuficiente',
      'Saldo asignado insuficiente en alguna asignacion (pedido excede saldo_asignado_disponible).',
    ],
    [
      'proposito de asignacion incorrecto',
      'Proposito incoherente: para es_reposicion=false se requiere asignaciones con proposito PLANTACION_INICIAL.',
    ],
    [
      'cierre manual ya realizado',
      'La subcampania 10 no esta ACTIVA (estado actual: COMPLETADA). La plantacion inicial solo se permite en ACTIVA.',
    ],
    [
      'responsable fuera del equipo',
      'El responsable 99 no pertenece al equipo (COORDINADOR|OPERARIO) de la subcampania 10.',
    ],
  ])(
    'propaga el rechazo atomico por %s tras una revision',
    async (_, message) => {
      const auth = buildAuthService();
      const { supabase, rpc, from } = buildSupabaseWithRpc({
        data: null,
        error: { message },
      });
      const service = new PlantacionCreationService(
        supabase,
        auth as unknown as PlantacionAuthService,
      );

      await expect(
        service.registrar(
          buildDto({
            detalles: [
              {
                asignacion_id: 20,
                lote_vivero_id: 21,
                planta_id: 8,
                cantidad: 50,
              },
            ],
          }),
          'auth-99',
        ),
      ).rejects.toThrow(new BadRequestException(message));

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(from).not.toHaveBeenCalled();
    },
  );

  it('conserva el origen de reposicion y el rechazo del limite de mortandad', async () => {
    const auth = buildAuthService();
    const message =
      'La reposicion (6) excede el pendiente de reposicion del grupo origen 400 (muertas acumuladas 7 - repuestas acumuladas 2 = pendiente 5).';
    const { supabase, rpc } = buildSupabaseWithRpc({
      data: null,
      error: { message },
    });
    const service = new PlantacionCreationService(
      supabase,
      auth as unknown as PlantacionAuthService,
    );

    await expect(
      service.registrar(
        buildDto({
          es_reposicion: true,
          registro_plantacion_origen_id: 400,
          detalles: [
            {
              asignacion_id: 20,
              lote_vivero_id: 21,
              planta_id: 8,
              cantidad: 6,
            },
          ],
        }),
        'auth-99',
      ),
    ).rejects.toThrow(new BadRequestException(message));

    expect(rpc).toHaveBeenCalledWith(
      'fn_m3_registrar_plantacion',
      expect.objectContaining({
        p_es_reposicion: true,
        p_registro_plantacion_origen_id: 400,
      }),
    );
  });
});
