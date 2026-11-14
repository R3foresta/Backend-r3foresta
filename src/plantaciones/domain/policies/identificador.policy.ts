/** IDs de dominio: JSON number sólo si es exacto; cadenas decimales canónicas BIGINT. */
export function identificadorExacto(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    return null;
  return value;
}
