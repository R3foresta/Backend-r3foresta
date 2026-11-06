import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  commandId,
  id,
  invalidInput,
  revision,
  strictObject,
} from '../../../participacion/dto/comandos.dto';

export type RecepcionIntencion = {
  recoleccion_id: string;
  revision_esperada: string;
  cantidad_recibida: number;
  unidad_recibida: 'G' | 'KG' | 'UNIDAD';
  fecha_recepcion: string;
  evidencia_ids: string[];
  incidencia_id?: string;
  motivo_resolucion?: string;
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
    comando_id: {
      type: 'string',
      format: 'uuid',
      description: 'UUID v4 por intención; conservar ante respuesta incierta.',
    },
    revision_esperada: {
      type: 'string',
      pattern: '^(0|[1-9][0-9]*)$',
      maxLength: 19,
      description: 'revision_captura exacta; no convertir a Number.',
    },
    cantidad_recibida: { type: 'number', exclusiveMinimum: true, minimum: 0 },
    unidad_recibida: {
      type: 'string',
      enum: ['G', 'KG', 'UNIDAD'],
      description: 'KG se normaliza a G; UNIDAD entero; ESQUEJE solo UNIDAD.',
    },
    fecha_recepcion: {
      type: 'string',
      format: 'date',
      description:
        'Día físico entre fecha de recolección y hoy en America/La_Paz.',
    },
    evidencia_ids: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 19 },
    },
    incidencia_id: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 19 },
    motivo_resolucion: { type: 'string', minLength: 10, maxLength: 500 },
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
    recoleccion_id: id(origen),
    revision_esperada: revision(b.revision_esperada),
    cantidad_recibida: b.cantidad_recibida,
    unidad_recibida: b.unidad_recibida as RecepcionIntencion['unidad_recibida'],
    fecha_recepcion: b.fecha_recepcion,
    evidencia_ids,
  };
  if (b.incidencia_id !== undefined || b.motivo_resolucion !== undefined) {
    payload.incidencia_id = id(b.incidencia_id, 'incidencia_id');
    if (typeof b.motivo_resolucion !== 'string')
      invalidInput('motivo_resolucion');
    const motivo = b.motivo_resolucion.trim().normalize('NFC');
    if (motivo.length < 10 || motivo.length > 500)
      invalidInput('motivo_resolucion');
    payload.motivo_resolucion = motivo;
  }
  return { comando_id: commandId(b.comando_id), payload };
}
