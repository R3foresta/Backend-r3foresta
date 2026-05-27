import {
  FechasCampaniaPolicy,
  FechasCampaniaPolicyError,
} from '../domain/policies/fechas-campania.policy';
import {
  InmutabilidadTipoPolicy,
  InmutabilidadTipoPolicyError,
} from '../domain/policies/inmutabilidad-tipo.policy';
import {
  TipoCampaniaPolicy,
  TipoCampaniaPolicyError,
} from '../domain/policies/tipo-campania.policy';
import { TipoCampania } from '../domain/enums/tipo-campania.enum';

describe('TipoCampaniaPolicy', () => {
  it.each(Object.values(TipoCampania))('acepta tipo valido: %s', (tipo) => {
    expect(() => TipoCampaniaPolicy.assertValido(tipo)).not.toThrow();
  });

  it.each(['OTRO', '', 'reforestacion', 'ARBOL'])(
    'rechaza tipo invalido: %s',
    (tipo) => {
      expect(() => TipoCampaniaPolicy.assertValido(tipo)).toThrow(
        TipoCampaniaPolicyError,
      );
    },
  );
});

describe('FechasCampaniaPolicy', () => {
  it('acepta cuando ambas fechas son undefined', () => {
    expect(() =>
      FechasCampaniaPolicy.assertCoherentes(undefined, undefined),
    ).not.toThrow();
  });

  it('acepta cuando solo se provee fecha_inicio', () => {
    expect(() =>
      FechasCampaniaPolicy.assertCoherentes('2026-01-01', undefined),
    ).not.toThrow();
  });

  it('acepta cuando solo se provee fecha_fin', () => {
    expect(() =>
      FechasCampaniaPolicy.assertCoherentes(undefined, '2026-12-31'),
    ).not.toThrow();
  });

  it('acepta fecha_fin >= fecha_inicio', () => {
    expect(() =>
      FechasCampaniaPolicy.assertCoherentes('2026-01-01', '2026-12-31'),
    ).not.toThrow();
  });

  it('acepta fecha_fin == fecha_inicio', () => {
    expect(() =>
      FechasCampaniaPolicy.assertCoherentes('2026-06-01', '2026-06-01'),
    ).not.toThrow();
  });

  it('rechaza fecha_fin < fecha_inicio', () => {
    expect(() =>
      FechasCampaniaPolicy.assertCoherentes('2026-12-01', '2026-06-01'),
    ).toThrow(FechasCampaniaPolicyError);
  });
});

describe('InmutabilidadTipoPolicy', () => {
  it('no hace nada cuando tipoNuevo es undefined', () => {
    expect(() =>
      InmutabilidadTipoPolicy.assertPuedeCambiar(undefined, 'REFORESTACION', 5),
    ).not.toThrow();
  });

  it('no hace nada cuando tipoNuevo es igual al actual', () => {
    expect(() =>
      InmutabilidadTipoPolicy.assertPuedeCambiar(
        'REFORESTACION',
        'REFORESTACION',
        5,
      ),
    ).not.toThrow();
  });

  it('permite cambiar tipo si no hay subcampanias', () => {
    expect(() =>
      InmutabilidadTipoPolicy.assertPuedeCambiar(
        'ARBORIZACION',
        'REFORESTACION',
        0,
      ),
    ).not.toThrow();
  });

  it('lanza error si intenta cambiar tipo con subcampanias existentes', () => {
    expect(() =>
      InmutabilidadTipoPolicy.assertPuedeCambiar(
        'ARBORIZACION',
        'REFORESTACION',
        1,
      ),
    ).toThrow(InmutabilidadTipoPolicyError);
  });

  it('lanza error con cualquier cantidad positiva de subcampanias', () => {
    expect(() =>
      InmutabilidadTipoPolicy.assertPuedeCambiar(
        'FORESTACION',
        'REFORESTACION',
        10,
      ),
    ).toThrow(InmutabilidadTipoPolicyError);
  });
});
