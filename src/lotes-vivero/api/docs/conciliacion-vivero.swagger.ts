import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ESTADOS_HABILITACION_MATERIAL } from '../../domain/enums/estado-habilitacion-material.enum';
import {
  cantidadSchema,
  fechaSchema,
  idSchema,
  objectSchema,
  revisionSchema,
  unidadSchema,
  uuidSchema,
} from '../dto/conciliacion-vivero.dto';

const texto: SchemaObject = { type: 'string' };
const booleano: SchemaObject = { type: 'boolean' };
const instante: SchemaObject = { type: 'string', format: 'date-time' };
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const lista = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const estado: SchemaObject = {
  type: 'string',
  enum: ['FUERA_PADRON', 'PENDIENTE', 'CONFORME', 'INCIDENCIA', 'RETIRADO'],
};
const accion: SchemaObject = {
  type: 'string',
  enum: ['INCLUIR', 'RETIRAR', 'CONCILIAR'],
};
const marca: SchemaObject = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const origen = {
  recoleccion_id: idSchema,
  vivero_id: idSchema,
  codigo_trazabilidad: nullable(texto),
  fecha_recoleccion: fechaSchema,
  revision_captura: revisionSchema,
  revision: revisionSchema,
  en_padron: booleano,
  estado,
  cantidad_inicial: cantidadSchema,
  saldo_actual: cantidadSchema,
  unidad_canonica: unidadSchema,
  saldo_calculado: texto,
  marca_movimientos: marca,
  ultimo_movimiento_en: nullable(fechaSchema),
  trazabilidad_conforme: booleano,
  inconsistencias: lista(texto),
  puede_conciliar: booleano,
};

export const CONCILIACION_PADRON_SCHEMA = objectSchema({
  data: lista(objectSchema(origen)),
  siguiente_antes_de_id: nullable(idSchema),
});
export const CONCILIACION_FICHA_SCHEMA = objectSchema({
  ...origen,
  movimientos: lista(
    objectSchema({
      id: idSchema,
      tipo: texto,
      delta: texto,
      unidad: nullable(texto),
      lote_id: nullable(idSchema),
      evento_id: nullable(idSchema),
      fecha: fechaSchema,
    }),
  ),
  lotes: lista(
    objectSchema({
      id: idSchema,
      vivero_id: idSchema,
      codigo_trazabilidad: texto,
      cantidad_inicial: cantidadSchema,
      unidad: unidadSchema,
      evento_inicio_ids: lista(idSchema),
    }),
  ),
  asignaciones: lista(
    objectSchema({
      id: idSchema,
      lote_id: idSchema,
      subcampania_id: idSchema,
    }),
  ),
  historial: lista(
    objectSchema({
      id: idSchema,
      accion,
      estado,
      actor_id: idSchema,
      revision: revisionSchema,
      motivo: nullable(texto),
      saldo_esperado: nullable(cantidadSchema),
      cantidad_observada: nullable(cantidadSchema),
      unidad_observada: nullable(unidadSchema),
      fecha_comprobacion: nullable(fechaSchema),
      marca_movimientos: nullable(marca),
      inconsistencias: lista(texto),
      registrado_en: instante,
    }),
  ),
  evidencias: lista(
    objectSchema({
      id: idSchema,
      observacion_id: idSchema,
      titulo: nullable(texto),
      mime_type: texto,
    }),
  ),
});
export const CONCILIACION_CARGA_SCHEMA = objectSchema({
  evidencia_ids: lista(idSchema),
  audiencia: { type: 'string', enum: ['PRIVADA'] },
});

export const CONCILIACION_RECIBO_SCHEMA = objectSchema({
  comando_id: uuidSchema,
  estado: {
    type: 'string',
    enum: [
      'CONFIRMADO',
      'INCIDENCIA',
      'RECHAZADO',
      'SIN_RESULTADO',
      'CONFLICTO_CLAVE',
    ],
  },
  resultado: nullable(
    objectSchema({
      accion,
      recoleccion_id: idSchema,
      vivero_id: idSchema,
      evento_id: idSchema,
      actor_id: idSchema,
      revision_anterior: revisionSchema,
      revision_nueva: revisionSchema,
      estado,
      inconsistencias: lista(texto),
    }),
  ),
  error: nullable(objectSchema({ codigo: texto })),
  finalizado_en: nullable(instante),
});

const origenMaterial = {
  recoleccion_id: idSchema,
  vivero_almacenamiento_id: idSchema,
  recolector_id: idSchema,
  codigo_trazabilidad: nullable(texto),
  fecha: fechaSchema,
  planta_id: nullable(idSchema),
  tipo_material: {
    type: 'string',
    enum: ['SEMILLA', 'ESQUEJE'],
  } as SchemaObject,
  nombre_cientifico_snapshot: nullable(texto),
  nombre_comercial_snapshot: nullable(texto),
  variedad_snapshot: nullable(texto),
  estado_registro: { type: 'string', enum: ['VALIDADO'] } as SchemaObject,
  estado_operativo: { type: 'string', enum: ['ABIERTO'] } as SchemaObject,
  saldo_actual: { type: 'number' } as SchemaObject,
  unidad_canonica: unidadSchema,
};
export const ORIGENES_SCHEMA = objectSchema({
  success: { type: 'boolean', enum: [true] },
  data: lista({
    type: 'object',
    required: Object.keys(origenMaterial),
    properties: {
      ...origenMaterial,
      estado_habilitacion: {
        type: 'string',
        enum: [...ESTADOS_HABILITACION_MATERIAL],
        description: 'Incluido al pedir incluir_pendientes=true.',
      },
      puede_consultar_conciliacion: booleano,
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
  }),
  pagination: objectSchema({
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
  }),
});
