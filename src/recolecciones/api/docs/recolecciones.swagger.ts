import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { TIPOS_MATERIAL_RECOLECCION_INPUT } from '../dto/create-recoleccion.dto';
import { FUENTES_UBICACION } from '../dto/create-ubicacion.dto';
import { RejectValidationDto } from '../dto/reject-validation.dto';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'ID de autenticación del usuario de Supabase',
  required: true,
};

const USER_ROLE_HEADER = {
  name: 'x-user-role',
  description: 'Rol del usuario (ADMIN, GENERAL, VALIDADOR, VOLUNTARIO)',
  required: true,
};

const VALIDATOR_ROLE_HEADER = {
  name: 'x-user-role',
  description: 'Rol del usuario (VALIDADOR o ADMIN)',
  required: true,
};

const ELEGIBILIDAD_QUERY_DESCRIPTION =
  'Cantidad a evaluar contra el saldo materializado para determinar elegibilidad hacia vivero.';

const commonListQueries = [
  ApiQuery({ name: 'page', required: false, type: Number }),
  ApiQuery({ name: 'limit', required: false, type: Number }),
  ApiQuery({ name: 'fecha_inicio', required: false, type: String }),
  ApiQuery({ name: 'fecha_fin', required: false, type: String }),
  ApiQuery({ name: 'search', required: false, type: String }),
];

const tipoMaterialQuery = ApiQuery({
  name: 'tipo_material',
  required: false,
  enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
});

const cantidadSolicitadaViveroQuery = ApiQuery({
  name: 'cantidad_solicitada_vivero',
  required: false,
  type: Number,
  description: ELEGIBILIDAD_QUERY_DESCRIPTION,
});

