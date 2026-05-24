export class CoresponsablesPolicyError extends Error {}

export class CoresponsablesPolicy {
  static normalizar(
    coresponsableIds: number[] | undefined,
    responsableId: number,
  ): number[] {
    const ids = Array.isArray(coresponsableIds) ? coresponsableIds : [];

    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new CoresponsablesPolicyError(
          `coresponsable_ids debe contener enteros positivos (recibido: ${id}).`,
        );
      }
    }

    const unicos = Array.from(new Set(ids)).filter(
      (id) => id !== responsableId,
    );

    return unicos.sort((a, b) => a - b);
  }
}
