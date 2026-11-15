import { BadRequestException } from '@nestjs/common';
import { exactId } from '../../../common/dto/bigint-id';
import { FiltrarTimelineLoteDto } from '../../api/dto/filtrar-timeline-lote.dto';

export type TimelineCursor = {
  version: 1;
  contexto: string;
  orden: 'ASC';
  corte: string;
  total: number;
  fecha: string;
  creado: string;
  id: string;
};

/** El cursor sólo describe una lectura: nunca concede acceso al lote. */
export function timelineContexto(
  loteId: number | string,
  filters: FiltrarTimelineLoteDto,
): string {
  return JSON.stringify([
    exactId(loteId),
    filters.tipo_evento ?? null,
    filters.responsable_id ? exactId(filters.responsable_id) : null,
    filters.fecha_inicio ?? null,
    filters.fecha_fin ?? null,
  ]);
}

export function leerTimelineCursor(
  token: string | undefined,
  contexto: string,
): TimelineCursor | null {
  if (token === undefined) return null;
  try {
    if (token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const value = JSON.parse(decoded) as TimelineCursor;
    if (
      value.version !== 1 ||
      value.contexto !== contexto ||
      value.orden !== 'ASC' ||
      typeof value.corte !== 'string' ||
      typeof value.id !== 'string' ||
      exactId(value.corte) !== value.corte ||
      exactId(value.id) !== value.id ||
      BigInt(value.id) > BigInt(value.corte) ||
      !Number.isSafeInteger(value.total) ||
      value.total < 1 ||
      !esFechaPersistida(value.fecha) ||
      !esFechaPersistida(value.creado)
    )
      throw Error();
    return value;
  } catch {
    throw new BadRequestException(
      'Cursor de historial inválido o de otro contexto.',
    );
  }
}

function esFechaPersistida(value: unknown): value is string {
  // El catálogo T5 conserva DATE. Se acepta también TIMESTAMPTZ sin permitir
  // operadores PostgREST en el filtro compuesto de continuación.
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value)) &&
    // Date.parse normaliza, por ejemplo, febrero30. El día persistido debe
    // existir antes de formar el filtro compuesto PostgREST.
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) ===
      value.slice(0, 10)
  );
}

export function crearTimelineCursor(value: TimelineCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