export function ApiCreateRecoleccion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear nueva recolección (Canónica)',
      description:
        'Crea una recolección bajo la verdad canónica del módulo (sin campos legacy). Se crea en estado BORRADOR.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Datos canónicos de la recolección (FormData)',
      schema: {
        type: 'object',
        required: [
          'fecha',
          'cantidad_inicial_canonica',
          'unidad_canonica',
          'tipo_material',
          'planta_id',
          'metodo_id',
          'ubicacion[latitud]',
          'ubicacion[longitud]',
          'fotos',
        ],
        properties: {
          fecha: { type: 'string', format: 'date', example: '2026-03-04' },
          cantidad_inicial_canonica: { type: 'number', example: 250 },
          unidad_canonica: {
            type: 'string',
            enum: ['KG', 'G', 'UNIDAD'],
            example: 'G',
          },
          tipo_material: {
            type: 'string',
            enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
            example: 'SEMILLA',
          },
          planta_id: { type: 'number', example: 10 },
          metodo_id: { type: 'number', example: 1 },
          vivero_id: { type: 'number', example: 3 },
          observaciones: {
            type: 'string',
            example: 'Registro canónico de recolección',
          },
          'ubicacion[pais_id]': { type: 'number', example: 1 },
          'ubicacion[division_id]': { type: 'number', example: 999 },
          'ubicacion[nombre]': { type: 'string', example: 'Parcela Don Lucho' },
          'ubicacion[referencia]': { type: 'string', example: 'Zona Sur' },
          'ubicacion[latitud]': { type: 'number', example: -16.5833 },
          'ubicacion[longitud]': { type: 'number', example: -68.15 },
          'ubicacion[precision_m]': { type: 'number', example: 10 },
          'ubicacion[fuente]': {
            type: 'string',
            enum: [...FUENTES_UBICACION],
            example: 'GPS_MOVIL',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Recolección creada exitosamente en estado BORRADOR',
    }),
    ApiResponse({ status: 400, description: 'Error de validación en los datos' }),
    ApiResponse({
      status: 401,
      description: 'No autorizado - falta header x-auth-id',
    }),
    ApiResponse({ status: 403, description: 'Prohibido - usuario sin permisos' }),
    ApiResponse({ status: 404, description: 'Recurso no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiUpdateDraftRecoleccion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Editar borrador de recolección',
      description:
        'Permite editar una recolección en BORRADOR o RECHAZADO. Si estaba RECHAZADO, vuelve a BORRADOR.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader({ ...AUTH_ID_HEADER, description: 'ID de autenticación del usuario' }),
    ApiHeader(USER_ROLE_HEADER),
    ApiConsumes('application/json', 'multipart/form-data'),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          fecha: { type: 'string', format: 'date', example: '2026-03-04' },
          cantidad_inicial_canonica: { type: 'number', example: 250 },
          unidad_canonica: {
            type: 'string',
            enum: ['KG', 'G', 'UNIDAD'],
            example: 'G',
          },
          tipo_material: {
            type: 'string',
            enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
            example: 'SEMILLA',
          },
          observaciones: { type: 'string', example: 'Actualización de datos' },
          vivero_id: { type: 'number', example: 3 },
          metodo_id: { type: 'number', example: 1 },
          planta_id: { type: 'number', example: 10 },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Borrador actualizado exitosamente' }),
    ApiResponse({ status: 400, description: 'Estado no permite edición' }),
    ApiResponse({ status: 403, description: 'Sin permisos para editar' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}

export function ApiSubmitRecoleccionValidation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Enviar recolección a validación',
      description:
        'Cambia el estado de BORRADOR a PENDIENTE_VALIDACION. Solo el creador o ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader({ ...AUTH_ID_HEADER, description: 'ID de autenticación del usuario' }),
    ApiHeader({
      name: 'x-user-role',
      description: 'Rol del usuario',
      required: true,
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiResponse({ status: 200, description: 'Recolección enviada a validación' }),
    ApiResponse({ status: 400, description: 'Estado no permite envío a validación' }),
    ApiResponse({ status: 403, description: 'Sin permisos' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}

export function ApiApproveRecoleccionValidation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Aprobar validación de recolección',
      description:
        'Cambia PENDIENTE_VALIDACION -> VALIDADO. Solo VALIDADOR o ADMIN. Ejecuta Pinata + Blockchain.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader({ ...AUTH_ID_HEADER, description: 'ID de autenticación del usuario' }),
    ApiHeader(VALIDATOR_ROLE_HEADER),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiResponse({
      status: 200,
      description: 'Recolección validada y minteada en blockchain',
    }),
    ApiResponse({ status: 400, description: 'Estado no permite aprobación' }),
    ApiResponse({ status: 403, description: 'Sin permisos de validador' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}

export function ApiRejectRecoleccionValidation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Rechazar validación de recolección',
      description:
        'Cambia PENDIENTE_VALIDACION -> RECHAZADO. Solo VALIDADOR o ADMIN. Requiere motivo.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader({ ...AUTH_ID_HEADER, description: 'ID de autenticación del usuario' }),
    ApiHeader(VALIDATOR_ROLE_HEADER),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiBody({ type: RejectValidationDto }),
    ApiResponse({ status: 200, description: 'Recolección rechazada' }),
    ApiResponse({ status: 400, description: 'Estado no permite rechazo' }),
    ApiResponse({ status: 403, description: 'Sin permisos de validador' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}

export function ApiFindPendingValidationRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar recolecciones pendientes de validación',
      description:
        'Devuelve recolecciones en estado PENDIENTE_VALIDACION con filtros y paginación. Usuarios con rol VALIDADOR o ADMIN ven TODAS las recolecciones pendientes, otros roles solo ven las suyas.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader({ ...AUTH_ID_HEADER, description: 'ID de autenticación del usuario' }),
    ApiHeader(USER_ROLE_HEADER),
    ...commonListQueries,
    cantidadSolicitadaViveroQuery,
    ApiResponse({
      status: 200,
      description: 'Lista de recolecciones pendientes de validación',
    }),
    ApiResponse({ status: 400, description: 'Header x-user-role es requerido' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id es requerido' }),
  );
}

export function ApiFindAllRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar recolecciones del usuario',
      description: 'Obtiene recolecciones con filtros opcionales y paginación.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ...commonListQueries,
    tipoMaterialQuery,
    ApiQuery({ name: 'vivero_id', required: false, type: Number }),
    cantidadSolicitadaViveroQuery,
  );
}

export function ApiFindByViveroRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar recolecciones por vivero',
      description:
        'Devuelve recolecciones del vivero con saldo materializado, estado operativo y elegibilidad para inicio de lote de vivero.',
    }),
    ApiParam({ name: 'viveroId', type: Number, description: 'ID del vivero' }),
    ...commonListQueries,
    tipoMaterialQuery,
    cantidadSolicitadaViveroQuery,
  );
}

export function ApiFindOneRecoleccion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener detalle de recolección',
      description:
        'Devuelve saldo actual, estado operativo y elegibilidad para uso como origen de vivero.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    cantidadSolicitadaViveroQuery,
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}
