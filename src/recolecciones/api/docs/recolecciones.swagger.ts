import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { TIPOS_MATERIAL_RECOLECCION_INPUT } from '../dto/create-recoleccion.dto';
import {
  CreateUbicacionDto,
  FUENTES_UBICACION,
} from '../dto/create-ubicacion.dto';
import { RejectValidationDto } from '../dto/reject-validation.dto';
import { ESTADOS_HABILITACION_MATERIAL } from '../../../lotes-vivero/domain/enums/estado-habilitacion-material.enum';

const ELEGIBILIDAD_QUERY_DESCRIPTION =
  'Cantidad a evaluar contra el saldo materializado para determinar elegibilidad hacia vivero.';

const VIVERO_ID_SCHEMA = {
  oneOf: [
    { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 19 },
    { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  ],
  description: 'ID exacto del vivero hasta BIGINT; usar cadena decimal.',
  example: '3',
};

export function ApiDeleteDraftRecoleccion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Eliminar borrador de recolección (soft delete)',
      description:
        'RN-REC-09A: solo el creador con acceso M1 efectivo o un ADMIN activo puede eliminar una recolección en BORRADOR. Sin body. Conserva la ficha, fotos, ubicación, snapshots e historial; marca usuario/fecha y registra BORRADOR_ELIMINADO en una transacción. Los eliminados dejan de aparecer en las consultas. Repetir la eliminación devuelve 404.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiResponse({
      status: 200,
      description: 'Borrador eliminado lógicamente.',
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            required: [
              'recoleccion_id',
              'eliminado_en',
              'eliminado_por_usuario_id',
            ],
            properties: {
              recoleccion_id: { type: 'number', example: 292 },
              eliminado_en: {
                type: 'string',
                format: 'date',
                example: '2026-11-03',
              },
              eliminado_por_usuario_id: { type: 'number', example: 7 },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: 'ID inválido.' }),
    ApiResponse({ status: 401, description: 'Bearer ausente o inválido.' }),
    ApiResponse({ status: 403, description: 'Cuenta o permiso insuficiente.' }),
    ApiResponse({
      status: 404,
      description: 'Registro inexistente o eliminado.',
    }),
    ApiResponse({
      status: 409,
      description:
        'Estado distinto de BORRADOR o conflicto concurrente; releer antes de reintentar.',
    }),
    ApiResponse({
      status: 500,
      description: 'No se pudo confirmar la eliminación.',
    }),
  );
}

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
        'Requiere ADMIN o cuenta activa GENERAL/VALIDADOR con acceso M1 explícito. Crea BORRADOR, fotos e historial en una transacción RPC.',
    }),
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
          vivero_id: VIVERO_ID_SCHEMA,
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
            description:
              'Archivos de imagen: JPG/JPEG/PNG/WEBP/HEIC/HEIF (min 2, max 10)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Recolección creada exitosamente en estado BORRADOR',
    }),
    ApiResponse({
      status: 400,
      description: 'Error de validación en los datos',
    }),
    ApiResponse({
      status: 401,
      description: 'Bearer ausente o inválido',
    }),
    ApiResponse({
      status: 403,
      description: 'Prohibido - usuario sin permisos',
    }),
    ApiResponse({ status: 404, description: 'Recurso no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiUpdateDraftRecoleccion() {
  return applyDecorators(
    ApiExtraModels(CreateUbicacionDto),
    ApiOperation({
      summary: 'Editar borrador de recolección',
      description:
        'Requiere creador con M1 efectivo o ADMIN. Permite editar una recolección en BORRADOR o RECHAZADO; datos y fotos se confirman juntos. Si estaba RECHAZADO, vuelve a BORRADOR. La ubicación es opcional: omitirla conserva la actual; si se envía debe incluir latitud y longitud. Una ubicación distinta se guarda sin modificar la anterior.',
    }),
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
          vivero_id: VIVERO_ID_SCHEMA,
          metodo_id: { type: 'number', example: 1 },
          planta_id: { type: 'number', example: 10 },
          ubicacion: {
            description:
              'Ubicación opcional como objeto JSON o texto JSON en multipart. También se admite notación ubicacion[campo]; utilizar una sola representación.',
            oneOf: [
              { $ref: getSchemaPath(CreateUbicacionDto) },
              {
                type: 'string',
                example: '{"latitud":-16.5833,"longitud":-68.15}',
              },
            ],
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
      status: 200,
      description: 'Borrador actualizado exitosamente',
    }),
    ApiResponse({
      status: 400,
      description: 'Estado no permite edición o datos de corrección inválidos',
    }),
    ApiResponse({ status: 403, description: 'Sin permisos para editar' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}

export function ApiSubmitRecoleccionValidation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Enviar recolección a validación',
      description:
        'Cambia el estado de BORRADOR a PENDIENTE_VALIDACION. Solo el creador con acceso M1 efectivo o ADMIN.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiResponse({
      status: 200,
      description: 'Recolección enviada a validación',
    }),
    ApiResponse({
      status: 400,
      description: 'Estado no permite envío a validación',
    }),
    ApiResponse({ status: 403, description: 'Sin permisos' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}

export function ApiApproveRecoleccionValidation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Aprobar validación de recolección',
      description:
        'Cambia PENDIENTE_VALIDACION -> VALIDADO. ADMIN o VALIDADOR asignado al vivero de almacenamiento, distintos del recolector incluso si este es ADMIN. Revisión documental T2; no acredita recepción física. Conserva la ventana de fecha de recolección de hasta 45 días, sin fechas futuras. Ejecuta Pinata + Blockchain.',
    }),
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
        'Cambia PENDIENTE_VALIDACION -> RECHAZADO sin límite por fecha de recolección. ADMIN o VALIDADOR asignado al almacenamiento. Requiere motivo de 10 a 500 caracteres; estado, motivo e historial se guardan juntos.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    ApiBody({ type: RejectValidationDto }),
    ApiResponse({ status: 200, description: 'Recolección rechazada' }),
    ApiResponse({ status: 400, description: 'Estado no permite rechazo' }),
    ApiResponse({ status: 403, description: 'Sin permisos de validador' }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
    ApiResponse({
      status: 409,
      description: 'Recolección en modificación concurrente; reintentar',
    }),
  );
}

