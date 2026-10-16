import { createHash } from 'node:crypto';

// El DTO ya normalizó textos/conjuntos; este serializador fija los bytes v1.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(object)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonicalJson(object[key]))
        .join(',') +
      '}'
    );
  }
  throw new TypeError('Contenido no serializable en PA-COMANDO/1.');
}
export function canonicalCommand(
  operation: string,
  payload: unknown,
): { contenido: string; huella: string } {
  // Los números HTTP conservan su tipo; la intención de inicial fija seis
  // posiciones decimales en los bytes canónicos aceptados por D10.
  const normalized =
    operation === 'REGISTRAR_PLANTACION_INICIAL'
      ? {
          ...(payload as Record<string, unknown>),
          latitud: (payload as { latitud: number }).latitud.toFixed(6),
          longitud: (payload as { longitud: number }).longitud.toFixed(6),
        }
      : payload;
  const contenido = canonicalJson(normalized);
  return {
    contenido,
    huella: createHash('sha256')
      .update('PA-COMANDO/1\n' + operation + '\n' + contenido, 'utf8')
      .digest('hex'),
  };
}
