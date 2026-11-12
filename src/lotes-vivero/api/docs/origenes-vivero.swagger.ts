import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ESTADOS_HABILITACION_MATERIAL } from '../../domain/enums/estado-habilitacion-material.enum';

const texto: SchemaObject = { type: 'string' };
const id: SchemaObject = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
  maxLength: 19,
};
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
const origenMaterial: Record<string, SchemaObject> = {
  recoleccion_id: id,
  vivero_almacenamiento_id: id,
  recolector_id: id,
  codigo_trazabilidad: nullable(texto),
  fecha: { type: 'string', format: 'date' },
  planta_id: nullable(id),
  tipo_material: { type: 'string', enum: ['SEMILLA', 'ESQUEJE'] },
  nombre_cientifico_snapshot: nullable(texto),
  nombre_comercial_snapshot: nullable(texto),
  variedad_snapshot: nullable(texto),
  estado_registro: { type: 'string', enum: ['VALIDADO'] },
  estado_operativo: { type: 'string', enum: ['ABIERTO'] },
  saldo_actual: { type: 'number' },
  unidad_canonica: { type: 'string', enum: ['G', 'UNIDAD'] },
};

export const ORIGENES_SCHEMA = object({
  success: { type: 'boolean', enum: [true] },
  data: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(origenMaterial),
      properties: {
        ...origenMaterial,
        estado_habilitacion: {
          type: 'string',
          enum: [...ESTADOS_HABILITACION_MATERIAL],
          description: 'Incluido al pedir incluir_pendientes=true.',
        },
        motivo_no_inicio: {
          ...nullable(texto),
          description:
            'Incluido al pedir incluir_requisitos_inicio=true. Nulo cuando el origen reúne los requisitos previos de INICIO.',
        },
        saldo_actual_exacto: {
          type: 'string',
          pattern: '^[0-9]+(\\.[0-9]+)?$',
          description:
            'Saldo en texto decimal, incluido al pedir incluir_requisitos_inicio=true.',
        },
      },
    },
  },
  pagination: object({
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
  }),
});
