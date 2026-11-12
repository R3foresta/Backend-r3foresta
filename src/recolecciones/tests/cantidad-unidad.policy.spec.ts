import { BadRequestException } from '@nestjs/common';
import { CantidadUnidadPolicy } from '../domain/policies/cantidad-unidad.policy';

describe('CantidadUnidadPolicy', () => {
  it('normaliza kg a gramos y nunca persiste KG', () => {
    expect(
      CantidadUnidadPolicy.normalizarYValidar(2.5, 'kg', 'SEMILLA'),
    ).toEqual({
      unidad_canonica: 'G',
      cantidad_canonica: 2500,
    });
  });

  it('acepta gramos como unidad canonica de peso', () => {
    expect(
      CantidadUnidadPolicy.normalizarYValidar(125.75, 'g', 'SEMILLA'),
    ).toEqual({
      unidad_canonica: 'G',
      cantidad_canonica: 125.75,
    });
  });

  it('acepta conteo entero en UNIDAD', () => {
    expect(
      CantidadUnidadPolicy.normalizarYValidar(12, 'unidad', 'SEMILLA'),
    ).toEqual({
      unidad_canonica: 'UNIDAD',
      cantidad_canonica: 12,
    });
  });

  it('rechaza esqueje por peso', () => {
    expect(() =>
      CantidadUnidadPolicy.normalizarYValidar(10, 'g', 'ESQUEJE'),
    ).toThrow(BadRequestException);
  });

  it('rechaza cantidad decimal cuando la unidad es UNIDAD', () => {
    expect(() =>
      CantidadUnidadPolicy.normalizarYValidar(3.5, 'unidad', 'SEMILLA'),
    ).toThrow(BadRequestException);
  });
});

describe('precisión de la declaración sin redondeo implícito', () => {
  it.each([
    [0.0000001, 'G'],
    [0.0000000001, 'KG'],
    [1.0000001, 'UNIDAD'],
  ])('rechaza %s %s', (cantidad, unidad) => {
    expect(() =>
      CantidadUnidadPolicy.normalizarYValidar(
        cantidad as number,
        unidad,
        'SEMILLA',
      ),
    ).toThrow();
  });
  it('normaliza KG de precisión válida sin artefactos binarios', () => {
    expect(
      CantidadUnidadPolicy.normalizarYValidar(0.000000003, 'KG', 'SEMILLA'),
    ).toEqual({ cantidad_canonica: 0.000003, unidad_canonica: 'G' });
    expect(
      CantidadUnidadPolicy.normalizarYValidar(0.123456789, 'KG', 'SEMILLA'),
    ).toEqual({ cantidad_canonica: 123.456789, unidad_canonica: 'G' });
  });
});