export function ApiRegistrarDesecho() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar descarte parcial o total de una recoleccion',
      description:
        'Registra un movimiento DESECHO sobre el saldo disponible de una recoleccion VALIDADO. ADMIN activo u operario vigente del vivero de almacenamiento; M1 y autoría no bastan. No requiere fotos ni motivo en el body; el backend usa DESECHO_OTRO.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recoleccion' }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['cantidad'],
        properties: {
          cantidad: {
            type: 'number',
            minimum: 0.000001,
            example: 50,
            description:
              'Cantidad a desechar en la unidad canonica de la recoleccion (G o UNIDAD).',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Descarte registrado. Devuelve movimiento, saldos antes/despues y estado operativo.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Recoleccion no validada, cerrada, saldo insuficiente o cantidad invalida.',
    }),
    ApiResponse({
      status: 403,
      description:
        'Sin autoridad ADMIN ni acceso operativo al vivero de almacenamiento.',
    }),
    ApiResponse({ status: 404, description: 'Recoleccion no encontrada' }),
  );
}

export function ApiFindPendingValidationRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar recolecciones pendientes de validación',
      description:
        'Devuelve recolecciones en estado PENDIENTE_VALIDACION con filtros y paginación. ADMIN conserva alcance global; VALIDADOR combina la cola de sus viveros asignados con las propias si tiene M1 efectivo, incluso sin M2; GENERAL con M1 ve propias. La unión se filtra antes de contar y paginar y nunca permite aprobación propia. No acredita recepción física.',
    }),
    ...commonListQueries,
    ApiQuery({ name: 'vivero_id', required: false, schema: VIVERO_ID_SCHEMA }),
    cantidadSolicitadaViveroQuery,
    ApiResponse({
      status: 200,
      description: 'Lista de recolecciones pendientes de validación',
    }),
    ApiResponse({
      status: 400,
      description: 'Filtros inválidos',
    }),
    ApiResponse({ status: 401, description: 'Bearer ausente o inválido' }),
  );
}

