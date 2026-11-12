import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const id: SchemaObject = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
  maxLength: 19,
};
const revision: SchemaObject = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]*)$',
  maxLength: 19,
};
const date: SchemaObject = { type: 'string', format: 'date' };
const instant: SchemaObject = { type: 'string', format: 'date-time' };
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const text: SchemaObject = { type: 'string' };
const unit: SchemaObject = { type: 'string', enum: ['G', 'UNIDAD'] };
const number: SchemaObject = { type: 'number' };
const receipt = object({
  id,
  fecha_recepcion: date,
  recibido_por: id,
  registrado_en: instant,
});
export const RECEPCION_ORIGEN_SCHEMA = object({
  recoleccion_id: id,
  vivero_id: id,
  recolector_id: id,
  codigo_trazabilidad: text,
  fecha_recoleccion: date,
  tipo_material: { type: 'string', enum: ['SEMILLA', 'ESQUEJE'] },
  nombre_cientifico_snapshot: nullable(text),
  nombre_comercial_snapshot: nullable(text),
  nombre_recolector_snapshot: nullable(text),
  cantidad_declarada: number,
  unidad_declarada: unit,
  saldo_actual: number,
  revision,
  estado_registro: {
    type: 'string',
    enum: ['BORRADOR', 'PENDIENTE_VALIDACION', 'RECHAZADO', 'VALIDADO'],
  },
  motivo_rechazo: nullable(text),
  recepcion: nullable(receipt),
  puede_recibir_validar: { type: 'boolean' },
  puede_rechazar: { type: 'boolean' },
});
export const RECEPCION_COLA_SCHEMA = object({
  data: { type: 'array', items: RECEPCION_ORIGEN_SCHEMA },
  siguiente_antes_de_id: nullable(id),
});
export const RECEPCION_DETALLE_SCHEMA = object({
  ...RECEPCION_ORIGEN_SCHEMA.properties!,
  observaciones: nullable(text),
  ubicacion_id: id,
  metodo_id: nullable(id),
  planta_id: nullable(id),
  ubicacion: nullable(
    object({
      id,
      pais_id: nullable(id),
      division_id: nullable(id),
      nombre: nullable(text),
      referencia: nullable(text),
      latitud: nullable(number),
      longitud: nullable(number),
      precision_m: nullable(number),
      fuente: nullable(text),
    }),
  ),
  historial: {
    type: 'array',
    items: object({
      id,
      tipo_historial: text,
      estado_origen: nullable(text),
      estado_destino: text,
      actor_id: nullable(id),
      fecha: date,
      metadata: { type: 'object', additionalProperties: true },
    }),
  },
  evidencias: {
    type: 'array',
    items: object({
      id,
      bucket: text,
      ruta_archivo: text,
      mime_type: text,
      titulo: nullable(text),
      recepcion_id: nullable(id),
      public_url: { type: 'string', format: 'uri' },
    }),
  },
});
const result = object({
  accion: { type: 'string', enum: ['RECIBIR', 'RECHAZAR'] },
  recoleccion_id: id,
  vivero_id: id,
  recepcion_id: nullable(id),
  revision_anterior: revision,
  revision_nueva: revision,
  cantidad_recibida: nullable(number),
  unidad_recibida: nullable(unit),
  fecha_recepcion: nullable(date),
  actor_id: id,
  saldo_actual: number,
  estado_registro: { type: 'string', enum: ['VALIDADO', 'RECHAZADO'] },
  anclaje_externo: { type: 'string', enum: ['FUERA_TRANSACCION', 'NO_APLICA'] },
  motivo_rechazo: nullable(text),
  registrado_en: instant,
});
export const RECEPCION_RECIBO_SCHEMA = object({
  comando_id: { type: 'string', format: 'uuid' },
  estado: {
    type: 'string',
    enum: ['CONFIRMADO', 'RECHAZADO', 'SIN_RESULTADO', 'CONFLICTO_CLAVE'],
    description:
      'CONFIRMADO incluye la decisión de rechazar la ficha. RECHAZADO representa un error del comando.',
  },
  resultado: nullable(result),
  error: nullable(object({ codigo: text })),
  finalizado_en: nullable(instant),
});
export const RECEPCION_CARGA_SCHEMA = object({
  evidencia_ids: { type: 'array', items: id, minItems: 1, maxItems: 5 },
  audiencia: { type: 'string', enum: ['BUCKET_LEGADO_PUBLICO'] },
});
