import {
  CoresponsablesPolicy,
  CoresponsablesPolicyError,
} from '../domain/policies/coresponsables.policy';
import {
  DetallesPlantacionPolicy,
  DetallesPlantacionPolicyError,
} from '../domain/policies/detalles.policy';
import {
  ReposicionPolicy,
  ReposicionPolicyError,
} from '../domain/policies/reposicion.policy';

describe('DetallesPlantacionPolicy', () => {
  it('acepta un detalle valido', () => {
    expect(() =>
      DetallesPlantacionPolicy.assertValidos([
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 5 },
      ]),
    ).not.toThrow();
  });

  it('rechaza array vacio', () => {
    expect(() => DetallesPlantacionPolicy.assertValidos([])).toThrow(
      DetallesPlantacionPolicyError,
    );
  });

  it('rechaza cantidad no positiva', () => {
    expect(() =>
      DetallesPlantacionPolicy.assertValidos([
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 0 },
      ]),
    ).toThrow(DetallesPlantacionPolicyError);
  });

  it('rechaza ids no enteros', () => {
    expect(() =>
      DetallesPlantacionPolicy.assertValidos([
        {
          asignacion_id: 1.5,
          lote_vivero_id: 2,
          planta_id: 3,
          cantidad: 5,
        } as any,
      ]),
    ).toThrow(DetallesPlantacionPolicyError);
  });

  it('rechaza duplicados (asignacion+planta)', () => {
    expect(() =>
      DetallesPlantacionPolicy.assertValidos([
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 5 },
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 7 },
      ]),
    ).toThrow(DetallesPlantacionPolicyError);
  });

  it('admite misma asignacion con distinta planta', () => {
    expect(() =>
      DetallesPlantacionPolicy.assertValidos([
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 5 },
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 4, cantidad: 7 },
      ]),
    ).not.toThrow();
  });

  it('cantidadTotal suma cantidades', () => {
    expect(
      DetallesPlantacionPolicy.cantidadTotal([
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 5 },
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 4, cantidad: 7 },
      ]),
    ).toBe(12);
  });
});

describe('CoresponsablesPolicy', () => {
  it('devuelve array vacio cuando entrada es undefined', () => {
    expect(CoresponsablesPolicy.normalizar(undefined, 99)).toEqual([]);
  });

  it('deduplica e ignora al responsable', () => {
    expect(CoresponsablesPolicy.normalizar([3, 1, 99, 1, 2, 99], 99)).toEqual([
      1, 2, 3,
    ]);
  });

  it('rechaza id no entero', () => {
    expect(() => CoresponsablesPolicy.normalizar([1, 2.5] as any, 99)).toThrow(
      CoresponsablesPolicyError,
    );
  });

  it('rechaza id <= 0', () => {
    expect(() => CoresponsablesPolicy.normalizar([0], 99)).toThrow(
      CoresponsablesPolicyError,
    );
  });
});

describe('ReposicionPolicy', () => {
  it('acepta inicial sin origen', () => {
    expect(() => ReposicionPolicy.assertCoherencia(false, null)).not.toThrow();
    expect(() =>
      ReposicionPolicy.assertCoherencia(false, undefined),
    ).not.toThrow();
  });

  it('rechaza inicial con origen', () => {
    expect(() => ReposicionPolicy.assertCoherencia(false, 7)).toThrow(
      ReposicionPolicyError,
    );
  });

  it('rechaza reposicion sin origen', () => {
    expect(() => ReposicionPolicy.assertCoherencia(true, null)).toThrow(
      ReposicionPolicyError,
    );
  });

  it('acepta reposicion con origen valido', () => {
    expect(() => ReposicionPolicy.assertCoherencia(true, 42)).not.toThrow();
  });

  it('rechaza origen no entero positivo', () => {
    expect(() => ReposicionPolicy.assertCoherencia(true, -1)).toThrow(
      ReposicionPolicyError,
    );
    expect(() => ReposicionPolicy.assertCoherencia(true, 1.5)).toThrow(
      ReposicionPolicyError,
    );
  });
});
