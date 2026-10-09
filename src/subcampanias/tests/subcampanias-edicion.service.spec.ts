import { UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasEdicionService } from '../application/subcampanias-edicion.service';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { EdicionPorEstadoPolicy } from '../domain/policies/edicion-por-estado.policy';

describe('revisiones de meta por PATCH', () => {
  it('rechaza meta incluso combinada con otros datos antes de acceder a la base', async () => {
    const getClient = jest.fn();
    const service = new SubcampaniasEdicionService(
      { getClient } as unknown as SupabaseService,
      {
        getUserByAuthId: jest.fn().mockResolvedValue({ id: 1, rol: 'ADMIN' }),
        assertAdmin: jest.fn(),
      } as unknown as SubcampaniasAuthService,
    );
    await expect(
      service.editar(
        1,
        { meta_total_arboles: 600, descripcion: 'Revisión' },
        'admin',
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each(Object.values(EstadoSubcampania))(
    'la política excluye meta en %s',
    (estado) => {
      expect(
        EdicionPorEstadoPolicy.getCamposPermitidos(estado).has(
          'meta_total_arboles',
        ),
      ).toBe(false);
    },
  );
});
