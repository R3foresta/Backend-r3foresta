import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CerrarSubcampaniaDto,
  EstadoFinalSubcampania,
} from '../api/dto/cerrar-subcampania.dto';
import { MotivoCierreParcial } from '../domain/enums/motivo-cierre-parcial.enum';
import { SubcampaniasCierreService } from '../application/subcampanias-cierre.service';
import { lifecycleFixture } from './subcampanias-lifecycle.test-utils';

const dto: CerrarSubcampaniaDto = {
  estado_final: EstadoFinalSubcampania.COMPLETADA,
  fecha_cierre_operativo: '2026-12-01T00:00:00Z',
  fecha_fin_mantenimiento: '2029-12-01',
};
describe('SubcampaniasCierreService', () => {
  it.each([
    EstadoFinalSubcampania.COMPLETADA,
    EstadoFinalSubcampania.FINALIZADA_PARCIAL,
  ])('conserva %s y la fase que confirma la transacción', async (estado) => {
    const datos = {
      ...dto,
      estado_final: estado,
      motivo_cierre_parcial: MotivoCierreParcial.FALTA_STOCK,
    };
    const f = lifecycleFixture({
      id: 1,
      estado,
      fase_mantenimiento: 'MANTENIMIENTO_ACTIVO',
    });
    const result = await new SubcampaniasCierreService(
      f.supabase,
      f.auth,
    ).cerrar(1, datos, 'admin');
    expect(result.data).toMatchObject({
      estado,
      fase_mantenimiento: 'MANTENIMIENTO_ACTIVO',
    });
    expect(f.rpc).toHaveBeenCalledWith('pa_d_subcampania_cerrar', {
      p_id: 1,
      p_actor_id: 99,
      p_datos: datos,
    });
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rechaza cierre parcial sin motivo antes de mutar', async () => {
    const f = lifecycleFixture({});
    await expect(
      new SubcampaniasCierreService(f.supabase, f.auth).cerrar(
        1,
        { ...dto, estado_final: EstadoFinalSubcampania.FINALIZADA_PARCIAL },
        'admin',
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['P0002', NotFoundException],
    ['P0001', UnprocessableEntityException],
    ['42501', ForbiddenException],
  ])('mapea rechazo %s de la revalidación DB', async (code, errorType) => {
    const f = lifecycleFixture(null, { code, message: 'Rechazo DB' });
    await expect(
      new SubcampaniasCierreService(f.supabase, f.auth).cerrar(1, dto, 'admin'),
    ).rejects.toThrow(errorType);
  });
});
