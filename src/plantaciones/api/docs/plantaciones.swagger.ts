import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'ID de autenticacion del usuario de Supabase',
  required: true,
};

export function ApiCrearEvidenciaPendientePlantacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear evidencias pendientes para REGISTRO_PLANTACION',
      description:
        'Sube fotos y crea evidencias con entidad_id=0 para el tipo REGISTRO_PLANTACION. Luego sus IDs se envian en POST /registros-plantacion para que la RPC fn_m3_registrar_plantacion las vincule atomicamente al registro.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description:
        'Datos y archivos de evidencia pendiente del registro de plantacion',
      schema: {
        type: 'object',
        required: ['fotos'],
        properties: {
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
          metadata: {
            type: 'string',
            example: '{"fuente":"app-mobile","modulo":"plantaciones"}',
            description: 'Objeto JSON serializado como texto',
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
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
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
      summary:
        'Registrar plantacion (M3) generando DESPACHO automatico atomico',
      description:
        'Llama a la RPC fn_m3_registrar_plantacion. En una sola transaccion: valida subcampania ACTIVA, GPS contra poligono, equipo (responsable + coresponsables), asignaciones (proposito coherente, saldo) y EMBOLSADO previo de los lotes. Inserta REGISTRO_PLANTACION + DETALLE + CORESPONSABLES; por cada lote inserta evento DESPACHO con origen_despacho=AUTOMATICO_PLANTACION y destino_tipo=PLANTACION_CAMPANIA; descuenta saldos y vincula evidencias.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiBody({
      description: 'Datos del registro de plantacion',
      schema: {
        type: 'object',
        required: [
          'subcampania_id',
          'fecha_plantacion',
          'latitud',
          'longitud',
          'detalles',
          'evidencia_ids',
        ],
        properties: {
          subcampania_id: { type: 'integer', example: 1, minimum: 1 },
          es_reposicion: { type: 'boolean', example: false, default: false },
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
        'Plantacion registrada. Devuelve registro_plantacion_id, codigo_trazabilidad y la lista de despachos generados.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Validacion fallida: subcampania no ACTIVA, GPS no evaluable, responsable o coresponsable fuera del equipo, saldo de asignacion o de lote insuficiente, lote sin EMBOLSADO previo, etc.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 403, description: 'Rol global insuficiente' }),
    ApiResponse({
      status: 404,
      description: 'Usuario o subcampania no encontrada',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}
