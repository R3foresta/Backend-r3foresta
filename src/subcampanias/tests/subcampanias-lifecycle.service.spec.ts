import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SubcampaniasEdicionService } from '../application/subcampanias-edicion.service';
import { SubcampaniasPoligonoService } from '../application/subcampanias-poligono.service';
import { lifecycleFixture } from './subcampanias-lifecycle.test-utils';

describe('edición, borrado y polígono transaccionales', () => {
  it('envía solo campos presentes a la política de edición bajo lock', async () => {
    const f = lifecycleFixture({ id: 1, descripcion: 'Nueva' });
    const result = await new SubcampaniasEdicionService(
      f.supabase,
      f.auth,
    ).editar(1, { descripcion: 'Nueva', nombre: undefined }, 'admin');
    expect(result.data.descripcion).toBe('Nueva');
    expect(f.rpc).toHaveBeenCalledWith('pa_d_subcampania_editar', {
      p_id: 1,
      p_actor_id: 99,
      p_datos: { descripcion: 'Nueva' },
    });
    expect(f.from).not.toHaveBeenCalled();
  });
  it('borrado usa la comprobación de BORRADOR dentro de la RPC', async () => {
    const f = lifecycleFixture(null, {
      code: 'P0001',
      message: 'Solo BORRADOR',
    });
    await expect(
      new SubcampaniasEdicionService(f.supabase, f.auth).borrar(1, 'admin'),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('polígono conserva firma y retorno pero propaga autoridad DB rechazada', async () => {
    const f = lifecycleFixture(null, {
      code: '42501',
      message: 'Actor inactivo',
    });
    await expect(
      new SubcampaniasPoligonoService(f.supabase, f.auth).setear(
        1,
        {
          poligono: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
        'admin',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.rpc).toHaveBeenCalledWith(
      'fn_subcampania_setear_poligono',
      expect.objectContaining({ p_id: 1, p_updated_by: 99 }),
    );
  });
});
