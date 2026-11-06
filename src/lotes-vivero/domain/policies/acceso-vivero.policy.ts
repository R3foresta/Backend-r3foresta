/** M2 no deriva de M1, equipo, afiliación, autoría ni rol GENERAL/VALIDADOR. */
export class AccesoViveroPolicy {
  static rolInterno(rol: string): boolean {
    return ['ADMIN', 'GENERAL', 'VALIDADOR'].includes(rol);
  }
  static autorizado(rol: string, vivero: string, ambitos: string[]): boolean {
    // SQL ya resolvió el alcance global; no restaurarlo desde un rol previo.
    return this.rolInterno(rol) && ambitos.includes(vivero);
  }
}

/** Valida el ámbito que devuelve SQL sin coerciones de IDs ni respaldo por rol. */
export function leerAmbitosVivero(
  value: unknown,
): { global: boolean; viveros: string[] } | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('global' in value) ||
    !('viveros' in value) ||
    typeof value.global !== 'boolean' ||
    !Array.isArray(value.viveros)
  )
    return null;
  const ids: unknown[] = value.viveros;
  const esId = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^[1-9][0-9]{0,18}$/.test(v) &&
    BigInt(v) <= 9223372036854775807n;
  if (!ids.every(esId)) return null;
  return { global: value.global, viveros: ids };
}
