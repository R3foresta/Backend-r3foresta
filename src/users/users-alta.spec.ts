import { SupabaseService } from '../supabase/supabase.service';
import { PerfilV1Service } from './perfil-v1.service';
import { UsersService } from './users.service';

describe('alta WebAuthn de mínimo privilegio', () => {
  it('inserta VOLUNTARIO explícito y conserva el nombre inicial', async () => {
    const inserted: Record<string, unknown>[] = [];
    const client = {
      rpc: () =>
        Promise.resolve({
          data: { usuario_id: '9007199254740993' },
          error: null,
        }),
      from: (table: string) => {
        if (table === 'usuario_credencial')
          return {
            insert: (row: Record<string, unknown>) => {
              inserted.push(row);
              return Promise.resolve({ error: null });
            },
          };
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { ...row, id: 7, created_at: '2026-10-13T00:00:00Z' },
                    error: null,
                  }),
              }),
            };
          },
        };
      },
    };
    const supabase = {
      getAdminClient: () => client,
      getClient: () => {
        throw new Error('No debe usar cliente de privilegio desconocido');
      },
    } as unknown as SupabaseService;
    const service = new UsersService(supabase, {} as PerfilV1Service);
    const user = await service.createUser({
      username: 'Ana',
      credential: {
        credentialId: 'credential',
        publicKey: 'key',
        algorithm: 'ES256',
        counter: 0,
        transports: [],
        createdAt: new Date(),
      },
    });
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        username: 'Ana',
        nombre: 'Ana',
        rol: 'VOLUNTARIO',
      }),
    );
    expect(inserted[0]).not.toHaveProperty('activo', false);
    expect(inserted[0]).not.toHaveProperty('permisos');
    expect(user.id).toBe(inserted[0].auth_id);
    expect(inserted[1]).toEqual(
      expect.objectContaining({
        usuario_id: '9007199254740993',
        credential_id: 'credential',
      }),
    );
  });
});
