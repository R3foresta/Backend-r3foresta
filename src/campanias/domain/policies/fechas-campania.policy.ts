export class FechasCampaniaPolicyError extends Error {}

export class FechasCampaniaPolicy {
  static assertCoherentes(
    fechaInicio: string | null | undefined,
    fechaFin: string | null | undefined,
  ): void {
    if (!fechaInicio || !fechaFin) return;
    if (new Date(fechaFin) < new Date(fechaInicio)) {
      throw new FechasCampaniaPolicyError(
        'fecha_estimada_fin no puede ser anterior a fecha_estimada_inicio.',
      );
    }
  }
}
