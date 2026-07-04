export class DesactivacionCampaniaPolicyError extends Error {}

export class DesactivacionCampaniaPolicy {
  static assertPuedeDesactivar(countSubcampaniasNoCanceladas: number): void {
    if (countSubcampaniasNoCanceladas > 0) {
      throw new DesactivacionCampaniaPolicyError(
        'No se puede desactivar una campaña con subcampañas no canceladas.',
      );
    }
  }
}