export function ApiFindAllRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar recolecciones del usuario',
      description:
        'Obtiene las recolecciones propias de la cuenta autenticada por Bearer JWT, incluso para ADMIN, con filtros opcionales y paginación. Requiere acceso M1 efectivo o ADMIN.',
    }),
    ApiResponse({ status: 401, description: 'Bearer ausente o inválido' }),
    ApiResponse({
      status: 403,
      description: 'Cuenta inactiva o sin rol interno',
    }),
    ...commonListQueries,
    tipoMaterialQuery,
    ApiQuery({ name: 'vivero_id', required: false, schema: VIVERO_ID_SCHEMA }),
    cantidadSolicitadaViveroQuery,
  );
}

export function ApiFindStockSummaryRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener stock de semillas por planta',
      description:
        'Dashboard global exclusivo para ADMIN. Devuelve todas las plantas activas del catálogo, incluyendo las que tienen saldo cero, suma el saldo actual de todas las recolecciones de semillas validadas por unidad canónica (G y UNIDAD) y cuenta pendientes de validación.',
    }),
    ApiResponse({
      status: 200,
      description: 'Resumen de stock obtenido correctamente',
    }),
    ApiResponse({
      status: 401,
      description: 'Bearer ausente o inválido',
    }),
    ApiResponse({
      status: 403,
      description: 'El usuario autenticado no tiene rol ADMIN',
    }),
  );
}

export function ApiFindHistorialSemillas() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar historial administrativo de semillas por planta',
      description:
        'Solo ADMIN con Bearer verificado. Incluye todas las recolecciones SEMILLA validadas de todos los autores, abiertas o cerradas, sin eliminadas. Orden descendente por fecha, creación e ID. El saldo disponible se consulta en stock-summary.',
    }),
    ApiParam({
      name: 'plantaId',
      type: Number,
      description: 'ID positivo de planta, activa o inactiva',
    }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 10,
      description: 'Entero entre 1 y 50',
    }),
    ApiResponse({
      status: 200,
      description:
        'Cabecera de planta, datos canónicos y paginación; puede estar vacío.',
    }),
    ApiResponse({ status: 400, description: 'ID o paginación inválidos' }),
    ApiResponse({ status: 401, description: 'Bearer ausente o inválido' }),
    ApiResponse({ status: 403, description: 'Cuenta sin rol ADMIN' }),
    ApiResponse({ status: 404, description: 'Planta inexistente' }),
  );
}

export function ApiFindByViveroRecolecciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar recolecciones por vivero',
      description:
        'M1 efectivo filtra por autor antes de contar y paginar. ADMIN conserva alcance global y VALIDADOR revisión documental solo del almacenamiento asignado. Devuelve saldo y elegibilidad; no acredita recepción física.',
    }),
    ApiParam({
      name: 'viveroId',
      schema: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 19 },
      description: 'ID exacto del vivero hasta BIGINT',
    }),
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
        'Requiere M1 efectivo y autoría o autoridad de revisión legada ADMIN/VALIDADOR. Autoriza el objeto antes de cargar fotos. Distingue la recepción total de la habilitación física del remanente.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' }),
    cantidadSolicitadaViveroQuery,
    ApiResponse({
      status: 200,
      description: 'Ficha canónica de recolección.',
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            required: ['recepcion_conforme', 'm2_estado_habilitacion'],
            properties: {
              recepcion_conforme: {
                type: 'boolean',
                description: 'Recepción física total conforme de T4.',
              },
              m2_estado_habilitacion: {
                type: 'string',
                enum: [...ESTADOS_HABILITACION_MATERIAL],
                nullable: true,
                description: 'Estado físico para operar el saldo en Vivero.',
              },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'Recolección no encontrada' }),
  );
}
