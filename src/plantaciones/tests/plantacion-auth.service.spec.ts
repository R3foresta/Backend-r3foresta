import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { PlantacionAuthService } from '../application/plantacion-auth.service';

function createSupabase(result: { data: any; error: any }): SupabaseService {
  const single = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

describe('PlantacionAuthService', () => {
  it('resuelve usuario por auth_id', async () => {
    const supabase = createSupabase({
      data: { id: 7, nombre: 'Andy', rol: 'GENERAL' },
      error: null,
    });
    const service = new PlantacionAuthService(supabase);

    await expect(service.getUserByAuthId('auth-7')).resolves.toEqual({
      id: 7,
      nombre: 'Andy',
      rol: 'GENERAL',
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
