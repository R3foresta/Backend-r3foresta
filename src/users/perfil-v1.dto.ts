import { UnprocessableEntityException } from '@nestjs/common';

export type AfiliacionEntrada =
  | { tipo: 'ORGANIZACION_REGISTRADA'; organizacion_id: string }
  | { tipo: 'OTRA'; nombre: string };
export type ActualizarPerfil = {
  nombre?: string;
  apellido?: string | null;
  afiliacion?: AfiliacionEntrada | null;
};

function invalid(message: string): never {
  throw new UnprocessableEntityException({
    codigo: 'ENTRADA_INVALIDA',
    message,
  });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Se requiere un objeto.');
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    invalid('Campo no permitido.');
}

export function positiveId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    invalid('ID BIGINT positivo inválido.');
  return value;
}

function normalized(
  value: unknown,
  max: number,
  nullableEmpty = false,
): string | null {
  if (typeof value !== 'string') invalid('Se requiere texto.');
  const text = value.normalize('NFC').trim();
  if (nullableEmpty && !text) return null;
  if (!text || [...text].length > max)
    invalid(`Texto fuera de rango 1..${max}.`);
  return text;
}

export function parsePerfil(body: unknown): ActualizarPerfil {
  const input = object(body);
  onlyKeys(input, ['nombre', 'apellido', 'afiliacion']);
  if (!Object.keys(input).length) invalid('Se requiere al menos un campo.');
  const result: ActualizarPerfil = {};
  if ('nombre' in input)
    result.nombre = normalized(input.nombre, 100) as string;
  if ('apellido' in input)
    result.apellido =
      input.apellido === null ? null : normalized(input.apellido, 30, true);
  if ('afiliacion' in input) {
    if (input.afiliacion === null) result.afiliacion = null;
    else {
      const affiliation = object(input.afiliacion);
      if (affiliation.tipo === 'ORGANIZACION_REGISTRADA') {
        onlyKeys(affiliation, ['tipo', 'organizacion_id']);
        result.afiliacion = {
          tipo: 'ORGANIZACION_REGISTRADA',
          organizacion_id: positiveId(affiliation.organizacion_id),
        };
      } else if (affiliation.tipo === 'OTRA') {
        onlyKeys(affiliation, ['tipo', 'nombre']);
        result.afiliacion = {
          tipo: 'OTRA',
          nombre: normalized(affiliation.nombre, 150) as string,
        };
      } else invalid('Tipo de afiliación inválido.');
    }
  }
  return result;
}

export function parseSelector(query: Record<string, unknown>): {
  consulta: string | null;
  limite: number;
  cursor: string | null;
} {
  onlyKeys(query, ['consulta', 'limite', 'cursor']);
  const consulta =
    query.consulta === undefined
      ? null
      : (normalized(query.consulta, 100) as string);
  if (consulta !== null && [...consulta].length < 2)
    invalid('Consulta mínima de 2 caracteres.');
  if (
    query.limite !== undefined &&
    (typeof query.limite !== 'string' || !/^[1-9][0-9]*$/.test(query.limite))
  )
    invalid('Límite inválido.');
  const limite = query.limite === undefined ? 20 : Number(query.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > 20)
    invalid('Límite fuera de rango.');
  const cursor = query.cursor === undefined ? null : query.cursor;
  if (
    cursor !== null &&
    (typeof cursor !== 'string' || cursor.length > 1024 || !cursor)
  )
    invalid('Cursor inválido.');
  return { consulta, limite, cursor: cursor };
}
