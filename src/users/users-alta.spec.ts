import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PerfilV1Service } from './perfil-v1.service';
import { UsersService } from './users.service';

describe('alta WebAuthn atómica', () => {
  const credential = {
    credentialId: 'credential',
    publicKey: 'key',
    algorithm: 'ES256',
    counter: 0,
    createdAt: new Date('2026-11-16T00:00:00Z'),
  };
  let rpc: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
  let from: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    rpc = jest
      .fn<Promise<unknown>, [string, Record<string, unknown>]>()
      .mockImplementation((_name, args) =>
        Promise.resolve({
          data: {
            usuario_id: '9007199254740993',
            auth_id: args.p_auth_id,
            username: args.p_username,
            correo: args.p_correo,
            created_at: '2026-11-16T00:00:00Z',
          },
          error: null,
        }),
      );
    from = jest.fn(() => {
      throw new Error('El alta debe resolverse en una transacción RPC.');
    });
    service = new UsersService(
      {
        getAdminClient: () => ({ rpc, from }),
        getClient: () => {
          throw new Error('Cliente público inesperado.');
        },
      } as unknown as SupabaseService,
      {} as PerfilV1Service,
    );
  });

  it('usa una RPC privada y conserva auth_id textual, nombre y credencial', async () => {
    const user = await service.createUser({
      username: 'Ana',
      email: 'ana@example.invalid',
      credential,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('pa_usuario_registrar', {
      p_auth_id: user.id,
      p_username: 'Ana',
      p_correo: 'ana@example.invalid',
      p_credential_id: 'credential',
      p_public_key: 'key',
      p_algorithm: 'ES256',
      p_counter: 0,
      p_transports: [],
    });
    expect(user).toEqual({
      id: expect.stringMatching(/^user_/) as string,
      username: 'Ana',
      email: 'ana@example.invalid',
      credentials: [credential],
      createdAt: new Date('2026-11-16T00:00:00Z'),
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('representa correo opcional como NULL y conserva transports recibidos', async () => {
    await service.createUser({
      username: 'Ana',
      credential: { ...credential, transports: ['internal', 'hybrid'] },
    });
    expect(rpc.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        p_correo: null,
        p_transports: ['internal', 'hybrid'],
      }),
    );
  });

  it.each([
    ['USUARIO_YA_EXISTE', 'El usuario ya existe'],
    ['DATOS_ALTA_EN_USO', 'Los datos de registro ya están en uso.'],
  ])('traduce el conflicto %s sin exponer filas', async (message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message } });
    await expect(
      service.createUser({ username: 'Ana', credential }),
    ).rejects.toThrow(new ConflictException(expected));
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { code: '23514', message: 'Detalle SQL privado' } },
    { data: null, error: null },
  ])('propaga fallo sin escrituras de compensación', async (failure) => {
    rpc.mockResolvedValue(failure);
    await expect(
      service.createUser({ username: 'Ana', credential }),
    ).rejects.toThrow(
      new InternalServerErrorException('No se pudo completar el registro.'),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('una respuesta de red fallida no dispara un borrado ni reintento automático', async () => {
    rpc.mockRejectedValue(new Error('Conexión interrumpida'));
    await expect(
      service.createUser({ username: 'Ana', credential }),
    ).rejects.toThrow('Conexión interrumpida');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
});
