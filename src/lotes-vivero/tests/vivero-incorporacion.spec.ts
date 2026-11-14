import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupabaseService } from '../../supabase/supabase.service';
import { IncorporarPlantasDto } from '../api/dto/incorporar-plantas.dto';
import { ViveroIncorporacionService } from '../application/vivero-incorporacion.service';
import {
  ModalidadIncorporacion as M,
  ProcedenciaIncorporacion as P,
  validarProcedenciaIncorporacion,
} from '../domain/policies/incorporacion.policy';

const solicitud = '1b2bb918-50db-4eec-8bad-4e7300c41ce3';
const dto: IncorporarPlantasDto = {
  solicitud_id: solicitud,
  vivero_id: '9007199254740993',
  planta_id: '10',
  modalidad: M.RECEPCION,
  procedencia: P.COMPRA,
  fecha_evento: '2026-11-13',
  cantidad: 100,
  evidencia_ids: ['9007199254740995'],
};
const confirmado = {
  estado: 'CONFIRMADO',
  data: {
    lote_vivero_id: '9007199254740993',
    evento_incorporacion_id: '9007199254740994',
    cantidad: 100,
    saldo_vivo_antes: 0,
    saldo_vivo_despues: 100,
    evidencia_ids_vinculadas: ['9007199254740995'],
  },
};

describe('Incorporación: contrato de intención y recuperación', () => {
  let rpc: jest.Mock;
  let service: ViveroIncorporacionService;
  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue({ data: confirmado, error: null });
    service = new ViveroIncorporacionService({
      getAdminClient: () => ({ rpc }),
    } as unknown as SupabaseService);
  });

  it('manda actor verificado separado de la intención y conserva IDs exactos y saldo confirmado', async () => {
    const result = await service.incorporar('9007199254740997', dto);
    expect(rpc).toHaveBeenCalledWith('m2_incorporacion_crear', {
      p_actor_id: '9007199254740997',
      p_solicitud_id: solicitud,
      p_payload: expect.objectContaining({
        vivero_id: '9007199254740993',
        cantidad: 100,
      }),
    });
    expect(rpc.mock.calls[0][1].p_payload.solicitud_id).toBeUndefined();
    expect(result).toEqual({ success: true, ...confirmado });
  });

  it('recupera sin pedir autoridad de nueva escritura ni consultar saldo actual', async () => {
    expect(await service.recuperar('77', solicitud)).toEqual({
      success: true,
      ...confirmado,
    });
    expect(rpc).toHaveBeenCalledWith('m2_incorporacion_recuperar', {
      p_actor_id: '77',
      p_solicitud_id: solicitud,
    });
  });

  it('una ausencia de recibo sigue siendo inconclusa', async () => {
    rpc.mockResolvedValue({ data: { estado: 'SIN_RESULTADO' }, error: null });
    expect(await service.recuperar('77', solicitud)).toEqual({
      success: true,
      estado: 'SIN_RESULTADO',
      resultado_concluyente: false,
    });
  });

  it.each(['55P03', '57014', '40001', '40P01', 'PGRST000'])(
    'no reintenta automáticamente ante %s',
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(service.incorporar('77', dto)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it('una respuesta perdida conserva la incertidumbre y la misma clave', async () => {
    rpc.mockRejectedValue(new Error('respuesta perdida'));
    await expect(service.incorporar('77', dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['23505', ConflictException],
    ['42501', ForbiddenException],
    ['22023', BadRequestException],
  ] as const)('traduce %s sin revelar el recibo ajeno', async (code, error) => {
    rpc.mockResolvedValue({ data: confirmado, error: { code } });
    await expect(service.incorporar('77', dto)).rejects.toThrow(error);
  });

  it('rechaza un transporte que ya redondeó un BIGINT', async () => {
    rpc.mockResolvedValue({
      data: {
        ...confirmado,
        data: { ...confirmado.data, lote_vivero_id: 9007199254740992 },
      },
      error: null,
    });
    await expect(service.recuperar('77', solicitud)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('no abre producción nueva mediante RECEPCION', async () => {
    await expect(
      service.incorporar('77', { ...dto, procedencia: P.PRODUCCION_PROPIA }),
    ).rejects.toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Incorporación: DTO y reglas puras', () => {
  it.each(Object.values(P))(
    'saldo inicial admite %s conservando su distinción de recepción',
    (procedencia) => {
      expect(
        validarProcedenciaIncorporacion({
          modalidad: M.SALDO_INICIAL,
          procedencia,
          observaciones: 'Conteo actual; antecedentes incompletos.',
        }),
      ).toBeNull();
    },
  );
  it('origen desconocido exige explicar la ausencia', () => {
    expect(
      validarProcedenciaIncorporacion({
        modalidad: M.SALDO_INICIAL,
        procedencia: P.DESCONOCIDA,
        observaciones: '  ',
      }),
    ).toBeTruthy();
  });
  it('acepta IDs BIGINT como texto sin redondearlos', async () => {
    expect(
      await validate(plainToInstance(IncorporarPlantasDto, dto)),
    ).toHaveLength(0);
  });
  it.each([
    { cantidad: 0 },
    { cantidad: 1.5 },
    { cantidad: 2147483648 },
    { cantidad: true },
    { fecha_evento: '2026-02-30' },
    { fecha_evento: '2026-11-13T12:00:00Z' },
    { vivero_id: 9007199254740992 },
    { evidencia_ids: ['10', '10'] },
    { evidencia_ids: [] },
    { evidencia_ids: ['1', '2', '3', '4', '5', '6'] },
    { responsable_id: '88' },
  ])('rechaza límites o campos no autorizados %j', async (cambio) => {
    expect(
      (
        await validate(
          plainToInstance(IncorporarPlantasDto, { ...dto, ...cambio }),
          { whitelist: true, forbidNonWhitelisted: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
