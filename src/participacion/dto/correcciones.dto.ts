import {
  commandId,
  id,
  invalidInput,
  numericIdOrder,
  revision,
  strictObject,
} from './comandos.dto';

export type CorrectionObservationsPayload = {
  registro_plantacion_id: string;
  revision_esperada: string;
  motivo: string;
  observaciones: string | null;
};
export type CorrectionHistoryQuery = { cursor: string | null; limite: number };
export type CorrectionParticipantsPayload = {
  registro_plantacion_id: string;
  revision_esperada: string;
  motivo: string;
  coresponsable_ids: string[];
};
export type HistoricalParticipantsQuery = CorrectionHistoryQuery & {
  modo: 'ID' | 'NOMBRE';
  consulta: string;
};

function normalizedText(value: unknown, field: string): string {
  // PostgreSQL JSONB/text no representa NUL ni surrogates UTF-16 aislados.
  // Rechazarlos antes del transporte evita una intención imposible con503.
  if (typeof value !== 'string' || /[\u0000\uD800-\uDFFF]/u.test(value))
    invalidInput(field);
  return value.normalize('NFC').trim();
}

export function parseCorrectionObservations(body: unknown, registro: unknown) {
  const input = strictObject(body, [
    'comando_id',
    'revision_esperada',
    'motivo',
    'observaciones',
  ]);
  const motivo = normalizedText(input.motivo, 'motivo');
  if ([...motivo].length < 3 || [...motivo].length > 1000)
    invalidInput('motivo');
  const observaciones =
    input.observaciones === null
      ? null
      : normalizedText(input.observaciones, 'observaciones') || null;
  if (observaciones !== null && [...observaciones].length > 2000)
    invalidInput('observaciones');
  const payload: CorrectionObservationsPayload = {
    registro_plantacion_id: id(registro, 'registro_plantacion_id'),
    revision_esperada: revision(input.revision_esperada),
    motivo,
    observaciones,
  };
  return { comando_id: commandId(input.comando_id), payload };
}

export function parseCorrectionParticipants(body: unknown, registro: unknown) {
  const input = strictObject(body, [
    'comando_id',
    'revision_esperada',
    'motivo',
    'coresponsable_ids',
  ]);
  const motivo = normalizedText(input.motivo, 'motivo');
  if ([...motivo].length < 3 || [...motivo].length > 1000)
    invalidInput('motivo');
  if (
    !Array.isArray(input.coresponsable_ids) ||
    input.coresponsable_ids.length > 100
  )
    invalidInput('coresponsable_ids');
  const coresponsable_ids = input.coresponsable_ids.map((value) =>
    id(value, 'coresponsable_ids'),
  );
  if (new Set(coresponsable_ids).size !== coresponsable_ids.length)
    invalidInput('coresponsable_ids');
  const payload: CorrectionParticipantsPayload = {
    registro_plantacion_id: id(registro, 'registro_plantacion_id'),
    revision_esperada: revision(input.revision_esperada),
    motivo,
    coresponsable_ids: coresponsable_ids.sort(numericIdOrder),
  };
  return { comando_id: commandId(input.comando_id), payload };
}

export function parseHistoricalParticipantsQuery(
  query: unknown,
): HistoricalParticipantsQuery {
  const input = strictObject(query, ['q', 'cursor', 'limite'], 'query');
  const consulta = normalizedText(input.q, 'q');
  let modo: HistoricalParticipantsQuery['modo'];
  if (/^[0-9]+$/.test(consulta)) {
    id(consulta, 'q');
    modo = 'ID';
  } else {
    if ([...consulta].length < 3 || [...consulta].length > 100)
      invalidInput('q');
    modo = 'NOMBRE';
  }
  return {
    ...parseCorrectionHistoryQuery({
      cursor: input.cursor,
      limite: input.limite,
    }),
    modo,
    consulta,
  };
}

export function parseCorrectionHistoryQuery(
  query: unknown,
): CorrectionHistoryQuery {
  const input = strictObject(query, ['cursor', 'limite'], 'query');
  let limite = 20;
  if (input.limite !== undefined) {
    if (typeof input.limite !== 'string' || !/^[1-9][0-9]*$/.test(input.limite))
      invalidInput('limite');
    limite = Number(input.limite);
    if (!Number.isInteger(limite) || limite < 1 || limite > 50)
      invalidInput('limite');
  }
  if (
    input.cursor !== undefined &&
    (typeof input.cursor !== 'string' ||
      !input.cursor ||
      input.cursor.length > 1024)
  )
    invalidInput('cursor');
  return { limite, cursor: (input.cursor as string | undefined) ?? null };
}
