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

export function ApiCrearSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear subcampaña',
      description:
        'Crea una subcampaña en estado BORRADOR. El tipo se hereda automáticamente desde la campaña padre. Genera un código de trazabilidad SUB-NNN-CMP-YYYY-NNN. Solo el rol ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiBody({
      schema: {
        type: 'object',
        required: ['campania_id', 'nombre', 'zona_id', 'meta_total_arboles'],
        properties: {
          campania_id: { type: 'integer', minimum: 1, example: 1 },
          nombre: {
            type: 'string',
            minLength: 3,
            maxLength: 200,
            example: 'Subcampaña Lote A',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            nullable: true,
          },
          zona_id: { type: 'integer', minimum: 1, example: 12 },
          meta_total_arboles: { type: 'integer', minimum: 1, example: 500 },
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
          tolerancia_gps_metros: {
            type: 'integer',
            minimum: 1,
            nullable: true,
            example: 50,
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Subcampaña creada correctamente.',
    }),
    ApiResponse({ status: 400, description: 'Datos inválidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede crear subcampañas.',
    }),
    ApiResponse({ status: 404, description: 'Campaña padre no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'Conflicto de unicidad al crear.',
    }),
  );
}

export function ApiListarSubcampanias() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar subcampañas',
      description:
        'Devuelve todas las subcampañas activas (deleted_at IS NULL). Soporta filtros por campania_id, estado y zona_id.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiQuery({ name: 'campania_id', required: false, type: 'integer' }),
    ApiQuery({ name: 'estado', required: false, type: 'string' }),
    ApiQuery({ name: 'zona_id', required: false, type: 'integer' }),
    ApiResponse({ status: 200, description: 'Lista de subcampañas.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
  );
}

export function ApiDetalleSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener detalle de una subcampaña',
      description:
        'Devuelve la subcampaña con contadores materializados, polígono como GeoJSON, equipo completo y snapshots.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({ status: 200, description: 'Detalle de la subcampaña.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
  );
}

export function ApiEditarSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Editar subcampaña',
      description:
        'Edita una subcampaña. Los campos permitidos dependen del estado actual: BORRADOR (nombre, descripcion, zona_id, meta_total_arboles, fechas, tolerancia), ACTIVA (descripcion, fecha_fin, tolerancia), COMPLETADA/FINALIZADA_PARCIAL (solo observaciones_cierre). Nunca editable: tipo, campania_id, codigo_trazabilidad, polígono (endpoint separado). Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          nombre: { type: 'string', minLength: 3, maxLength: 200 },
          descripcion: { type: 'string', maxLength: 1000, nullable: true },
          zona_id: { type: 'integer', minimum: 1 },
          meta_total_arboles: { type: 'integer', minimum: 1 },
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
          tolerancia_gps_metros: { type: 'integer', minimum: 1 },
          observaciones_cierre: { type: 'string', maxLength: 2000 },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Subcampaña actualizada.' }),
    ApiResponse({ status: 400, description: 'Datos inválidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede editar subcampañas.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'Campos no editables en el estado actual.',
    }),
  );
}

export function ApiSetearPoligono() {
  return applyDecorators(
    ApiOperation({
      summary: 'Setear/reemplazar el polígono de una subcampaña',
      description:
        'Persiste un polígono GeoJSON en SRID 4326 y calcula area_hectareas. Solo permitido en estado BORRADOR. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['poligono'],
        properties: {
          poligono: {
            type: 'object',
            required: ['type', 'coordinates'],
            properties: {
              type: { type: 'string', enum: ['Polygon'] },
              coordinates: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {
                    type: 'array',
                    items: { type: 'number' },
                  },
                },
              },
            },
            example: {
              type: 'Polygon',
              coordinates: [
                [
                  [-65.1, -19.0],
                  [-65.1, -19.1],
                  [-65.0, -19.1],
                  [-65.0, -19.0],
                  [-65.1, -19.0],
                ],
              ],
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Polígono actualizado correctamente.',
    }),
    ApiResponse({
      status: 400,
      description: 'GeoJSON inválido o malformado.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede setear el polígono.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'La subcampaña no está en estado BORRADOR.',
    }),
  );
}

export function ApiActivarSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Activar subcampaña',
      description:
        'Transiciona BORRADOR → ACTIVA. Requiere polígono presente, coordinador asignado y meta_total_arboles > 0. Congela los snapshots de zona, coordinador y organizaciones. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({
      status: 201,
      description: 'Subcampaña activada correctamente.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede activar subcampañas.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description:
        'Pre-condiciones no satisfechas (polígono, coordinador, meta) o transición inválida.',
    }),
  );
}

