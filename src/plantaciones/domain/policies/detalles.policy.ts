import { identificadorExacto } from './identificador.policy';

export type DetallePlantacionInput = {
  asignacion_id: number | string;
  lote_vivero_id: number | string;
  planta_id: number | string;
  cantidad: number;
};

export class DetallesPlantacionPolicyError extends Error {}

export class DetallesPlantacionPolicy {
  static assertValidos(detalles: DetallePlantacionInput[]): void {
    if (!Array.isArray(detalles) || detalles.length === 0) {
      throw new DetallesPlantacionPolicyError(
        'Debe enviarse al menos un detalle.',
      );
    }

    for (const [i, d] of detalles.entries()) {
      if (
        !d ||
        identificadorExacto(d.asignacion_id) === null ||
        identificadorExacto(d.lote_vivero_id) === null ||
        identificadorExacto(d.planta_id) === null ||
        !Number.isSafeInteger(d.cantidad) ||
        d.cantidad > 2147483647
      ) {
        throw new DetallesPlantacionPolicyError(
          `Detalle ${i}: los IDs deben ser BIGINT exactos y cantidad un entero seguro hasta 2147483647.`,
        );
      }

      if (d.cantidad <= 0) {
        throw new DetallesPlantacionPolicyError(
          `Detalle ${i}: cantidad debe ser mayor a cero.`,
        );
      }
    }

    if (
      !Number.isSafeInteger(this.cantidadTotal(detalles)) ||
      this.cantidadTotal(detalles) > 2147483647
    ) {
      throw new DetallesPlantacionPolicyError(
        'La cantidad total excede 2147483647.',
      );
    }

    const claves = new Set<string>();
    for (const d of detalles) {
      const clave = `${d.asignacion_id}:${d.planta_id}`;
      if (claves.has(clave)) {
        throw new DetallesPlantacionPolicyError(
          `Detalles duplicados: combinar cantidades para (asignacion_id=${d.asignacion_id}, planta_id=${d.planta_id}) en una sola entrada.`,
        );
      }
      claves.add(clave);
    }
  }

  static cantidadTotal(detalles: DetallePlantacionInput[]): number {
    return detalles.reduce((sum, d) => sum + d.cantidad, 0);
  }
}
