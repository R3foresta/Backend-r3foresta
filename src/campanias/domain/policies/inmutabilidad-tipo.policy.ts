export class InmutabilidadTipoPolicyError extends Error {}

export class InmutabilidadTipoPolicy {
  static assertPuedeCambiar(
    tipoNuevo: string | undefined,
    tipoActual: string,
    countSubcampanias: number,
  ): void {
    if (tipoNuevo === undefined || tipoNuevo === tipoActual) return;
    if (countSubcampanias > 0) {
      throw new InmutabilidadTipoPolicyError(
        'El tipo de la campaña es inmutable cuando ya tiene subcampañas.',
      );
    }
  }
}
