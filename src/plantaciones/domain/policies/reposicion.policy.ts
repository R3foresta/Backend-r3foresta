export class ReposicionPolicyError extends Error {}

export class ReposicionPolicy {
  static assertCoherencia(
    esReposicion: boolean,
    registroOrigenId: number | null | undefined,
  ): void {
    if (
      esReposicion &&
      (registroOrigenId === null || registroOrigenId === undefined)
    ) {
      throw new ReposicionPolicyError(
        'Una reposicion requiere registro_plantacion_origen_id.',
      );
    }

    if (
      !esReposicion &&
      registroOrigenId !== null &&
      registroOrigenId !== undefined
    ) {
      throw new ReposicionPolicyError(
        'registro_plantacion_origen_id solo se permite cuando es_reposicion=true.',
      );
    }

    if (
      esReposicion &&
      registroOrigenId !== undefined &&
      registroOrigenId !== null
    ) {
      if (!Number.isInteger(registroOrigenId) || registroOrigenId <= 0) {
        throw new ReposicionPolicyError(
          'registro_plantacion_origen_id debe ser un entero positivo.',
        );
      }
    }
  }
}
