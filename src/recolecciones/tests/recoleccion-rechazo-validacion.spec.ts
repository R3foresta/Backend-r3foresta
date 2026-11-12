import { HttpException, Logger } from '@nestjs/common';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { RecoleccionRecepcionService } from '../application/recoleccion-recepcion.service';
import { RecoleccionBlockchainService } from '../application/recoleccion-blockchain.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import {
  parseRecepcionComando,
  parseRecepcionRechazo,
} from '../api/dto/recepcion-semillas.dto';

const key = '4ff8f9bb-4280-463d-95c8-97a3f11f122c';
const actor = {
  usuario_id: '20',
  auth_id: 'sesion-verificada',
  rol: 'VALIDADOR',
} as VerifiedActor;
const payload = (accion: 'RECIBIR' | 'RECHAZAR') =>
  accion === 'RECIBIR'
    ? parseRecepcionComando('100', {
        comando_id: key,
        revision_esperada: '5',
        cantidad_recibida: 100,
        unidad_recibida: 'G',
        fecha_recepcion: '2026-11-06',
        evidencia_ids: ['9'],
      }).payload
    : parseRecepcionRechazo('100', {
        comando_id: key,
        revision_esperada: '5',
        motivo_rechazo: 'Cantidad declarada no conforme',
      }).payload;
