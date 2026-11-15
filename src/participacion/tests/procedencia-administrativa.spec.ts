import { ConfigService } from '@nestjs/config';
import type {
  ActorRequest,
  VerifiedActor,
} from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionRegistroService } from '../application/participacion-registro.service';
import { ParticipacionRegistroController } from '../participacion-registro.controller';

const actor = {
  usuario_id: '9007199254740993',
  auth_id: 'admin-sintetico-t5',
  rol: 'ADMIN',
} as VerifiedActor;
const registroId = '9007199254740994';
const envelope = {
  data: {
    registro_plantacion_id: registroId,
    cantidad_total_plantada: 3,
    criterio_atribucion: 'CONSUMOS_PERSISTIDOS',
    consumos: [
      {
        detalle_id: '9007199254740995',
        asignacion_id: '9007199254740996',
        lote_vivero_id: '9007199254740997',
        codigo_lote: 'VIV-SINTETICO-T5-ADMIN',
        planta_id: '9007199254740998',
        cantidad: 3,
        nombre_cientifico_snapshot: 'Nombre histórico',
        nombre_comercial_snapshot: null,
        variedad_snapshot: null,
        origen: {
          tipo: 'HISTORICO_SIN_ORIGEN',
          recoleccion_id: null,
          modalidad: null,
          procedencia: null,
        },
      },
    ],
  },
  observado_en: '2026-11-14T15:00:00.000000Z',
};

describe('T5: procedencia administrativa separada de la propia', () => {
  const rpc = jest.fn();
  const service = new ParticipacionRegistroService(
    { getAdminClient: () => ({ rpc }) } as unknown as SupabaseService,
    { get: () => undefined } as unknown as ConfigService,
  );

  beforeEach(() => rpc.mockReset());

  it('usa RPC administrativa con identidad verificada y conserva IDs/snapshots históricos', async () => {
    rpc.mockResolvedValue({ data: envelope, error: null });
    expect(await service.procedenciaAdministrativa(actor, registroId)).toEqual(
      envelope,
    );
    expect(rpc).toHaveBeenCalledWith(
      'pa_registro_procedencia_administrativa_leer',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_registro_id: registroId,
      },
    );
  });

  it.each([
    [401, 'SESION_INVALIDA'],
    [403, 'CAPACIDAD_INSUFICIENTE'],
    [403, 'CUENTA_INACTIVA'],
    [404, 'RECURSO_NO_VISIBLE'],
  ])(
    'conserva denegación SQL %s/%s sin lectura propia alternativa',
    async (status, codigo) => {
      rpc.mockResolvedValue({
        data: null,
        error: {
          code: `PT${status}`,
          details: JSON.stringify({
            codigo,
            mensaje: 'Denegación sintética.',
            campos: [],
            ambitos: [],
            reintento:
              codigo === 'CUENTA_INACTIVA' || status === 401
                ? 'RECUPERAR_SESION'
                : 'NO_APLICA',
          }),
        },
      });
      await expect(
        service.procedenciaAdministrativa(actor, registroId),
      ).rejects.toMatchObject({
        status,
        response: { error: { codigo }, resultado_concluyente: false },
      });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { ...envelope.data, cantidad_total_plantada: 4 },
    {
      ...envelope.data,
      consumos: [{ ...envelope.data.consumos[0], tercero_origen: 'Privado' }],
    },
    {
      ...envelope.data,
      consumos: [{ ...envelope.data.consumos[0], evidencia_ids: ['1'] }],
    },
    {
      ...envelope.data,
      consumos: [
        { ...envelope.data.consumos[0], detalle_id: 9007199254740995 },
      ],
    },
  ])(
    'falla cerrado ante suma, datos privados o precisión incompatibles',
    async (data) => {
      rpc.mockResolvedValue({ data: { ...envelope, data }, error: null });
      await expect(
        service.procedenciaAdministrativa(actor, registroId),
      ).rejects.toMatchObject({
        status: 503,
        response: { error: { codigo: 'RESULTADO_NO_DETERMINADO' } },
      });
    },
  );

  it('controller conserva BIGINT exacto y rechaza query sin invocar lectura', async () => {
    const lectura = jest.fn().mockResolvedValue(envelope);
    const controller = new ParticipacionRegistroController({
      procedenciaAdministrativa: lectura,
    } as unknown as ParticipacionRegistroService);
    const req = { actor } as ActorRequest;
    await expect(
      controller.procedenciaAdministrativa(req, registroId, {}),
    ).resolves.toEqual(envelope);
    expect(lectura).toHaveBeenCalledWith(actor, registroId);
    expect(() =>
      controller.procedenciaAdministrativa(req, registroId, {
        incluir_fotos: true,
      }),
    ).toThrow();
    expect(() =>
      controller.procedenciaAdministrativa(req, '9223372036854775808', {}),
    ).toThrow();
    expect(lectura).toHaveBeenCalledTimes(1);
  });
});
