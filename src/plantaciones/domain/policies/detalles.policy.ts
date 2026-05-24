export type DetallePlantacionInput = {
  asignacion_id: number;
  lote_vivero_id: number;
  planta_id: number;
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
        !Number.isInteger(d.asignacion_id) ||
        !Number.isInteger(d.lote_vivero_id) ||
        !Number.isInteger(d.planta_id) ||
        !Number.isInteger(d.cantidad)
      ) {
        throw new DetallesPlantacionPolicyError(
          `Detalle ${i}: asignacion_id, lote_vivero_id, planta_id y cantidad deben ser enteros.`,
        );
      }

      if (d.cantidad <= 0) {
        throw new DetallesPlantacionPolicyError(
          `Detalle ${i}: cantidad debe ser mayor a cero.`,
        );
      }
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
