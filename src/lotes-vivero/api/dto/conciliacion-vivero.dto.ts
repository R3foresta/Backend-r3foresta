import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  commandId,
  id,
  invalidInput,
  revision,
  strictObject,
} from '../../../participacion/dto/comandos.dto';

export const idSchema: SchemaObject = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
  maxLength: 19,
};
export const revisionSchema: SchemaObject = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]*)$',
  maxLength: 19,
};
export const uuidSchema: SchemaObject = { type: 'string', format: 'uuid' };
export const unidadSchema: SchemaObject = {
  type: 'string',
  enum: ['G', 'UNIDAD'],
};
const cantidadPattern = /^(0|[1-9][0-9]{0,23})(\.[0-9]{1,6})?$/;
export const cantidadSchema: SchemaObject = {
  type: 'string',
  pattern: cantidadPattern.source,
  description: 'Cantidad decimal exacta en la unidad canónica del origen.',
};
export const fechaSchema: SchemaObject = { type: 'string', format: 'date' };
export function objectSchema(
  properties: Record<string, SchemaObject>,
): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

const comun = { comando_id: uuidSchema, revision_esperada: revisionSchema };
export const PADRON_COMANDO_SCHEMA = objectSchema({
  ...comun,
  accion: { type: 'string', enum: ['INCLUIR', 'RETIRAR'] },
  motivo: { type: 'string', minLength: 10, maxLength: 500 },
});
export const CONCILIAR_COMANDO_SCHEMA = objectSchema({
  ...comun,
  revision_captura_esperada: revisionSchema,
  marca_movimientos: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  saldo_esperado: cantidadSchema,
  cantidad_observada: cantidadSchema,
  unidad_observada: unidadSchema,
  fecha_comprobacion: fechaSchema,
  evidencia_ids: {
    type: 'array',
    items: idSchema,
    minItems: 1,
    maxItems: 5,
    uniqueItems: true,
  },
});

type Comun = { recoleccion_id: string; revision_esperada: string };
export type ConciliacionIntencion = Comun &
  (
    | { accion: 'INCLUIR' | 'RETIRAR'; motivo: string }
    | {
        accion: 'CONCILIAR';
        revision_captura_esperada: string;
        marca_movimientos: string;
        saldo_esperado: string;
        cantidad_observada: string;
        unidad_observada: 'G' | 'UNIDAD';
        fecha_comprobacion: string;
        evidencia_ids: string[];
      }
  );
type Comando = { comando_id: string; payload: ConciliacionIntencion };

export function parsePadron(origen: unknown, value: unknown): Comando {
  const b = strictObject(value, Object.keys(PADRON_COMANDO_SCHEMA.properties!));
  if (b.accion !== 'INCLUIR' && b.accion !== 'RETIRAR') invalidInput('accion');
  if (typeof b.motivo !== 'string') invalidInput('motivo');
  const motivo = b.motivo.normalize('NFC').trim();
  if ([...motivo].length < 10 || [...motivo].length > 500)
    invalidInput('motivo');
  return {
    comando_id: commandId(b.comando_id),
    payload: {
      accion: b.accion,
      motivo,
      recoleccion_id: id(origen),
      revision_esperada: revision(b.revision_esperada),
    },
  };
}

function cantidad(value: unknown, field: string) {
  if (typeof value !== 'string' || !cantidadPattern.test(value))
    invalidInput(field);
  return value;
}

export function parseConciliacion(origen: unknown, value: unknown): Comando {
  const b = strictObject(
    value,
    Object.keys(CONCILIAR_COMANDO_SCHEMA.properties!),
  );
  if (
    typeof b.marca_movimientos !== 'string' ||
    !/^[0-9a-f]{64}$/.test(b.marca_movimientos)
  )
    invalidInput('marca_movimientos');
  if (b.unidad_observada !== 'G' && b.unidad_observada !== 'UNIDAD')
    invalidInput('unidad_observada');
  const fecha = b.fecha_comprobacion;
  if (
    typeof fecha !== 'string' ||
    fecha < '0001-01-01' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !Number.isFinite(Date.parse(fecha)) ||
    new Date(fecha).toISOString().slice(0, 10) !== fecha
  )
    invalidInput('fecha_comprobacion');
  if (
    !Array.isArray(b.evidencia_ids) ||
    b.evidencia_ids.length < 1 ||
    b.evidencia_ids.length > 5
  )
    invalidInput('evidencia_ids');
  const evidencia_ids = b.evidencia_ids.map((v) => id(v, 'evidencia_ids'));
  if (new Set(evidencia_ids).size !== evidencia_ids.length)
    invalidInput('evidencia_ids');
  return {
    comando_id: commandId(b.comando_id),
    payload: {
      accion: 'CONCILIAR',
      recoleccion_id: id(origen),
      revision_esperada: revision(b.revision_esperada),
      revision_captura_esperada: revision(
        b.revision_captura_esperada,
        'revision_captura_esperada',
      ),
      marca_movimientos: b.marca_movimientos,
      saldo_esperado: cantidad(b.saldo_esperado, 'saldo_esperado'),
      cantidad_observada: cantidad(b.cantidad_observada, 'cantidad_observada'),
      unidad_observada: b.unidad_observada,
      fecha_comprobacion: fecha,
      evidencia_ids,
    },
  };
}
