import { ConflictException } from '@nestjs/common';
import { SubcampaniasPlantacionContextService } from '../application/subcampanias-plantacion-context.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';

describe('SubcampaniasPlantacionContextService (corte INT02-D)', () => {
  it('rechaza el alias inicial antes de consultar identidad, stock o equipo', async () => {
    const getAdminClient = jest.fn();
    const getUserByAuthId = jest.fn();
    const service = new SubcampaniasPlantacionContextService(
      { getAdminClient } as unknown as SupabaseService,
      { getUserByAuthId } as unknown as SubcampaniasAuthService,
    );
    const error = await service.obtener(10, 'actor').catch((error) => error);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      error: { codigo: 'CLIENTE_INCOMPATIBLE' },
    });
    expect(getAdminClient).not.toHaveBeenCalled();
    expect(getUserByAuthId).not.toHaveBeenCalled();
  });
});
