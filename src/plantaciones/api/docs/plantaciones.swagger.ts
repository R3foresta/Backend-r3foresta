import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'Alias opcional del sub del JWT verificado; debe coincidir.',
  required: false,
};

export function ApiCrearEvidenciaPendientePlantacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear evidencias privadas pendientes de reposición interna',
      description:
        'Bearer JWT obligatorio. Requiere rol interno, equipo y subcampania_id + es_reposicion:true. Original privado y JPEG sanitizado, propiedad estricta también para ADMIN. Inicial usa cargas v1; contrato anterior responde 409 CLIENTE_INCOMPATIBLE antes de Storage.',
    }),
    ApiHeader(AUTH_ID_HEADER),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description:
        'Datos y archivos de evidencia pendiente del registro de plantacion',
      schema: {
        type: 'object',
        required: ['subcampania_id', 'es_reposicion', 'fotos'],
        properties: {
          subcampania_id: { type: 'integer', minimum: 1 },
          es_reposicion: { type: 'boolean', enum: [true] },
          titulo: {
            type: 'string',
            maxLength: 120,
            example: 'Plantacion sector A',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            example: 'Fotos del grupo plantado en la subcampania',
          },
          tomado_en: {
            type: 'string',
            format: 'date-time',
            example: '2026-05-24T10:00:00Z',
          },
          es_principal: {
            type: 'boolean',
            example: true,
            description: 'Indica si esta foto es la principal del registro',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Archivos de imagen (max 10)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Evidencias pendientes creadas. Usar evidencia_ids en POST /registros-plantacion.',
    }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o formato de archivo no permitido',
    }),
    ApiResponse({
      status: 401,
      description: 'Bearer JWT ausente/inválido o header discordante',
    }),
    ApiResponse({
      status: 409,
      description:
        'CLIENTE_INCOMPATIBLE: contrato inicial o upload sin ámbito/propósito',
    }),
    ApiResponse({
      status: 404,
      description: 'Falta tipo_entidad_evidencia REGISTRO_PLANTACION',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarPlantacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar reposición interna consumiendo stock asignado (M3)',
      description:
        'Solo es_reposicion:true; inicial legada responde 409 CLIENTE_INCOMPATIBLE. Conserva rol ADMIN/GENERAL/VALIDADOR, equipo COORDINADOR/OPERARIO y estado ACTIVA/COMPLETADA/FINALIZADA_PARCIAL. La RPC comprueba origen inicial del mismo ámbito y evidencias propias privadas del mismo propósito antes de consumir stock M3. No vuelve a descontar Vivero.',
    }),
    ApiHeader(AUTH_ID_HEADER),
    ApiBody({
      description: 'Datos del registro de plantacion',
      schema: {
        type: 'object',
        required: [
          'subcampania_id',
          'es_reposicion',
          'registro_plantacion_origen_id',
          'fecha_plantacion',
          'latitud',
          'longitud',
          'detalles',
          'evidencia_ids',
        ],
        properties: {
          subcampania_id: { type: 'integer', example: 1, minimum: 1 },
          es_reposicion: { type: 'boolean', enum: [true], example: true },
          registro_plantacion_origen_id: {
            type: 'integer',
            nullable: true,
            description:
              'Obligatorio si es_reposicion=true. Referencia el grupo origen al que se le repone material.',
            example: null,
          },
          fecha_plantacion: {
            type: 'string',
            format: 'date',
            example: '2026-05-24',
          },
          latitud: { type: 'number', example: -16.5 },
          longitud: { type: 'number', example: -68.15 },
          observaciones: { type: 'string', maxLength: 2000, nullable: true },
          coresponsable_ids: {
            type: 'array',
            items: { type: 'integer' },
            description:
              'Usuarios adicionales (subset del SUBCAMPANIA_EQUIPO).',
            example: [],
          },
          detalles: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: [
                'asignacion_id',
                'lote_vivero_id',
                'planta_id',
                'cantidad',
              ],
              properties: {
                asignacion_id: { type: 'integer', example: 12 },
                lote_vivero_id: { type: 'integer', example: 7 },
                planta_id: { type: 'integer', example: 3 },
                cantidad: { type: 'integer', minimum: 1, example: 50 },
              },
            },
          },
          evidencia_ids: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 1,
            description:
              'IDs de evidencias previamente subidas via POST /registros-plantacion/evidencias-pendientes.',
            example: [101, 102],
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Plantacion registrada. Devuelve registro_plantacion_id, codigo_trazabilidad, cantidad_total_plantada y `consumos` (por asignacion: cantidad_consumida, saldo_asignado_antes/despues y estado_final). No devuelve despachos: plantar no genera eventos M2.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Validacion fallida: estado de subcampania incompatible, GPS no evaluable, responsable o coresponsable fuera del equipo, saldo asignado insuficiente, proposito incoherente, especie fuera del plan, reposicion mayor al pendiente del grupo origen, etc.',
    }),
    ApiResponse({
      status: 401,
      description: 'Bearer JWT ausente/inválido o header discordante',
    }),
    ApiResponse({
      status: 409,
      description:
        'CLIENTE_INCOMPATIBLE: contrato inicial o upload sin ámbito/propósito',
    }),
    ApiResponse({ status: 403, description: 'Rol global insuficiente' }),
    ApiResponse({
      status: 404,
      description: 'Usuario o subcampania no encontrada',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiDescartarEvidenciasPendientesPlantacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Descartar evidencias pendientes de REGISTRO_PLANTACION',
      description:
        'Marca como eliminadas evidencias pendientes (entidad_id NULL/0) de tipo REGISTRO_PLANTACION y elimina sus archivos de Storage. Es idempotente: los IDs inexistentes, ya eliminados, ya vinculados o no pertenecientes al usuario se devuelven como ignorados.',
    }),
    ApiHeader(AUTH_ID_HEADER),
    ApiBody({
      description:
        'IDs devueltos por POST /registros-plantacion/evidencias-pendientes que deben descartarse porque el registro fue cancelado o no se completara.',
      schema: {
        type: 'object',
        required: ['subcampania_id', 'es_reposicion', 'evidencia_ids'],
        properties: {
          subcampania_id: { type: 'integer', minimum: 1 },
          es_reposicion: { type: 'boolean', enum: [true] },
          evidencia_ids: {
            type: 'array',
            minItems: 1,
            items: { type: 'integer', minimum: 1 },
            example: [101, 102],
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description:
        'Evidencias pendientes descartadas. Devuelve evidencia_ids_descartadas y evidencia_ids_ignoradas.',
    }),
    ApiResponse({ status: 400, description: 'IDs invalidos' }),
    ApiResponse({
      status: 401,
      description: 'Bearer JWT ausente/inválido o header discordante',
    }),
    ApiResponse({
      status: 409,
      description:
        'CLIENTE_INCOMPATIBLE: contrato inicial o upload sin ámbito/propósito',
    }),
    ApiResponse({ status: 403, description: 'Rol global insuficiente' }),
    ApiResponse({
      status: 404,
      description:
        'Usuario no encontrado o falta tipo_entidad_evidencia REGISTRO_PLANTACION',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}
