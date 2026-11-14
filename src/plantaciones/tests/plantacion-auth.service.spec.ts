import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { PlantacionAuthService } from '../application/plantacion-auth.service';

function createSupabase(result: { data: any; error: any }): SupabaseService {
  const single = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    getAdminClient: jest.fn().mockReturnValue({ from }),
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

describe('PlantacionAuthService', () => {
  it('resuelve usuario por auth_id', async () => {
    const supabase = createSupabase({
      data: { id: '7', nombre: 'Andy', rol: 'GENERAL', activo: true },
      error: null,
    });
    const service = new PlantacionAuthService(supabase);

    await expect(service.getUserByAuthId('auth-7')).resolves.toEqual({
      id: 7,
      nombre: 'Andy',
      rol: 'GENERAL',
      activo: true,
    });
  });

  it('lanza NotFoundException si no existe', async () => {
    const supabase = createSupabase({ data: null, error: null });
    const service = new PlantacionAuthService(supabase);

    await expect(service.getUserByAuthId('ghost')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza NotFoundException si hay error de Supabase', async () => {
    const supabase = createSupabase({ data: null, error: { message: 'boom' } });
    const service = new PlantacionAuthService(supabase);

    await expect(service.getUserByAuthId('x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('conserva la identidad BIGINT exacta de una cuenta activa', async () => {
    const service = new PlantacionAuthService(
      createSupabase({
        data: {
          id: '9007199255741001',
          nombre: 'Actor sintético',
          rol: 'GENERAL',
          activo: true,
        },
        error: null,
      }),
    );
    expect((await service.getUserByAuthId('auth-fixture')).id).toBe(
      '9007199255741001',
    );
  });

  it('rechaza una identidad que el transporte haya redondeado', async () => {
    const service = new PlantacionAuthService(
      createSupabase({
        data: { id: 9007199255741000, rol: 'GENERAL', activo: true },
        error: null,
      }),
    );
    await expect(service.getUserByAuthId('auth-fixture')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('no presta autoridad a una cuenta inactiva aunque conserve rol interno', async () => {
    const service = new PlantacionAuthService(
      createSupabase({
        data: { id: '7', rol: 'ADMIN', activo: false },
        error: null,
      }),
    );
    await expect(service.getUserByAuthId('auth-fixture')).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('assertCanWrite', () => {
    const service = new PlantacionAuthService({} as any);

    it.each(['ADMIN', 'VALIDADOR', 'GENERAL', 'general', 'admin'])(
      'permite rol %s',
      (rol) => {
        expect(() => service.assertCanWrite(rol)).not.toThrow();
      },
    );

    it.each(['VOLUNTARIO', '', undefined, null, 'OTRO'])(
      'rechaza rol %s',
      (rol) => {
        expect(() => service.assertCanWrite(rol as any)).toThrow(
          ForbiddenException,
        );
      },
    );
  });
});
