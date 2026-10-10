import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';

function createSupabase(result: { data: any; error: any }): SupabaseService {
  const single = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

describe('SubcampaniasAuthService', () => {
  it('resuelve usuario por auth_id', async () => {
    const supabase = createSupabase({
      data: { id: 5, nombre: 'Admin', rol: 'ADMIN' },
      error: null,
    });
    const service = new SubcampaniasAuthService(supabase);

    await expect(service.getUserByAuthId('auth-1')).resolves.toEqual({
      id: 5,
      nombre: 'Admin',
      rol: 'ADMIN',
    });
  });

  it('lanza NotFoundException si no existe', async () => {
    const supabase = createSupabase({ data: null, error: null });
    const service = new SubcampaniasAuthService(supabase);

    await expect(service.getUserByAuthId('ghost')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('distingue un fallo de Supabase de un usuario inexistente', async () => {
    const supabase = createSupabase({ data: null, error: { message: 'boom' } });
    const service = new SubcampaniasAuthService(supabase);

    await expect(service.getUserByAuthId('x')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('rechaza una sesión cuyo usuario ya no existe', async () => {
    const service = new SubcampaniasAuthService(
      createSupabase({ data: null, error: null }),
    );
    await expect(service.getAuthenticatedUser('ghost')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un auth_id vacío sin consultar la base', async () => {
    const supabase = createSupabase({ data: null, error: null });
    const service = new SubcampaniasAuthService(supabase);
    await expect(service.getAuthenticatedUser('  ')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it('mantiene 500 al fallar la verificación de una sesión por un error de base de datos', async () => {
    const service = new SubcampaniasAuthService(
      createSupabase({ data: null, error: { code: 'XX000' } }),
    );
    await expect(service.getAuthenticatedUser('auth-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('permite una sesión válida de un usuario GENERAL', async () => {
    const usuario = { id: 5, nombre: 'General', rol: 'GENERAL' };
    const service = new SubcampaniasAuthService(
      createSupabase({ data: usuario, error: null }),
    );
    await expect(service.getAuthenticatedUser('auth-1')).resolves.toEqual(
      usuario,
    );
  });

  describe('assertAdmin', () => {
    const service = new SubcampaniasAuthService({} as any);

    it.each(['ADMIN', 'admin', 'Admin'])('permite rol %s', (rol) => {
      expect(() => service.assertAdmin(rol)).not.toThrow();
    });

    it.each([
      'VALIDADOR',
      'GENERAL',
      'VOLUNTARIO',
      '',
      undefined,
      null,
      'OTRO',
    ])('rechaza rol %s', (rol) => {
      expect(() => service.assertAdmin(rol as any)).toThrow(ForbiddenException);
    });
  });
});
