import { CantidadUnidadPolicy } from '../../domain/policies/cantidad-unidad.policy';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  commandId,
  id,
  invalidInput,
  revision,
  strictObject,
} from '../../../participacion/dto/comandos.dto';

export type RecepcionIntencion =
  | {
      accion: 'RECIBIR';
      recoleccion_id: string;
      revision_esperada: string;
      cantidad_recibida: number;
      unidad_recibida: 'G' | 'KG' | 'UNIDAD';
      fecha_recepcion: string;
      evidencia_ids: string[];
    }
  | {
      accion: 'RECHAZAR';
      recoleccion_id: string;
      revision_esperada: string;
      motivo_rechazo: string;
    };
const comando: SchemaObject = {
  type: 'string',
  format: 'uuid',
  description: 'UUID v4 por intención; conservar ante respuesta incierta.',
};
const revisionSchema: SchemaObject = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]*)$',
  maxLength: 19,
  description: 'revision_captura exacta; no convertir a Number.',
};
export const RECEPCION_COMANDO_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'comando_id',
    'revision_esperada',
    'cantidad_recibida',
    'unidad_recibida',
    'fecha_recepcion',
    'evidencia_ids',
  ],
  properties: {
    comando_id: comando,
    revision_esperada: revisionSchema,
    cantidad_recibida: {
      type: 'number',
      exclusiveMinimum: true,
      minimum: 0,
      description:
        'Debe coincidir exactamente con lo declarado al normalizar G/KG. G admite hasta seis decimales; UNIDAD es entero.',
    },
    unidad_recibida: {
      type: 'string',
      enum: ['G', 'KG', 'UNIDAD'],
      description: 'KG se normaliza a G; UNIDAD entero; ESQUEJE solo UNIDAD.',
    },
    fecha_recepcion: {
      type: 'string',
      format: 'date',
      description:
        'Día físico entre fecha de recolección y hoy en America/La_Paz. No es el instante de registro.',
    },
    evidencia_ids: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 19 },
      description:
        'Fotos cargadas por esta cuenta para la revisión actual de esta ficha y vivero.',
    },
  },
};
export const RECEPCION_RECHAZO_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['comando_id', 'revision_esperada', 'motivo_rechazo'],
  properties: {
    comando_id: comando,
    revision_esperada: revisionSchema,
    motivo_rechazo: { type: 'string', minLength: 10, maxLength: 500 },
  },
};
export function parseRecepcionComando(origen: unknown, value: unknown) {
  const b = strictObject(
    value,
    Object.keys(RECEPCION_COMANDO_SCHEMA.properties!),
  );
  if (
    typeof b.cantidad_recibida !== 'number' ||
    !Number.isFinite(b.cantidad_recibida) ||
    b.cantidad_recibida <= 0
  )
    invalidInput('cantidad_recibida');
  if (!['G', 'KG', 'UNIDAD'].includes(String(b.unidad_recibida)))
    invalidInput('unidad_recibida');
  // PostgreSQL vuelve a normalizar y comparar con NUMERIC dentro de la transacción.
  // No redondear aquí: una diferencia nunca se convierte en conformidad.
  const cantidad = b.cantidad_recibida;
  try {
    CantidadUnidadPolicy.normalizarYValidar(
      cantidad,
      b.unidad_recibida,
      'SEMILLA',
    );
  } catch {
    invalidInput('cantidad_recibida');
  }
  if (
    typeof b.fecha_recepcion !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_recepcion) ||
    !Number.isFinite(Date.parse(b.fecha_recepcion)) ||
    new Date(b.fecha_recepcion).toISOString().slice(0, 10) !== b.fecha_recepcion
  )
    invalidInput('fecha_recepcion');
  if (
    !Array.isArray(b.evidencia_ids) ||
    b.evidencia_ids.length < 1 ||
    b.evidencia_ids.length > 5
  )
    invalidInput('evidencia_ids');
  const evidencia_ids = b.evidencia_ids.map((v) => id(v, 'evidencia_ids'));
  if (new Set(evidencia_ids).size !== evidencia_ids.length)
    invalidInput('evidencia_ids');
  const payload: RecepcionIntencion = {
    accion: 'RECIBIR',
    recoleccion_id: id(origen),
    revision_esperada: revision(b.revision_esperada),
    cantidad_recibida: cantidad,
    unidad_recibida: b.unidad_recibida as 'G' | 'KG' | 'UNIDAD',
    fecha_recepcion: b.fecha_recepcion,
    evidencia_ids,
  };
  return { comando_id: commandId(b.comando_id), payload };
}
export function parseRecepcionRechazo(origen: unknown, value: unknown) {
  const b = strictObject(
    value,
    Object.keys(RECEPCION_RECHAZO_SCHEMA.properties!),
  );
  if (typeof b.motivo_rechazo !== 'string') invalidInput('motivo_rechazo');
  const motivo = b.motivo_rechazo.trim().normalize('NFC');
  if ([...motivo].length < 10 || [...motivo].length > 500)
    invalidInput('motivo_rechazo');
  const payload: RecepcionIntencion = {
    accion: 'RECHAZAR',
    recoleccion_id: id(origen),
    revision_esperada: revision(b.revision_esperada),
    motivo_rechazo: motivo,
  };
  return { comando_id: commandId(b.comando_id), payload };
}
