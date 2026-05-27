import { UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroDespachoService } from '../application/vivero-despacho.service';
import { ViveroEvidenciasService } from '../application/vivero-evidencias.service';
import { ViveroSaldosService } from '../application/vivero-saldos.service';
import { DestinoTipoVivero } from '../domain/enums/destino-tipo-vivero.enum';

describe('ViveroDespachoService', () => {
  let service: ViveroDespachoService;
  let rpcMock: jest.Mock;
  let supabaseService: jest.Mocked<Pick<SupabaseService, 'getClient'>>;
  let authService: jest.Mocked<
    Pick<ViveroAuthService, 'getUserByAuthId' | 'assertCanWrite'>
  >;
  let saldosService: jest.Mocked<
    Pick<
      ViveroSaldosService,
      'leerSaldoDisponible' | 'assertCantidadNoExcedeSaldo'
    >
  >;

  const LOTE_ID = 101;
  const AUTH_ID = 'auth-test-id';
  const USUARIO_ID = 77;

  const dto: RegistrarDespachoDto = {
    fecha_evento: '2026-05-20',
    cantidad_afectada: 40,
    destino_tipo: DestinoTipoVivero.DONACION,
    destino_referencia: 'Comunidad QA',
    comunidad_destino_id: 9,
    evidencia_ids: [501],
    observaciones: 'Despacho manual QA',
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

    saldosService = {
      leerSaldoDisponible: jest.fn(),
      assertCantidadNoExcedeSaldo: jest.fn(),
    };

    service = new ViveroDespachoService(
      supabaseService as unknown as SupabaseService,
      authService as unknown as ViveroAuthService,
      {} as ViveroEvidenciasService,
      saldosService as unknown as ViveroSaldosService,
    );
  });

  it('rechaza el despacho manual si excede el saldo libre sin llamar la RPC', async () => {
    saldosService.leerSaldoDisponible.mockResolvedValue(30);
    saldosService.assertCantidadNoExcedeSaldo.mockImplementation(() => {
      throw new UnprocessableEntityException(
        'La cantidad solicitada excede el saldo vivo disponible para asignacion.',
      );
    });

    await expect(service.registrar(LOTE_ID, dto, AUTH_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(saldosService.leerSaldoDisponible).toHaveBeenCalledWith(LOTE_ID);
    expect(saldosService.assertCantidadNoExcedeSaldo).toHaveBeenCalledWith(
      dto.cantidad_afectada,
      30,
      LOTE_ID,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('registra el despacho cuando la cantidad no excede el saldo libre', async () => {
    saldosService.leerSaldoDisponible.mockResolvedValue(50);
    rpcMock.mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: {
          evento_despacho_id: 301,
          lote_vivero_id: LOTE_ID,
          codigo_trazabilidad: 'VIV-000101-REC-000010',
          cantidad_despachada: dto.cantidad_afectada,
          destino_tipo: dto.destino_tipo,
          destino_referencia: dto.destino_referencia,
          comunidad_destino_id: dto.comunidad_destino_id,
          saldo_vivo_antes: 120,
          saldo_vivo_despues: 80,
          evidencia_ids_vinculadas: dto.evidencia_ids,
          lote_finalizado: false,
          motivo_cierre: null,
        },
        error: null,
      }),
    });

    const response = await service.registrar(LOTE_ID, dto, AUTH_ID);

    expect(saldosService.assertCantidadNoExcedeSaldo).toHaveBeenCalledWith(
      dto.cantidad_afectada,
      50,
      LOTE_ID,
    );
    expect(rpcMock).toHaveBeenCalledWith('fn_vivero_registrar_despacho', {
      p_lote_id: LOTE_ID,
      p_fecha_evento: dto.fecha_evento,
      p_responsable_id: USUARIO_ID,
      p_cantidad_despachada: dto.cantidad_afectada,
      p_destino_tipo: dto.destino_tipo,
      p_destino_referencia: dto.destino_referencia,
      p_comunidad_destino_id: dto.comunidad_destino_id,
      p_observaciones: dto.observaciones,
      p_evidencia_ids: dto.evidencia_ids,
    });
    expect(response.success).toBe(true);
    expect(response.data.saldo_vivo_despues).toBe(80);
  });
});
