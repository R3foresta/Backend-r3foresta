import { identificadorExacto } from './identificador.policy';

export class CoresponsablesPolicyError extends Error {}

export class CoresponsablesPolicy {
  static normalizar(
    coresponsableIds: (number | string)[] | undefined,
    responsableId: number | string,
  ): (number | string)[] {
    const ids = Array.isArray(coresponsableIds) ? coresponsableIds : [];

    for (const id of ids) {
      if (identificadorExacto(id) === null) {
        throw new CoresponsablesPolicyError(
          `coresponsable_ids debe contener enteros positivos (recibido: ${id}).`,
        );
      }
    }

    const unicos = new Map(ids.map((id) => [identificadorExacto(id)!, id]));
    unicos.delete(identificadorExacto(responsableId)!);
    return [...unicos.values()].sort((a, b) =>
      BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
    );
  }
}
