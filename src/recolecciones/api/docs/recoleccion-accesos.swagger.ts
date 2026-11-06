import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text: SchemaObject = { type: 'string' };
const id: SchemaObject = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
  maxLength: 19,
  example: '42',
};
const revision: SchemaObject = {
  type: 'string',
  pattern: '^(0|[1-9][0-9]*)$',
  maxLength: 19,
  example: '0',
};
const bool: SchemaObject = { type: 'boolean' };
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
const error = object({
  codigo: text,
  mensaje: text,
  campos: { type: 'array', items: text },
  ambitos: { type: 'array', items: id },
  reintento: {
    type: 'string',
    enum: [
      'MISMA_CLAVE',
      'NUEVA_CONFIRMACION',
      'RECUPERAR_SESION',
      'NO_APLICA',
    ],
  },
});
const fuera = object({
  error,
  comando_id: nullable({ type: 'string', format: 'uuid' }),
  resultado_concluyente: { type: 'boolean', enum: [false] },
});
const result = object({
  tipo: { type: 'string', enum: ['ACCESO_RECOLECCION'] },
  usuario_id: id,
  acceso_explicito_anterior: bool,
  acceso_explicito_nuevo: bool,
  revision_anterior: revision,
  revision_nueva: revision,
  cambio: { type: 'string', enum: ['CAMBIO_APLICADO', 'SIN_CAMBIOS'] },
});
const receipt = object({
  comando_id: { type: 'string', format: 'uuid' },
  operacion: {
    type: 'string',
    enum: ['OTORGAR_ACCESO_RECOLECCION', 'RETIRAR_ACCESO_RECOLECCION'],
  },
  estado: { type: 'string', enum: ['CONFIRMADO', 'RECHAZADO'] },
  resultado: nullable(result),
  error: nullable(error),
  finalizado_en: instant,
});
const history = object({
  id,
  evento: { type: 'string', enum: ['ACCESO_OTORGADO', 'ACCESO_RETIRADO'] },
  acceso_id: id,
  actor_id: id,
  revision_anterior: revision,
  revision_nueva: revision,
  motivo: text,
  creado_en: instant,
  comando_id: { type: 'string', format: 'uuid' },
  otorgado_en: instant,
  revocado_en: nullable(instant),
});
const read = object({
  data: object({
    usuario_id: id,
    rol_global: {
      type: 'string',
      enum: ['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'],
    },
    activo: bool,
    revision_acceso: revision,
    revision_autoridad: revision,
    acceso_explicito: bool,
    acceso_efectivo: bool,
    origen: { type: 'string', enum: ['ADMIN', 'EXPLICITO', 'SIN_ACCESO'] },
    capacidades: object({
      crear: bool,
      mantener_propias: bool,
      confirmar_propias: { type: 'boolean', enum: [false] },
      desechar: bool,
    }),
    vigencia_actual: nullable(
      object({ id, otorgado_en: instant, otorgado_por: id }),
    ),
    historial: { type: 'array', items: history, maxItems: 50 },
    siguiente_antes_de_id: nullable(id),
  }),
  observado_en: instant,
});
export function ApiM1Read() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description:
        'Acceso observado e historial ID DESC. El rol y la revisión M1 son independientes.',
      schema: read,
    }),
    ...outside(),
  );
}
export function ApiM1Command() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Recibo terminal propio. No concede autoridad actual.',
      schema: receipt,
    }),
    ...[403, 404, 409].map((status) =>
      ApiResponse({
        status,
        description:
          'Rechazo durable o error fuera de recibo; consultar estado y conservar clave.',
        schema: { oneOf: [receipt, fuera] },
      }),
    ),
    ...outside([401, 422, 503]),
  );
}
export function ApiM1Recovery() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Recibo terminal propio, incluso si fue RECHAZADO.',
      schema: receipt,
    }),
    ApiResponse({
      status: 202,
      description: 'SIN_RESULTADO es inconcluso. Conservar clave e intención.',
      headers: { 'Retry-After': { schema: { type: 'string', enum: ['2'] } } },
      schema: object({
        comando_id: { type: 'string', format: 'uuid' },
        estado: { type: 'string', enum: ['SIN_RESULTADO'] },
        resultado: { nullable: true },
        error: { nullable: true },
        finalizado_en: { nullable: true },
      }),
    }),
    ...outside(),
  );
}
function outside(statuses = [401, 403, 404, 422, 503]) {
  return statuses.map((status) =>
    ApiResponse({
      status,
      description:
        status === 503
          ? 'Resultado no determinado. Recuperar con la misma clave; para lectura repetir consulta.'
          : 'Error fuera de recibo.',
      schema: fuera,
    }),
  );
}
