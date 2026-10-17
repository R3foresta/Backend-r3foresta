import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SubcampaniasEquipoService } from '../application/subcampanias-equipo.service';
import { RolEnSubcampania } from '../domain/enums/rol-en-subcampania.enum';
import { lifecycleFixture } from './subcampanias-lifecycle.test-utils';

const miembro = { usuario_id: 7, rol: RolEnSubcampania.OPERARIO };
describe('SubcampaniasEquipoService', () => {
  it('devuelve los miembros hidratados en el mismo commit que el cambio de equipo', async () => {
    const rows = [
      { id: 1, ...miembro, nombre_usuario: 'Persona', foto_perfil_url: null },
    ];
    const f = lifecycleFixture(rows);
    const result = await new SubcampaniasEquipoService(
      f.supabase,
      f.auth,
    ).agregarMiembros(1, [miembro], 'admin');
    expect(result.data.miembros).toEqual(rows);
    expect(f.rpc).toHaveBeenCalledWith('pa_d_equipo_agregar', {
      p_id: 1,
      p_actor_id: 99,
      p_miembros: [miembro],
    });
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each([
    [[], BadRequestException],
    [[miembro, miembro], UnprocessableEntityException],
    [
      [
        { usuario_id: 7, rol: RolEnSubcampania.COORDINADOR },
        { usuario_id: 8, rol: RolEnSubcampania.COORDINADOR },
      ],
      UnprocessableEntityException,
    ],
  ])('rechaza selección ambigua sin mutar', async (rows, errorType) => {
    const f = lifecycleFixture([]);
    await expect(
      new SubcampaniasEquipoService(f.supabase, f.auth).agregarMiembros(
        1,
        rows,
        'admin',
      ),
    ).rejects.toThrow(errorType);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['P0002', NotFoundException],
    ['P0001', UnprocessableEntityException],
    ['23505', UnprocessableEntityException],
    ['42501', ForbiddenException],
  ])('propaga %s al agregar', async (code, errorType) => {
    const f = lifecycleFixture(null, { code, message: 'Rechazo DB' });
    await expect(
      new SubcampaniasEquipoService(f.supabase, f.auth).agregarMiembros(
        1,
        [miembro],
        'admin',
      ),
    ).rejects.toThrow(errorType);
  });
  it('quita bajo la RPC sin borrar directamente una fila', async () => {
    const f = lifecycleFixture({ message: 'Miembro quitado correctamente.' });
    expect(
      (
        await new SubcampaniasEquipoService(f.supabase, f.auth).quitar(
          1,
          7,
          'admin',
        )
      ).success,
    ).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith('pa_d_equipo_quitar', {
      p_id: 1,
      p_actor_id: 99,
      p_usuario_id: 7,
    });
    expect(f.from).not.toHaveBeenCalled();
  });
  it('conserva el rechazo al retirar coordinador activo bajo lock', async () => {
    const f = lifecycleFixture(null, {
      code: 'P0001',
      message:
        'No se puede quitar al coordinador mientras la subcampaña está activa.',
    });
    await expect(
      new SubcampaniasEquipoService(f.supabase, f.auth).quitar(1, 7, 'admin'),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
