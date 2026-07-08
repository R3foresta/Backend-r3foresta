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
        'Transiciona BORRADOR → ACTIVA. Requiere polígono presente, coordinador asignado, meta_total_arboles > 0 y plan de metas por especie completo (≥1 especie, SUM(porcentaje_objetivo)=100 y SUM(cantidad_objetivo)=meta_total_arboles). Se permite activar con 0% de stock asignado (RN-PLA-09). Congela snapshots de zona, coordinador y organizaciones. Registra SUBCAMPANIA_ACTIVADA en historial. Solo ADMIN.',
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

export function ApiCancelarSubcampania() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancelar subcampaña (BORRADOR o ACTIVA sin plantar)',
      description:
        'Transiciona la subcampaña a CANCELADA (RN-PLA-37). Aplica a BORRADOR y a ACTIVA cuando total_plantado_inicial = 0. Motivo obligatorio (texto libre). Setea deleted_at/deleted_by (inactivación, no borrado físico), DEVUELVE FÍSICAMENTE el saldo disponible de todas las asignaciones activas al vivero (RN-VIV-48: aumenta LOTE_VIVERO.saldo_vivo_actual y registra eventos M2 DEVOLUCION_PLANTACION + M3 DEVOLUCION_A_VIVERO con motivo CIERRE_SUBCAMPANIA) y registra SUBCAMPANIA_CANCELADA en el historial. Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['motivo'],
        properties: {
          motivo: {
            type: 'string',
            minLength: 3,
            maxLength: 1000,
            example:
              'Se descarta la subcampaña por cambio de prioridad institucional.',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Subcampaña cancelada correctamente.',
    }),
    ApiResponse({
      status: 400,
      description: 'Motivo faltante o datos inválidos.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede cancelar subcampañas.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 409,
      description:
        'Ya existen plantaciones (total_plantado_inicial > 0) — usar cierre FINALIZADA_PARCIAL — o la subcampaña ya está cerrada/cancelada.',
    }),
  );
}

export function ApiObtenerPlan() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener plan de metas por especie',
      description:
        'Devuelve el plan (SUBCAMPANIA_META_ESPECIE) de la subcampaña: filas con planta_id, porcentaje_objetivo y cantidad_objetivo. Vacío si aún no se cargó.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({ status: 200, description: 'Plan de metas por especie.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
  );
}

export function ApiGuardarPlan() {
  return applyDecorators(
    ApiOperation({
      summary: 'Guardar (reemplazo bulk) plan de metas por especie',
      description:
        'Sustituye todo el plan de la subcampaña por el arreglo enviado. Solo permitido en estado BORRADOR (RN-PLA-17). Cada planta aparece una vez, porcentaje ∈ (0, 100], cantidad > 0. La consistencia total (SUM(%)=100, SUM(cantidad)=meta_total) se verifica al activar (RN-PLA-16). Solo ADMIN.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['metas'],
        properties: {
          metas: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: [
                'planta_id',
                'porcentaje_objetivo',
                'cantidad_objetivo',
              ],
              properties: {
                planta_id: { type: 'integer', minimum: 1, example: 3 },
                porcentaje_objetivo: {
                  type: 'number',
                  minimum: 0.01,
                  maximum: 100,
                  example: 40,
                },
                cantidad_objetivo: {
                  type: 'integer',
                  minimum: 1,
                  example: 200,
                },
              },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Plan guardado correctamente.' }),
    ApiResponse({ status: 400, description: 'Datos inválidos.' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description: 'Solo el rol ADMIN puede editar el plan.',
    }),
    ApiResponse({ status: 404, description: 'Subcampaña no encontrada.' }),
    ApiResponse({
      status: 422,
      description: 'Estado ≠ BORRADOR o planta_id repetido en el payload.',
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
        'Devuelve la lista de miembros del equipo con su rol, nombre del usuario y foto_perfil_url.',
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
        'No se admiten `usuario_id` repetidos en el mismo payload. Devuelve los miembros agregados hidratados con `nombre_usuario` y `foto_perfil_url`. Solo ADMIN.',
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

export function ApiPlantacionContext() {
  return applyDecorators(
    ApiOperation({
      summary: 'Contexto para registrar plantación inicial desde campo',
      description:
        'Devuelve en una sola llamada todo lo necesario para registrar una plantación inicial: subcampaña (con polígono GeoJSON), permisos del usuario, equipo, plan por especie con avance, stock asignado disponible (asignaciones ACTIVA con propósito PLANTACION_INICIAL, con orden de consumo FIFO resuelto: fecha_asignacion ASC, asignacion_id ASC) y reglas operativas. Requiere pertenecer al equipo como COORDINADOR u OPERARIO (aplica también a ADMIN) y que la subcampaña esté ACTIVA.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: 'integer' }),
    ApiResponse({
      status: 200,
      description:
        'Contexto de plantación: subcampania, usuario, equipo, plan_por_especie, stock_por_especie (con asignaciones y orden_consumo) y reglas.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido.' }),
    ApiResponse({
      status: 403,
      description:
        'Usuario sin rol global mínimo o que no pertenece al equipo (COORDINADOR|OPERARIO).',
    }),
    ApiResponse({
      status: 404,
      description: 'Subcampaña o usuario no encontrado.',
    }),
    ApiResponse({
      status: 409,
      description: 'La subcampaña no está ACTIVA.',
    }),
    ApiResponse({
      status: 422,
      description:
        'La subcampaña no tiene plan por especie, no tiene polígono evaluable o no tiene stock asignado disponible.',
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