export function ApiCerrarSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cerrar subcampaña',
      description:
        'Transiciona ACTIVA → COMPLETADA o FINALIZADA_PARCIAL. Setea fase_mantenimiento=MANTENIMIENTO_ACTIVO. Para FINALIZADA_PARCIAL, motivo_cierre_parcial es obligatorio. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'object',
        required: [
          'estado_final',
          'fecha_cierre_operativo',
          'fecha_fin_mantenimiento',
        ],
        properties: {
          estado_final: {
            type: 'string',
            enum: ['COMPLETADA', 'FINALIZADA_PARCIAL'],
          },
          fecha_cierre_operativo: {
            type: 'string',
            format: 'date-time',
            example: '2026-12-01T00:00:00Z',
          },
          fecha_fin_mantenimiento: {
            type: 'string',
            format: 'date',
            example: '2029-12-01',
          },
          motivo_cierre_parcial: {
            type: 'string',
            enum: [
              'FALTA_STOCK',
              'PROBLEMAS_CLIMATICOS',
              'CANCELACION_CONVENIO',
              'CONFLICTO_SOCIAL',
              'ACCESO_RESTRINGIDO',
              'CAMBIO_PRIORIDAD_INSTITUCIONAL',
              'RIESGO_OPERATIVO',
              'META_REDEFINIDA',
              'CIERRE_ADMINISTRATIVO',
              'OTRO',
            ],
          },
          observaciones_cierre: {
            type: 'string',
            maxLength: 2000,
            nullable: true,
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Subcampaña cerrada correctamente.',
    }),
    ApiResponse({ status: 400, description: 'Datos inválidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede cerrar subcampañas.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description:
        'Transición inválida o motivo requerido para cierre parcial.',
    }),
  );
}

export function ApiBorrarSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Eliminar subcampaña (soft delete)',
      description:
        'Soft delete. Solo permitido si la subcampaña está en estado BORRADOR. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({
      status: 200,
      description: 'Subcampaña eliminada correctamente.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede eliminar subcampañas.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'La subcampaña no está en estado BORRADOR.',
    }),
  );
}

export function ApiListarEquipo() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar miembros del equipo de una subcampaña',
      description:
        'Devuelve la lista de miembros del equipo con su rol y datos del usuario.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({ status: 200, description: 'Miembros del equipo.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
  );
}

export function ApiAgregarMiembrosEquipo() {
  return applyDecorators(
    ApiOperation({
      summary: 'Agregar uno o más miembros al equipo de una subcampaña',
      description:
        'Recibe un arreglo de miembros `[{ usuario_id, rol }, ...]` (de 1 a N). ' +
        'La inserción es atómica: si alguno falla, no se agrega ninguno. ' +
        'Solo puede existir un único COORDINADOR por subcampaña (constraint DB + pre-chequeo). ' +
        'No se admiten `usuario_id` repetidos en el mismo payload. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['usuario_id', 'rol'],
          properties: {
            usuario_id: { type: 'integer', minimum: 1, example: 7 },
            rol: { type: 'string', enum: ['COORDINADOR', 'OPERARIO'] },
          },
        },
        example: [
          { usuario_id: 13, rol: 'OPERARIO' },
          { usuario_id: 14, rol: 'OPERARIO' },
          { usuario_id: 15, rol: 'COORDINADOR' },
        ],
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Miembros agregados correctamente.',
    }),
    ApiResponse({ status: 400, description: 'Datos inválidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede agregar miembros.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description:
        'Más de un COORDINADOR en el payload, coordinador ya existente, usuarios duplicados, o alguno ya pertenece al equipo.',
    }),
  );
}

export function ApiQuitarMiembroEquipo() {
  return applyDecorators(
    ApiOperation({
      summary: 'Quitar miembro del equipo de una subcampaña',
      description:
        'Elimina un usuario del equipo. No permite quitar al coordinador si la subcampaña está ACTIVA. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiParam({ name: 'usuarioId', type: 'integer' }),
    ApiResponse({
      status: 200,
      description: 'Miembro quitado correctamente.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede quitar miembros.',
    }),
    ApiResponse({
      status: 404,
      description: 'Subcampaña o miembro no encontrado.',
    }),
    ApiResponse({
      status: 422,
      description:
        'No se puede quitar al coordinador con la subcampaña activa.',
    }),
  );
}
