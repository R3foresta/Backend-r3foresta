import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'ID de autenticacion del usuario de Supabase',
  required: true,
};

export function ApiCrearCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear campaña',
      description:
        'Crea una campaña con un código de trazabilidad generado automáticamente (CMP-YYYY-NNN). Solo el rol ADMIN puede crear campañas.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiBody({
      schema: {
        type: 'object',
        required: ['nombre', 'tipo'],
        properties: {
          nombre: {
            type: 'string',
            minLength: 3,
            maxLength: 200,
            example: 'Campaña Reforestación Norte 2026',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            nullable: true,
            example: 'Campaña de reforestación en la zona norte del país.',
          },
          tipo: {
            type: 'string',
            enum: ['REFORESTACION', 'ARBORIZACION', 'FORESTACION'],
            example: 'REFORESTACION',
          },
          fecha_estimada_inicio: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '2026-06-01',
          },
          fecha_estimada_fin: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '2026-12-31',
          },
          organizacion_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            example: [1, 2],
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'Campaña creada correctamente.' }),
    ApiResponse({
      status: 400,
      description: 'Datos inválidos o fechas incoherentes.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede crear campañas.',
    }),
    ApiResponse({
      status: 422,
      description: 'Ya existe una campaña con ese nombre.',
    }),
  );
}

export function ApiListarCampanias() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar campañas',
      description:
        'Devuelve todas las campañas activas (deleted_at IS NULL) con estado derivado, conteo de subcampañas y organizaciones asociadas.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiResponse({ status: 200, description: 'Lista de campañas.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
  );
}

export function ApiDetalleCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener detalle de una campaña',
      description:
        'Devuelve el detalle de una campaña con estado derivado, organizaciones y conteo de subcampañas.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiResponse({ status: 200, description: 'Detalle de la campaña.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Campaña no encontrada.' }),
  );
}

export function ApiEditarCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Editar campaña',
      description:
        'Actualiza los campos editables de una campaña. Cambiar tipo es 422 si ya tiene subcampañas. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          nombre: { type: 'string', minLength: 3, maxLength: 200 },
          descripcion: { type: 'string', maxLength: 1000, nullable: true },
          tipo: {
            type: 'string',
            enum: ['REFORESTACION', 'ARBORIZACION', 'FORESTACION'],
          },
          fecha_estimada_inicio: {
            type: 'string',
            format: 'date',
            nullable: true,
          },
          fecha_estimada_fin: {
            type: 'string',
            format: 'date',
            nullable: true,
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Campaña actualizada.' }),
    ApiResponse({
      status: 400,
      description: 'Datos inválidos o fechas incoherentes.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede editar campañas.',
    }),
    ApiResponse({ status: 404, description: 'Campaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'Tipo inmutable (tiene subcampañas) o nombre duplicado.',
    }),
  );
}

export function ApiBorrarCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Eliminar campaña (soft delete)',
      description:
        'Marca la campaña como eliminada. Rechaza la operación si la campaña tiene subcampañas activas. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiResponse({
      status: 200,
      description: 'Campaña eliminada correctamente.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede eliminar campañas.',
    }),
    ApiResponse({ status: 404, description: 'Campaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'La campaña tiene subcampañas activas.',
    }),
  );
}

export function ApiAsociarOrganizaciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Asociar organizaciones a una campaña',
      description: 'Vincula una o más organizaciones a la campaña. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['organizacion_ids'],
        properties: {
          organizacion_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            minItems: 1,
            example: [1, 3],
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Organizaciones asociadas correctamente.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede asociar organizaciones.',
    }),
    ApiResponse({ status: 404, description: 'Campaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'Una o más organizaciones ya están asociadas.',
    }),
  );
}

export function ApiDesasociarOrganizacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Desasociar una organización de una campaña',
      description:
        'Elimina la relación entre la campaña y la organización indicada. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiParam({
      name: 'orgId',
      type: 'integer',
      description: 'ID de la organización',
    }),
    ApiResponse({
      status: 200,
      description: 'Organización desasociada correctamente.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede desasociar organizaciones.',
    }),
    ApiResponse({
      status: 404,
      description: 'Campaña u organización no encontrada en la relación.',
    }),
  );
}
