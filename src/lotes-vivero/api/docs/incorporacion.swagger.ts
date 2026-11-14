import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const INCORPORACION_RESULTADO_SCHEMA: SchemaObject = {
  oneOf: [
    {
      type: 'object',
      required: ['success', 'estado', 'data'],
      properties: {
        success: { type: 'boolean', enum: [true] },
        estado: { type: 'string', enum: ['CONFIRMADO'] },
        data: {
          type: 'object',
          required: [
            'lote_vivero_id',
            'evento_incorporacion_id',
            'codigo_trazabilidad',
            'cantidad',
            'evidencia_ids_vinculadas',
          ],
          properties: {
            lote_vivero_id: { type: 'string' },
            evento_incorporacion_id: { type: 'string' },
            codigo_trazabilidad: { type: 'string' },
            solicitud_id: { type: 'string', format: 'uuid' },
            vivero_id: { type: 'string' },
            planta_id: { type: 'string' },
            tercero_origen: { type: 'string', nullable: true, maxLength: 200 },
            referencia_documental: {
              type: 'string',
              nullable: true,
              maxLength: 200,
            },
            observaciones: { type: 'string', nullable: true, maxLength: 1000 },
            nombre_cientifico_snapshot: { type: 'string' },
            nombre_comercial_snapshot: { type: 'string' },
            variedad_snapshot: { type: 'string', nullable: true },
            nombre_responsable_snapshot: { type: 'string', nullable: true },
            registrado_en: { type: 'string', format: 'date-time' },
            cantidad: { type: 'integer', minimum: 1 },
            fecha_evento: { type: 'string', format: 'date' },
            modalidad: { type: 'string', enum: ['RECEPCION', 'SALDO_INICIAL'] },
            procedencia: {
              type: 'string',
              enum: ['COMPRA', 'DONACION', 'PRODUCCION_PROPIA', 'DESCONOCIDA'],
            },
            saldo_vivo_antes: { type: 'integer', enum: [0] },
            saldo_vivo_despues: {
              type: 'integer',
              description: 'Saldo inicial confirmado, no saldo actual.',
            },
            evidencia_ids_vinculadas: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    {
      type: 'object',
      required: ['success', 'estado', 'resultado_concluyente'],
      properties: {
        success: { type: 'boolean', enum: [true] },
        estado: { type: 'string', enum: ['SIN_RESULTADO'] },
        resultado_concluyente: { type: 'boolean', enum: [false] },
      },
    },
  ],
};

export const EVIDENCIAS_INCORPORACION_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['success', 'data', 'evidencia_ids'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    evidencia_ids: { type: 'array', items: { type: 'string' } },
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'bucket',
          'ruta_archivo',
          'signed_url',
          'url_expira_en_segundos',
        ],
        properties: {
          id: { type: 'string' },
          bucket: { type: 'string', enum: ['vivero_incorporaciones'] },
          ruta_archivo: { type: 'string' },
          signed_url: { type: 'string', format: 'uri' },
          url_expira_en_segundos: { type: 'integer', enum: [300] },
          mime_type: { type: 'string' },
          tipo_archivo: { type: 'string', enum: ['FOTO'] },
          es_principal: { type: 'boolean' },
          orden: { type: 'integer' },
        },
      },
    },
  },
};

export const ORIGEN_LOTE_SCHEMA: SchemaObject = {
  oneOf: [
    {
      type: 'object',
      required: ['tipo', 'recoleccion_id'],
      properties: {
        tipo: { type: 'string', enum: ['RECOLECCION'] },
        recoleccion_id: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
      },
    },
    {
      type: 'object',
      required: [
        'tipo',
        'evento_id',
        'modalidad',
        'procedencia',
        'cantidad',
        'fecha_evento',
        'historia_previa_no_registrada',
      ],
      properties: {
        tipo: { type: 'string', enum: ['INCORPORACION'] },
        evento_id: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
        modalidad: { type: 'string', enum: ['RECEPCION', 'SALDO_INICIAL'] },
        procedencia: {
          type: 'string',
          enum: ['COMPRA', 'DONACION', 'PRODUCCION_PROPIA', 'DESCONOCIDA'],
        },
        cantidad: { type: 'integer', minimum: 1 },
        fecha_evento: { type: 'string', format: 'date' },
        tercero_origen: { type: 'string', nullable: true },
        referencia_documental: { type: 'string', nullable: true },
        observaciones: { type: 'string', nullable: true },
        historia_previa_no_registrada: { type: 'boolean' },
      },
    },
  ],
};
