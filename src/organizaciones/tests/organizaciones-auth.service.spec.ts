import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { OrganizacionesAuthService } from '../organizaciones-auth.service';

function createSupabase(result: { data: any; error: any }): SupabaseService {
  const single = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

describe('OrganizacionesAuthService', () => {
  it('resuelve usuario por auth_id', async () => {
    const supabase = createSupabase({
      data: { id: 7, nombre: 'Admin', rol: 'ADMIN' },
      error: null,
    });
    const service = new OrganizacionesAuthService(supabase);

    await expect(service.getUserByAuthId('auth-1')).resolves.toEqual({
      id: 7,
      nombre: 'Admin',
      rol: 'ADMIN',
    });
  });

  it('lanza NotFoundException si no existe', async () => {
    const supabase = createSupabase({ data: null, error: null });
    const service = new OrganizacionesAuthService(supabase);

    await expect(service.getUserByAuthId('ghost')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza NotFoundException si hay error de Supabase', async () => {
    const supabase = createSupabase({
      data: null,
      error: { message: 'boom' },
    });
    const service = new OrganizacionesAuthService(supabase);

    await expect(service.getUserByAuthId('x')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('assertAdmin', () => {
    const service = new OrganizacionesAuthService({} as any);

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