const receipt = (accion: 'RECIBIR' | 'RECHAZAR', nueva = true) => ({
  http_status: 200,
  ejecucion_nueva: nueva,
  body: {
    comando_id: key,
    estado: 'CONFIRMADO',
    error: null,
    finalizado_en: '2026-11-06T12:00:00Z',
    resultado: {
      accion,
      recoleccion_id: '100',
      vivero_id: '1',
      recepcion_id: accion === 'RECIBIR' ? '1' : null,
      revision_anterior: '5',
      revision_nueva: '6',
      cantidad_recibida: accion === 'RECIBIR' ? 100 : null,
      unidad_recibida: accion === 'RECIBIR' ? 'G' : null,
      fecha_recepcion: accion === 'RECIBIR' ? '2026-11-06' : null,
      actor_id: '20',
      saldo_actual: 100,
      estado_registro: accion === 'RECIBIR' ? 'VALIDADO' : 'RECHAZADO',
      anclaje_externo: accion === 'RECIBIR' ? 'FUERA_TRANSACCION' : 'NO_APLICA',
      motivo_rechazo:
        accion === 'RECHAZAR' ? 'Cantidad declarada no conforme' : null,
      registrado_en: '2026-11-06T12:00:00Z',
    },
  },
});
describe('Decisión y anclaje posterior a recepción', () => {
  let rpc: jest.Mock;
  let blockchain: { executeBlockchainFlow: jest.Mock };
  let service: RecoleccionRecepcionService;
  beforeEach(() => {
    rpc = jest.fn();
    blockchain = {
      executeBlockchainFlow: jest.fn().mockResolvedValue(undefined),
    };
    service = new RecoleccionRecepcionService(
      {
        getAdminClient: () => ({ rpc }),
        getClient: () => {
          throw new Error('Cliente público prohibido');
        },
      } as unknown as SupabaseService,
      {} as EvidenceFileService,
      blockchain as unknown as RecoleccionBlockchainService,
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  it('el rechazo de ficha confirmado usa actor de sesión y no ejecuta blockchain', async () => {
    const r = receipt('RECHAZAR');
    rpc.mockResolvedValue({ data: r, error: null });
    await expect(
      service.ejecutar(actor, key, payload('RECHAZAR')),
    ).resolves.toEqual(r);
    expect(rpc).toHaveBeenCalledWith('m1_recepcion_ejecutar', {
      p_actor_id: '20',
      p_auth_id: actor.auth_id,
      p_comando_id: key,
      p_payload: payload('RECHAZAR'),
    });
    expect(blockchain.executeBlockchainFlow).not.toHaveBeenCalled();
  });
  it('ejecuta anclaje sólo tras recibir por primera vez; replay y recuperación lo conservan', async () => {
    rpc
      .mockResolvedValueOnce({ data: receipt('RECIBIR'), error: null })
      .mockResolvedValue({ data: receipt('RECIBIR', false), error: null });
    await service.ejecutar(actor, key, payload('RECIBIR'));
    await service.ejecutar(actor, key, payload('RECIBIR'));
    await service.recuperar(actor, key);
    expect(blockchain.executeBlockchainFlow).toHaveBeenCalledTimes(1);
    expect(blockchain.executeBlockchainFlow).toHaveBeenCalledWith('100');
  });
  it('fallo externo conserva el comando y la recepción confirmados', async () => {
    const r = receipt('RECIBIR');
    rpc.mockResolvedValue({ data: r, error: null });
    blockchain.executeBlockchainFlow.mockRejectedValue(
      new Error('Servicio externo caído'),
    );
    await expect(
      service.ejecutar(actor, key, payload('RECIBIR')),
    ).resolves.toEqual(r);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('respuesta de DB perdida no fabrica rechazo ni ejecuta anclaje/reintento', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'TIMEOUT' } });
    await expect(
      service.ejecutar(actor, key, payload('RECIBIR')),
    ).rejects.toMatchObject({ status: 503 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(blockchain.executeBlockchainFlow).not.toHaveBeenCalled();
  });
  it('un rechazo de negocio conserva su recibo sin intentar anclaje', async () => {
    const r = {
      http_status: 409,
      ejecucion_nueva: true,
      body: {
        comando_id: key,
        estado: 'RECHAZADO',
        resultado: null,
        error: { codigo: 'MATERIAL_NO_CONFORME' },
        finalizado_en: '2026-11-06T12:00:00Z',
      },
    };
    rpc.mockResolvedValue({ data: r, error: null });
    await expect(
      service.ejecutar(actor, key, payload('RECIBIR')),
    ).resolves.toEqual(r);
    expect(blockchain.executeBlockchainFlow).not.toHaveBeenCalled();
  });

  it('fija la revisión de carga antes de Storage y la envía al revalidar en SQL', async () => {
    const remove = jest.fn();
    rpc.mockImplementation(async (name: string) =>
      name === 'm1_recepcion_leer'
        ? {
            data: { puede_recibir_validar: true, revision: '9007199254740992' },
            error: null,
          }
        : { data: null, error: { code: 'P0001' } },
    );
    const client = {
      rpc,
      storage: {
        from: () => ({
          upload: async () => ({ data: { id: 'objeto' }, error: null }),
          remove,
        }),
      },
    };
    service = new RecoleccionRecepcionService(
      { getAdminClient: () => client } as unknown as SupabaseService,
      {
        prepareOriginalEvidenceFiles: () => [
          {
            storageExtension: 'jpg',
            originalBuffer: Buffer.from('foto'),
            storageContentType: 'image/jpeg',
            tamanoBytes: 4,
            hashSha256: 'hash',
          },
        ],
      } as unknown as EvidenceFileService,
      blockchain as unknown as RecoleccionBlockchainService,
    );
    await expect(service.evidencias(actor, '100', [{}])).rejects.toMatchObject({
      status: 409,
    });
    expect(rpc).toHaveBeenLastCalledWith(
      'm1_recepcion_evidencias_preparar',
      expect.objectContaining({ p_revision_esperada: '9007199254740992' }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it.each(['TIMEOUT', 'RESPUESTA_INVALIDA', 'ID_INVALIDO'])(
    'una carga incierta conserva recursos (%s)',
    async (fallo) => {
      const remove = jest.fn();
      rpc.mockImplementation(async (name: string) =>
        name === 'm1_recepcion_leer'
          ? {
              data: { puede_recibir_validar: true, revision: '5' },
              error: null,
            }
          : fallo === 'TIMEOUT'
            ? { data: null, error: { code: 'TIMEOUT' } }
            : { data: fallo === 'ID_INVALIDO' ? [1] : [], error: null },
      );
      const client = {
        rpc,
        storage: {
          from: () => ({
            upload: async () => ({ data: { id: 'objeto' }, error: null }),
            remove,
          }),
        },
      };
      service = new RecoleccionRecepcionService(
        { getAdminClient: () => client } as unknown as SupabaseService,
        {
          prepareOriginalEvidenceFiles: () => [
            {
              storageExtension: 'jpg',
              originalBuffer: Buffer.from('foto'),
              storageContentType: 'image/jpeg',
              tamanoBytes: 4,
              hashSha256: 'hash',
            },
          ],
        } as unknown as EvidenceFileService,
        blockchain as unknown as RecoleccionBlockchainService,
      );
      await expect(
        service.evidencias(actor, '100', [{}]),
      ).rejects.toMatchObject({ status: 503 });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('un recibo incoherente conserva incertidumbre', async () => {
    rpc.mockResolvedValue({
      data: { ...receipt('RECIBIR'), ejecucion_nueva: undefined },
      error: null,
    });
    await expect(
      service.ejecutar(actor, key, payload('RECIBIR')),
    ).rejects.toBeInstanceOf(HttpException);
    expect(blockchain.executeBlockchainFlow).not.toHaveBeenCalled();
  });
});
