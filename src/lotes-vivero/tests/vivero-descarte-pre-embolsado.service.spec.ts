import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegistrarDescartePreEmbolsadoDto } from '../api/dto/registrar-descarte-pre-embolsado.dto';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroDescartePreEmbolsadoService } from '../application/vivero-descarte-pre-embolsado.service';
import { ViveroEvidenciasService } from '../application/vivero-evidencias.service';
import { CausaDescartePreEmbolsado } from '../domain/enums/causa-descarte-pre-embolsado.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';

describe('ViveroDescartePreEmbolsadoService', () => {
  let service: ViveroDescartePreEmbolsadoService;
  let rpcMock: jest.Mock;
  let supabaseService: jest.Mocked<Pick<SupabaseService, 'getClient'>>;
  let authService: jest.Mocked<
    Pick<ViveroAuthService, 'getUserByAuthId' | 'assertCanWrite'>
  >;

  const LOTE_ID = 101;
  const AUTH_ID = 'auth-test-id';
  const USUARIO_ID = 77;

  const dto: RegistrarDescartePreEmbolsadoDto = {
    fecha_evento: '2026-05-20',
    cantidad_material_afectado: 25,
    unidad_medida_evento: UnidadMedidaVivero.UNIDAD,
    causa_descarte_pre_embolsado: CausaDescartePreEmbolsado.NO_GERMINACION,
    evidencia_ids: [501],
    observaciones: 'Material sin germinacion',
  };

  beforeEach(() => {
    rpcMock = jest.fn();
    supabaseService = {
      getClient: jest.fn().mockReturnValue({ rpc: rpcMock }),
    };

    authService = {
      getUserByAuthId: jest.fn().mockResolvedValue({
        id: USUARIO_ID,
        nombre: 'Operador Vivero',
        rol: 'GENERAL',
      }),
      assertCanWrite: jest.fn(),
    };

    service = new ViveroDescartePreEmbolsadoService(
      supabaseService as unknown as SupabaseService,
      authService as unknown as ViveroAuthService,
      {} as ViveroEvidenciasService,
    );
  });

  it('registra el descarte pre-embolsado mediante la RPC transaccional', async () => {
    rpcMock.mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: {
          evento_descarte_pre_embolsado_id: 301,
          evento_cierre_id: 302,
          lote_vivero_id: LOTE_ID,
          codigo_trazabilidad: 'VIV-000101-REC-000010',
          cantidad_material_afectado: dto.cantidad_material_afectado,
          unidad_medida_evento: dto.unidad_medida_evento,
          causa_descarte_pre_embolsado: dto.causa_descarte_pre_embolsado,
          evidencia_ids_vinculadas: dto.evidencia_ids,
          lote_finalizado: true,
          motivo_cierre: MotivoCierreLote.DESCARTE_PRE_EMBOLSADO,
        },
        error: null,
      }),
    });

    const response = await service.registrar(LOTE_ID, dto, AUTH_ID);

    expect(authService.getUserByAuthId).toHaveBeenCalledWith(AUTH_ID);
    expect(authService.assertCanWrite).toHaveBeenCalledWith('GENERAL');
    expect(rpcMock).toHaveBeenCalledWith(
      'fn_vivero_registrar_descarte_pre_embolsado',
      {
        p_lote_id: LOTE_ID,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: USUARIO_ID,
        p_cantidad_material_afectado: dto.cantidad_material_afectado,
        p_unidad_medida_evento: dto.unidad_medida_evento,
        p_causa_descarte_pre_embolsado: dto.causa_descarte_pre_embolsado,
        p_observaciones: dto.observaciones,
        p_evidencia_ids: dto.evidencia_ids,
      },
    );
    expect(response.success).toBe(true);
    expect(response.data.lote_finalizado).toBe(true);
    expect(response.data.motivo_cierre).toBe(
      MotivoCierreLote.DESCARTE_PRE_EMBOLSADO,
    );
  });

  it('propaga errores de validacion de la RPC como BadRequestException', async () => {
    rpcMock.mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            'DESCARTE_PRE_EMBOLSADO es total: cantidad_material_afectado debe coincidir.',
        },
      }),
    });

    await expect(service.registrar(LOTE_ID, dto, AUTH_ID)).rejects.toThrow(
      BadRequestException,
    );
  });
});
