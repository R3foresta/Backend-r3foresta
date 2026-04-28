import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroInicioService } from '../application/vivero-inicio.service';

describe('ViveroInicioService', () => {
  const dto = {
    recoleccion_id: 10,
    vivero_id: 2,
    fecha_inicio: '2026-04-20',
    fecha_evento: '2026-04-20',
    cantidad_inicial_en_proceso: 8,
    unidad_medida_inicial: UnidadMedidaVivero.UNIDAD,
    evidencia_ids: [501],
    observaciones: 'Inicio de prueba',
  };

  let rpc: jest.Mock;
  let service: ViveroInicioService;
  let authService: jest.Mocked<Pick<ViveroAuthService, 'getUserByAuthId' | 'assertCanWrite'>>;

  beforeEach(() => {
    // Se mockea el cliente de Supabase para controlar la respuesta de la RPC
    // sin tocar la base de datos real.
    rpc = jest.fn();
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({ rpc }),
    } as unknown as SupabaseService;

    // El servicio necesita resolver el usuario autenticado y validar permisos
    // antes de iniciar el lote en vivero.
    authService = {
      getUserByAuthId: jest.fn().mockResolvedValue({
        id: 77,
        nombre: 'Responsable Vivero',
        rol: 'GENERAL',
      }),
      assertCanWrite: jest.fn(),
    };

    service = new ViveroInicioService(
      supabaseService,
      authService as unknown as ViveroAuthService,
    );
  });

  it('llama la RPC de inicio con responsable autenticado y retorna el resumen atomico', async () => {
    // Arrange: la RPC simula la creacion atomica del lote, evento y movimiento
    // de recoleccion, devolviendo el resumen que espera el controlador.
    rpc.mockResolvedValue({
      data: [
        {
          lote_vivero_id: 101,
          evento_inicio_id: 202,
          recoleccion_movimiento_id: 303,
          codigo_trazabilidad: 'VIV-000101-REC-000010',
          saldo_recoleccion_antes: 10,
          saldo_recoleccion_despues: 2,
          evidencia_inicio_ids: [501],
        },
      ],
      error: null,
    });

    // Act: se ejecuta el flujo completo desde una recoleccion existente.
    const result = await service.crearDesdeRecoleccion(dto, 'auth-1');

    // Assert: primero se valida que el servicio autentica y autoriza antes de
    // llamar la RPC con todos los parametros normalizados.
    expect(authService.getUserByAuthId).toHaveBeenCalledWith('auth-1');
    expect(authService.assertCanWrite).toHaveBeenCalledWith('GENERAL');
    expect(rpc).toHaveBeenCalledWith('fn_vivero_crear_lote_desde_recoleccion', {
      p_recoleccion_id: 10,
      p_vivero_id: 2,
      p_responsable_id: 77,
      p_fecha_inicio: '2026-04-20',
      p_fecha_evento: '2026-04-20',
      p_cantidad_inicial_en_proceso: 8,
      p_unidad_medida_inicial: 'UNIDAD',
      p_observaciones: 'Inicio de prueba',
      p_evidencia_ids: [501],
    });
    // Tambien se verifica que la respuesta publica conserva el resumen atomico
    // que devuelve la funcion de base de datos.
    expect(result).toEqual({
      success: true,
      data: {
        lote_vivero_id: 101,
        evento_inicio_id: 202,
        recoleccion_movimiento_id: 303,
        codigo_trazabilidad: 'VIV-000101-REC-000010',
        saldo_recoleccion_antes: 10,
        saldo_recoleccion_despues: 2,
        evidencia_inicio_ids: [501],
      },
    });
  });

  it('reintenta si la RPC rechaza por codigo_trazabilidad duplicado', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
          details: 'Key (codigo_trazabilidad)=(VIV-000011-REC-000010) already exists.',
        },
      })
      .mockResolvedValueOnce({
        data: {
          lote_vivero_id: 11,
          evento_inicio_id: 12,
          recoleccion_movimiento_id: 13,
          codigo_trazabilidad: 'VIV-000012-REC-000010',
          saldo_recoleccion_antes: 20,
          saldo_recoleccion_despues: 12,
          evidencia_inicio_ids: [501],
        },
        error: null,
      });

    // Act: el servicio debe manejar internamente el duplicado y volver a probar.
    const result = await service.crearDesdeRecoleccion(dto, 'auth-1');

    // Assert: se confirma que hubo dos intentos y que ambos conservaron las
    // evidencias requeridas por la RPC estricta.
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_evidencia_ids).toEqual([501]);
    expect(rpc.mock.calls[1][1].p_evidencia_ids).toEqual([501]);
    expect(result.data.codigo_trazabilidad).toBe('VIV-000012-REC-000010');
  });

  it('propaga errores de negocio de la RPC como BadRequestException', async () => {
    // Arrange: la RPC devuelve un error de negocio, por ejemplo una recoleccion
    // que no cumple las reglas para iniciar un lote en vivero.
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'La recoleccion 10 no esta validada.',
      },
    });

    // Act + Assert: el servicio traduce el error de la base de datos a una
    // excepcion HTTP controlada para la capa superior.
    await expect(service.crearDesdeRecoleccion(dto, 'auth-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
