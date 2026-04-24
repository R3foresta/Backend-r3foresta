import { BadRequestException } from '@nestjs/common';

export const TIPOS_MATERIAL_RECOLECCION_INPUT = [
  'SEMILLA',
  'ESQUEJE',
] as const;

export type TipoMaterialRecoleccionInput =
  (typeof TIPOS_MATERIAL_RECOLECCION_INPUT)[number];

export const TIPOS_MATERIAL_RECOLECCION_CANONICO = [
  'SEMILLA',
  'ESQUEJE',
] as const;

export type TipoMaterialRecoleccionCanonico =
  (typeof TIPOS_MATERIAL_RECOLECCION_CANONICO)[number];

export const UNIDADES_CANONICAS_RECOLECCION = ['G', 'UNIDAD'] as const;

export type UnidadCanonicaRecoleccion =
  (typeof UNIDADES_CANONICAS_RECOLECCION)[number];

export const UNIDADES_INPUT_RECOLECCION = ['KG', 'G', 'UNIDAD'] as const;

export type UnidadInputRecoleccion =
  (typeof UNIDADES_INPUT_RECOLECCION)[number];

export type CantidadUnidadCanonica = {
  unidad_canonica: UnidadCanonicaRecoleccion;
  cantidad_canonica: number;
};

export class CantidadUnidadPolicy {
  static normalizarTipoMaterial(
    tipoMaterial: unknown,
  ): TipoMaterialRecoleccionCanonico {
    const tipoNormalizado = String(tipoMaterial ?? '').trim().toUpperCase();

    if (tipoNormalizado === 'SEMILLA' || tipoNormalizado === 'ESQUEJE') {
      return tipoNormalizado;
    }

    throw new BadRequestException(
      'tipo_material no soportado. Usa SEMILLA o ESQUEJE.',
    );
  }

  static normalizarUnidadInput(unidadCanonica: unknown): UnidadInputRecoleccion {
    const normalized = String(unidadCanonica ?? '').trim().toUpperCase();

    if (normalized === 'KG' || normalized === 'G' || normalized === 'UNIDAD') {
      return normalized;
    }

    throw new BadRequestException('unidad_canonica debe ser KG, G o UNIDAD');
  }

  static normalizarYValidar(
    cantidad: number,
    unidadInput: unknown,
    tipoMaterial: unknown,
  ): CantidadUnidadCanonica {
    const tipoMaterialCanonico = this.normalizarTipoMaterial(tipoMaterial);
    const unidadNormalizada = this.normalizarUnidadInput(unidadInput);
    const cantidadEnUnidadCanonica =
      unidadNormalizada === 'KG' ? Number(cantidad) * 1000 : Number(cantidad);

    return this.validarCanonica(
      cantidadEnUnidadCanonica,
      unidadNormalizada === 'KG' ? 'G' : unidadNormalizada,
      tipoMaterialCanonico,
    );
  }

  static validarCanonica(
    cantidad: number,
    unidadCanonica: UnidadCanonicaRecoleccion,
    tipoMaterial: unknown,
  ): CantidadUnidadCanonica {
    const tipoMaterialCanonico = this.normalizarTipoMaterial(tipoMaterial);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new BadRequestException(
        'cantidad_inicial_canonica debe ser un número mayor a 0',
      );
    }

    if (tipoMaterialCanonico === 'ESQUEJE' && unidadCanonica !== 'UNIDAD') {
      throw new BadRequestException(
        'Para tipo_material ESQUEJE la unidad_canonica debe ser UNIDAD.',
      );
    }

    const cantidadCanonica = Number(cantidad.toFixed(6));

    if (unidadCanonica === 'UNIDAD' && !Number.isInteger(cantidadCanonica)) {
      throw new BadRequestException(
        'Para unidad_canonica=UNIDAD la cantidad_inicial_canonica debe ser entera.',
      );
    }

    if (cantidadCanonica <= 0) {
      throw new BadRequestException(
        'La cantidad canónica resultante debe ser mayor a 0',
      );
    }

    return {
      unidad_canonica: unidadCanonica,
      cantidad_canonica: cantidadCanonica,
    };
  }
}
