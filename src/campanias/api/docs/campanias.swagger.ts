import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
        'Actualiza los campos editables de una campaña (nombre, descripción, fechas). Cambiar tipo devuelve 422 si existe cualquier subcampaña asociada, incluidas soft-deleted (RN-PLA-38). Solo ADMIN.',
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
      description:
        'Tipo inmutable (tiene subcampañas asociadas, incluso soft-deleted) o nombre duplicado.',
    }),
  );
}

export function ApiBorrarCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Eliminar campaña (soft delete)',
      description:
        'Marca la campaña como eliminada (soft-delete). Permitido si no hay subcampañas asociadas o si todas las subcampañas vivas están en estado CANCELADA (RN-PLA-38). Solo ADMIN.',
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
      description:
        'La campaña tiene subcampañas no canceladas (BORRADOR, ACTIVA, COMPLETADA, FINALIZADA_PARCIAL o PAUSADA).',
    }),
  );
}

export function ApiDesactivacionCampaniaPreview() {
  return applyDecorators(
    ApiOperation({
      summary: 'Previsualizar desactivación masiva de una campaña',
      description:
        'Evalúa si todas las subcampañas vivas pueden cancelarse sin plantaciones y resume subcampañas, asignaciones y unidades que volverían al vivero. No modifica datos. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiResponse({
      status: 200,
      description:
        'Previsualización calculada. elegible=false se devuelve como respuesta válida con bloqueos estructurados.',
      schema: {
        example: {
          success: true,
          data: {
            campania_id: 15,
            elegible: true,
            subcampanias_vivas: 20,
            subcampanias_a_cancelar: 20,
            borradores: 18,
            activas_sin_plantar: 2,
            ya_canceladas: 0,
            asignaciones_con_saldo: 3,
            unidades_a_devolver: 450,
            bloqueos: [],
          },
        },
      },
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede previsualizar la operación.',
    }),
    ApiResponse({
      status: 404,
      description: 'Campaña no encontrada o ya desactivada.',
    }),
  );
}

export function ApiDesactivarCampaniaMasivamente() {
  return applyDecorators(
    ApiOperation({
      summary: 'Desactivar campaña y cancelar subcampañas sin plantaciones',
      description:
        'En una única transacción bloquea la campaña y sus subcampañas vivas, revalida elegibilidad, cancela BORRADOR/ACTIVA sin plantaciones mediante RN-PLA-37, devuelve físicamente el saldo asignado al vivero y aplica soft-delete a la campaña. DELETE /campanias/:id conserva su comportamiento estricto. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['motivo'],
        properties: {
          motivo: {
            type: 'string',
            minLength: 3,
            maxLength: 1000,
            example: 'Limpieza de campañas creadas por pruebas automatizadas',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Campaña desactivada atómicamente.',
      schema: {
        example: {
          success: true,
          data: {
            message: 'Campaña desactivada correctamente.',
            campania_id: 15,
            deleted_at: '2026-07-23T18:00:00.000Z',
            subcampanias_canceladas: 20,
            asignaciones_devueltas: 3,
            unidades_devueltas: 450,
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Motivo ausente, vacío o fuera de 3–1000 caracteres.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede ejecutar la operación.',
    }),
    ApiResponse({
      status: 404,
      description: 'Campaña no encontrada o ya desactivada.',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflicto concurrente o fallo durante la cancelación/devolución. La transacción se revierte.',
    }),
    ApiResponse({
      status: 422,
      description:
        'Existe al menos una subcampaña con plantaciones o estado no elegible.',
    }),
    ApiResponse({
      status: 500,
      description:
        'Migración no aplicada o SUPABASE_SERVICE_ROLE_KEY no configurada.',
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

export function ApiMetricsCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Métricas agregadas de una campaña',
      description:
        'Devuelve métricas para el dashboard: supervivencia, hectáreas, comunidades, eventos, última actividad y CO2 proyectado (placeholder MVP).',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiResponse({ status: 200, description: 'Métricas de la campaña.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Campaña no encontrada.' }),
  );
}

export function ApiResumenGlobalCampanias() {
  return applyDecorators(
    ApiOperation({
      summary: 'Resumen global de campañas para el dashboard',
      description:
        'Agrega campañas vigentes y sus subcampañas no eliminadas. Plantados y avance usan plantación inicial; supervivencia incluye reposiciones. Los porcentajes están entre 0 y 100.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiResponse({
      status: 200,
      description: 'Resumen global calculado correctamente.',
      schema: {
        example: {
          success: true,
          data: {
            arboles_plantados_total: 12500,
            avance_meta_pct: 80,
            supervivencia_pct: 88,
            hectareas_total: 42.75,
            campanias_activas: 3,
            campanias_totales: 5,
            subcampanias_activas: 8,
            subcampanias_totales: 12,
          },
        },
      },
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 400, description: 'Error al consultar métricas.' }),
  );
}

export function ApiActivityCampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Actividad reciente de una campaña',
      description:
        'Devuelve los eventos recientes de una campaña (plantaciones, activaciones, cancelaciones, cambios de coordinador, nuevas subcampañas) ordenados por timestamp descendente.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer', description: 'ID de la campaña' }),
    ApiQuery({
      name: 'limit',
      type: 'integer',
      required: false,
      description: 'Cantidad máxima de eventos (default 5, rango 1..50).',
    }),
    ApiResponse({ status: 200, description: 'Lista de eventos recientes.' }),
    ApiResponse({
      status: 400,
      description: 'limit fuera de rango.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Campaña no encontrada.' }),
  );
}
