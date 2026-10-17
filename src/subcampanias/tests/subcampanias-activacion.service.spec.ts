import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SubcampaniasActivacionService } from '../application/subcampanias-activacion.service';
import { lifecycleFixture } from './subcampanias-lifecycle.test-utils';

describe('SubcampaniasActivacionService', () => {
  it('devuelve los snapshots y composición transaccionales sin escrituras separadas', async () => {
    const row = {
      id: 1,
      estado: 'ACTIVA',
      composicion_asignada: [],
      nombre_coordinador_snapshot: 'Coordinador',
      nombres_organizaciones_snapshot: ['Org A'],
    };
    const f = lifecycleFixture(row);
    const result = await new SubcampaniasActivacionService(
      f.supabase,
      f.auth,
    ).activar(1, 'admin');
    expect(result.data).toMatchObject(row);
    expect(f.rpc).toHaveBeenCalledWith('pa_d_subcampania_activar', {
      p_id: 1,
      p_actor_id: 99,
    });
    expect(f.from).not.toHaveBeenCalled();
  });

  it.each([
    ['P0002', NotFoundException],
    ['P0001', UnprocessableEntityException],
    ['42501', ForbiddenException],
    ['PT403', ForbiddenException],
    ['PT404', NotFoundException],
    ['PT409', ConflictException],
    ['PT422', UnprocessableEntityException],
    ['PGRST202', InternalServerErrorException],
  ])(
    'propaga %s sin dar por confirmada la activación',
    async (code, errorType) => {
      const f = lifecycleFixture(null, { code, message: 'Rechazo DB' });
      await expect(
        new SubcampaniasActivacionService(f.supabase, f.auth).activar(
          1,
          'admin',
        ),
      ).rejects.toThrow(errorType);
    },
  );

  it.each(['55P03', '57014', '40P01', '40001'])(
    '%s devuelve 503 inconcluso sin confirmar activación ni recibo durable',
    async (code) => {
      const f = lifecycleFixture(null, { code, message: 'Aborto técnico DB' });
      let thrown: unknown;
      try {
        await new SubcampaniasActivacionService(f.supabase, f.auth).activar(
          1,
          'admin',
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ServiceUnavailableException);
      const failure = thrown as ServiceUnavailableException;
      expect(failure.getStatus()).toBe(503);
      // La respuesta completa no fabrica éxito, estado ACTIVA ni recibo terminal.
      expect(failure.getResponse()).toEqual({
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          mensaje: expect.any(String),
          resultado_concluyente: false,
        },
      });
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.from).not.toHaveBeenCalled();
    },
  );

  it('requiere ADMIN también antes de invocar la RPC', async () => {
    const f = lifecycleFixture({}, null, 'GENERAL');
    await expect(
      new SubcampaniasActivacionService(f.supabase, f.auth).activar(
        1,
        'general',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
