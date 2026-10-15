import { HttpException } from '@nestjs/common';
import { ParticipacionComandosService } from '../participacion-comandos.service';
import type { SupabaseService } from '../../supabase/supabase.service';
const command = '4ff8f9bb-4280-463d-95c8-97a3f11f122c';
const actor = {
  usuario_id: '9007199254740993',
  auth_id: 'synthetic',
  rol: 'VOLUNTARIO',
};
const payload = {
  usuario_destino_id: '42',
  ambitos: [{ subcampania_id: '11', revision_esperada: '0' }],
};
const receipt = {
  comando_id: command,
  operacion: 'OTORGAR_PLANTADOR',
  estado: 'CONFIRMADO',
  resultado: {
    tipo: 'ACCESO',
    cambios: [
      {
        subcampania_id: '11',
        usuarios: [
          {
            usuario_id: '42',
            permiso_anterior: null,
            permiso_nuevo: 'PLANTADOR',
            revision_anterior: '0',
            revision_nueva: '1',
            cambio: 'CAMBIO_APLICADO',
            conserva_acceso_global: false,
          },
        ],
      },
    ],
  },
  error: null,
  finalizado_en: '2026-10-14T12:00:00Z',
};
describe('Adaptador de comando durable', () => {
  const rpc = jest.fn();
  const publicClient = jest.fn();
  const service = new ParticipacionComandosService({
    getAdminClient: () => ({ rpc }),
    getClient: publicClient,
  } as unknown as SupabaseService);
  beforeEach(() => {
    rpc.mockReset();
    publicClient.mockReset();
  });
  it('usa actor privado sin Number y devuelve recibo completo', async () => {
    rpc.mockResolvedValue({
      data: { http_status: 200, body: receipt },
      error: null,
    });
    expect(
      (await service.acceso(actor, 'OTORGAR_PLANTADOR', command, payload)).body,
    ).toEqual(receipt);
    const args = rpc.mock.calls[0] as unknown as [
      string,
      { p_actor_id: string; p_payload: unknown },
    ];
    expect(args[1].p_actor_id).toBe('9007199254740993');
    expect(args[1].p_payload).toEqual(payload);
    expect(publicClient).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { code: '55P03', message: 'sensitive SQL' } },
    {
      data: {
        http_status: 200,
        body: { ...receipt, correo: 'private@example.test' },
      },
      error: null,
    },
    {
      data: {
        http_status: 200,
        body: { ...receipt, resultado: { tipo: 'ACCESO' } },
      },
      error: null,
    },
    {
      data: {
        http_status: 200,
        body: { ...receipt, operacion: 'INACTIVAR_CUENTA' },
      },
      error: null,
    },
  ])('error SQL o recibo inválido conserva incertidumbre', async (result) => {
    rpc.mockResolvedValue(result);
    try {
      await service.acceso(actor, 'OTORGAR_PLANTADOR', command, payload);
      throw new Error('No rechazó.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse();
      expect(response).toMatchObject({
        comando_id: command,
        resultado_concluyente: false,
        error: { codigo: 'RESULTADO_NO_DETERMINADO', reintento: 'MISMA_CLAVE' },
      });
      expect(JSON.stringify(response)).not.toContain('sensitive SQL');
    }
  });
  it('red caída y falta de clave privada tampoco fabrican rechazo', async () => {
    rpc.mockRejectedValue(new Error('network'));
    await expect(
      service.acceso(actor, 'OTORGAR_PLANTADOR', command, payload),
    ).rejects.toBeInstanceOf(HttpException);
    const unavailable = new ParticipacionComandosService({
      getAdminClient: () => {
        throw new Error('missing service key');
      },
      getClient: publicClient,
    } as unknown as SupabaseService);
    await expect(
      unavailable.acceso(actor, 'OTORGAR_PLANTADOR', command, payload),
    ).rejects.toBeInstanceOf(HttpException);
    expect(publicClient).not.toHaveBeenCalled();
  });
  it('GET terminal rechazado usa 200 y PREPARADO usa 202', async () => {
    const error = {
      codigo: 'REVISION_OBSOLETA',
      mensaje: 'Revisión obsoleta.',
      campos: [],
      ambitos: [],
      reintento: 'NUEVA_CONFIRMACION',
    };
    rpc.mockResolvedValueOnce({
      data: {
        http_status: 200,
        body: { ...receipt, estado: 'RECHAZADO', resultado: null, error },
      },
      error: null,
    });
    expect(
      (await service.recuperar(actor, 'OTORGAR_PLANTADOR', command))
        .http_status,
    ).toBe(200);
    rpc.mockResolvedValueOnce({
      data: {
        http_status: 202,
        body: {
          comando_id: command,
          operacion: 'REGISTRAR_PLANTACION_INICIAL',
          estado: 'SIN_RESULTADO',
          resultado: null,
          error: null,
          finalizado_en: null,
        },
      },
      error: null,
    });
    expect(
      (await service.recuperar(actor, 'REGISTRAR_PLANTACION_INICIAL', command))
        .http_status,
    ).toBe(202);
  });
});
