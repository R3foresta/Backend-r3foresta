import type { AfiliacionEntrada } from '../../users/perfil-v1.dto';
import {
  commandId,
  id,
  invalidInput,
  numericIdOrder,
  revision,
  strictObject,
} from './comandos.dto';

export type RegistroInicialPayload = {
  subcampania_id: string;
  plan_revision_esperada: string;
  fecha_plantacion: string;
  latitud: number;
  longitud: number;
  especies: { planta_id: string; cantidad: number }[];
  coresponsable_ids: string[];
  evidencia_ids: string[];
  observaciones: string | null;
  afiliaciones_declaradas: {
    usuario_id: string;
    afiliacion: AfiliacionEntrada | null;
  }[];
};

export function fechaExacta(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value < '0001-01-01'
  )
    invalidInput('fecha_plantacion');
  return value;
}
export function coordenada(value: unknown, max: number, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > max ||
    Number(value.toFixed(6)) !== value
  )
    invalidInput(field);
  return Object.is(value, -0) ? 0 : value;
}
function texto(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') invalidInput(field);
  const result = value.normalize('NFC').trim();
  if ([...result].length > max) invalidInput(field);
  return result;
}
function conjunto(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    invalidInput(field);
  const result = value.map((item) => id(item, field));
  if (new Set(result).size !== result.length) invalidInput(field);
  return result.sort(numericIdOrder);
}
function afiliacion(value: unknown): AfiliacionEntrada | null {
  if (value === null) return null;
  const row = strictObject(
    value,
    ['tipo', 'organizacion_id', 'nombre'],
    'afiliaciones_declaradas.afiliacion',
  );
  if (row.tipo === 'ORGANIZACION_REGISTRADA') {
    strictObject(
      row,
      ['tipo', 'organizacion_id'],
      'afiliaciones_declaradas.afiliacion',
    );
    return {
      tipo: row.tipo,
      organizacion_id: id(row.organizacion_id, 'organizacion_id'),
    };
  }
  if (row.tipo === 'OTRA') {
    strictObject(row, ['tipo', 'nombre'], 'afiliaciones_declaradas.afiliacion');
    const nombre = texto(row.nombre, 150, 'afiliacion.nombre');
    if (!nombre) invalidInput('afiliacion.nombre');
    return { tipo: row.tipo, nombre };
  }
  return invalidInput('afiliacion.tipo');
}
export function parseRegistroInicial(
  body: unknown,
  actorId: string,
): {
  comando_id: string;
  payload: RegistroInicialPayload;
} {
  const row = strictObject(body, [
    'comando_id',
    'subcampania_id',
    'plan_revision_esperada',
    'fecha_plantacion',
    'latitud',
    'longitud',
    'especies',
    'coresponsable_ids',
    'evidencia_ids',
    'observaciones',
    'afiliaciones_declaradas',
  ]);
  const coresponsable_ids = conjunto(
    row.coresponsable_ids,
    0,
    100,
    'coresponsable_ids',
  );
  if (coresponsable_ids.includes(actorId)) invalidInput('coresponsable_ids');
  if (
    !Array.isArray(row.especies) ||
    row.especies.length < 1 ||
    row.especies.length > 100
  )
    invalidInput('especies');
  const especies = row.especies
    .map((item) => {
      const entry = strictObject(item, ['planta_id', 'cantidad'], 'especies');
      if (
        typeof entry.cantidad !== 'number' ||
        !Number.isInteger(entry.cantidad) ||
        entry.cantidad < 1 ||
        entry.cantidad > 2147483647
      )
        invalidInput('especies.cantidad');
      return {
        planta_id: id(entry.planta_id, 'especies.planta_id'),
        cantidad: entry.cantidad,
      };
    })
    .sort((a, b) => numericIdOrder(a.planta_id, b.planta_id));
  if (
    new Set(especies.map((s) => s.planta_id)).size !== especies.length ||
    especies.reduce((sum, s) => sum + s.cantidad, 0) > 2147483647
  )
    invalidInput('especies');
  const declarations =
    row.afiliaciones_declaradas === undefined
      ? []
      : row.afiliaciones_declaradas;
  if (!Array.isArray(declarations) || declarations.length > 101)
    invalidInput('afiliaciones_declaradas');
  const afiliaciones_declaradas = declarations
    .map((item) => {
      const entry = strictObject(
        item,
        ['usuario_id', 'afiliacion'],
        'afiliaciones_declaradas',
      );
      const usuario_id = id(
        entry.usuario_id,
        'afiliaciones_declaradas.usuario_id',
      );
      if (usuario_id !== actorId && !coresponsable_ids.includes(usuario_id))
        invalidInput('afiliaciones_declaradas.usuario_id');
      return { usuario_id, afiliacion: afiliacion(entry.afiliacion) };
    })
    .sort((a, b) => numericIdOrder(a.usuario_id, b.usuario_id));
  if (
    new Set(afiliaciones_declaradas.map((a) => a.usuario_id)).size !==
    afiliaciones_declaradas.length
  )
    invalidInput('afiliaciones_declaradas');
  return {
    comando_id: commandId(row.comando_id),
    payload: {
      subcampania_id: id(row.subcampania_id, 'subcampania_id'),
      plan_revision_esperada: revision(
        row.plan_revision_esperada,
        'plan_revision_esperada',
      ),
      fecha_plantacion: fechaExacta(row.fecha_plantacion),
      latitud: coordenada(row.latitud, 90, 'latitud'),
      longitud: coordenada(row.longitud, 180, 'longitud'),
      especies,
      coresponsable_ids,
      evidencia_ids: conjunto(row.evidencia_ids, 1, 10, 'evidencia_ids'),
      observaciones:
        row.observaciones == null
          ? null
          : texto(row.observaciones, 2000, 'observaciones') || null,
      afiliaciones_declaradas,
    },
  };
}

export type ParticipantesQuery = {
  q: string | null;
  cursor: string | null;
  limite: number;
};
export function parseParticipantesQuery(query: unknown): ParticipantesQuery {
  const row = strictObject(query, ['q', 'cursor', 'limite'], 'query');
  const q = row.q === undefined ? null : texto(row.q, 100, 'q');
  if (q !== null && [...q].length < 2) invalidInput('q');
  if (
    row.limite !== undefined &&
    (typeof row.limite !== 'string' || !/^[1-9][0-9]*$/.test(row.limite))
  )
    invalidInput('limite');
  const limite = row.limite === undefined ? 20 : Number(row.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > 20)
    invalidInput('limite');
  const cursor = row.cursor === undefined ? null : row.cursor;
  if (
    cursor !== null &&
    (typeof cursor !== 'string' || !cursor || cursor.length > 1024)
  )
    invalidInput('cursor');
  return { q, cursor: cursor as string | null, limite };
}
