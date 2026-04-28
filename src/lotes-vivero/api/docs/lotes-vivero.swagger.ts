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
import { CausaMermaVivero } from '../../domain/enums/causa-merma-vivero.enum';
import { DestinoTipoVivero } from '../../domain/enums/destino-tipo-vivero.enum';
import { EstadoLoteVivero } from '../../domain/enums/estado-lote-vivero.enum';
import { MotivoCierreLote } from '../../domain/enums/motivo-cierre-lote.enum';
import { SubetapaAdaptabilidad } from '../../domain/enums/subetapa-adaptabilidad.enum';
import { TipoEventoVivero } from '../../domain/enums/tipo-evento-vivero.enum';
import { UnidadMedidaVivero } from '../../domain/enums/unidad-medida-vivero.enum';

const AUTH_ID_HEADER = {
  name: 'x-auth-id',
  description: 'ID de autenticacion del usuario de Supabase',
  required: true,
};

export function ApiCrearEvidenciaPendiente() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear evidencias pendientes para evento de vivero',
      description:
        'Sube fotos y crea evidencias con entidad_id=0 para el tipo EVENTO_LOTE_VIVERO. Luego sus IDs se envian en POST /lotes-vivero para que la RPC de INICIO las vincule atomicamente al evento.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Datos y archivos de evidencia pendiente',
      schema: {
        type: 'object',
        required: ['fotos'],
        properties: {
          titulo: {
            type: 'string',
            maxLength: 120,
            example: 'Inicio de lote',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            example: 'Fotos del material al iniciar el lote de vivero',
          },
          metadata: {
            type: 'string',
            example: '{"fuente":"app-mobile","modulo":"vivero"}',
            description: 'Objeto JSON serializado como texto',
          },
          tomado_en: {
            type: 'string',
            format: 'date-time',
            example: '2026-04-20T10:00:00Z',
          },
          es_principal: {
            type: 'boolean',
            example: true,
            description: 'Indica si esta foto es la principal del evento',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Archivos de imagen (max 5)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Evidencias pendientes creadas. Usar evidencia_ids en POST /lotes-vivero.',
    }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o formato de archivo no permitido',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({
      status: 404,
      description: 'Falta tipo_entidad_evidencia EVENTO_LOTE_VIVERO',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiCrearLoteDesdeRecoleccion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear lote de vivero desde recoleccion validada',
      description:
        'Inicia un lote de vivero usando la RPC fn_vivero_crear_lote_desde_recoleccion. Crea lote, evento INICIO, movimiento CONSUMO_A_VIVERO, descuenta saldo y vincula evidencias en una sola transaccion. El codigo de trazabilidad queda en formato VIV-000001-REC-000001.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiBody({
      description: 'Datos del inicio de lote de vivero',
      schema: {
        type: 'object',
        required: [
          'recoleccion_id',
          'vivero_id',
          'fecha_inicio',
          'fecha_evento',
          'cantidad_inicial_en_proceso',
          'unidad_medida_inicial',
          'evidencia_ids',
        ],
        properties: {
          recoleccion_id: {
            type: 'number',
            minimum: 1,
            example: 45,
            description: 'ID de la recoleccion origen',
          },
          vivero_id: {
            type: 'number',
            minimum: 1,
            example: 1,
            description: 'ID del vivero receptor',
          },
          fecha_inicio: {
            type: 'string',
            format: 'date',
            example: '2026-04-28',
            description: 'Fecha de inicio del lote (ISO 8601)',
          },
          fecha_evento: {
            type: 'string',
            format: 'date',
            example: '2026-04-28',
            description: 'Fecha del evento de inicio (ISO 8601)',
          },
          cantidad_inicial_en_proceso: {
            type: 'number',
            minimum: 0.000001,
            example: 10,
            description: 'Cantidad de material tomado de la recoleccion',
          },
          unidad_medida_inicial: {
            type: 'string',
            enum: Object.values(UnidadMedidaVivero),
            example: UnidadMedidaVivero.UNIDAD,
          },
          evidencia_ids: {
            type: 'array',
            items: { type: 'number', minimum: 1 },
            example: [501],
            description:
              'IDs de evidencias pendientes a asociar al evento de inicio',
          },
          observaciones: {
            type: 'string',
            maxLength: 1000,
            example: 'Inicio del lote en vivero central',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Lote iniciado. Devuelve lote_vivero_id, evento_inicio_id, movimiento, codigo, saldos y evidencia_inicio_ids.',
    }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o saldo de recoleccion insuficiente',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({
      status: 404,
      description: 'Recoleccion o vivero no encontrado',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarEmbolsado() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar evento de embolsado',
      description:
        'Registra el embolsado de plantas en el lote de vivero. Marca la transicion a la etapa de crecimiento en bolsa e inicia el conteo de plantas vivas.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['fecha_evento', 'plantas_vivas_iniciales'],
        properties: {
          fecha_evento: {
            type: 'string',
            format: 'date',
            example: '2026-04-25',
          },
          plantas_vivas_iniciales: {
            type: 'integer',
            minimum: 1,
            example: 120,
            description: 'Cantidad de plantas transferidas a bolsas',
          },
          observaciones: {
            type: 'string',
            maxLength: 1000,
            example: 'Embolsado con sustrato turba y perlita',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Embolsado registrado exitosamente',
    }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o lote en estado incorrecto',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarAdaptabilidad() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar evento de adaptabilidad',
      description:
        'Avanza la subetapa de adaptabilidad del lote (SOMBRA -> MEDIA_SOMBRA -> SOL_DIRECTO). Cada transicion queda registrada en el timeline del lote.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['fecha_evento', 'subetapa_destino'],
        properties: {
          fecha_evento: {
            type: 'string',
            format: 'date',
            example: '2026-05-01',
          },
          subetapa_destino: {
            type: 'string',
            enum: Object.values(SubetapaAdaptabilidad),
            example: SubetapaAdaptabilidad.MEDIA_SOMBRA,
            description: 'Subetapa a la que avanza el lote',
          },
          observaciones: {
            type: 'string',
            maxLength: 1000,
            example: 'Plantas tolerando bien la media sombra',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Adaptabilidad registrada exitosamente',
    }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o transicion de subetapa no permitida',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarMerma() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar merma de plantas',
      description:
        'Registra la perdida de plantas por una causa identificada. El stock vivo del lote se reduce en la cantidad afectada.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiBody({
      schema: {
        type: 'object',
        required: ['fecha_evento', 'cantidad_afectada', 'causa_merma'],
        properties: {
          fecha_evento: {
            type: 'string',
            format: 'date',
            example: '2026-05-10',
          },
          cantidad_afectada: {
            type: 'integer',
            minimum: 1,
            example: 5,
            description: 'Numero de plantas perdidas',
          },
          causa_merma: {
            type: 'string',
            enum: Object.values(CausaMermaVivero),
            example: CausaMermaVivero.PLAGA,
          },
          observaciones: {
            type: 'string',
            maxLength: 1000,
            example: 'Plaga de mosca blanca detectada en sector norte',
          },
        },
      },
    }),
    ApiResponse({ status: 201, description: 'Merma registrada exitosamente' }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o cantidad supera el stock vivo actual',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarDespacho() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar despacho de plantas',
      description:
        'Registra la salida de plantas del vivero hacia un destino. Si el stock llega a cero, el lote se cierra automaticamente.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiBody({
      schema: {
        type: 'object',
        required: [
          'fecha_evento',
          'cantidad_afectada',
          'destino_tipo',
          'destino_referencia',
        ],
        properties: {
          fecha_evento: {
            type: 'string',
            format: 'date',
            example: '2026-06-01',
          },
          cantidad_afectada: {
            type: 'integer',
            minimum: 1,
            example: 50,
            description: 'Numero de plantas despachadas',
          },
          destino_tipo: {
            type: 'string',
            enum: Object.values(DestinoTipoVivero),
            example: DestinoTipoVivero.PLANTACION_PROPIA,
          },
          destino_referencia: {
            type: 'string',
            maxLength: 500,
            example: 'Parcela Norte - Zona A, sector 3',
            description: 'Descripcion del destino de las plantas',
          },
          comunidad_destino_id: {
            type: 'integer',
            minimum: 1,
            example: 3,
            description:
              'ID de la comunidad destino (requerido si destino_tipo es DONACION_COMUNIDAD)',
          },
          observaciones: {
            type: 'string',
            maxLength: 1000,
            example: 'Despacho coordinado con lider comunal',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'Despacho registrado exitosamente',
    }),
    ApiResponse({
      status: 400,
      description: 'Datos invalidos o cantidad supera el stock disponible',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiListarLotes() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar lotes de vivero',
      description:
        'Devuelve lotes de vivero con filtros opcionales por estado, vivero, recoleccion, fecha y busqueda libre. Soporta paginacion.',
    }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 20 }),
    ApiQuery({
      name: 'estado_lote',
      required: false,
      enum: EstadoLoteVivero,
      description: 'Filtrar por estado del lote',
    }),
    ApiQuery({
      name: 'vivero_id',
      required: false,
      type: Number,
      description: 'ID del vivero',
    }),
    ApiQuery({
      name: 'recoleccion_id',
      required: false,
      type: Number,
      description: 'ID de la recoleccion origen',
    }),
    ApiQuery({
      name: 'lote_vivero_id',
      required: false,
      type: Number,
      description: 'ID especifico del lote',
    }),
    ApiQuery({
      name: 'motivo_cierre',
      required: false,
      enum: MotivoCierreLote,
      description: 'Filtrar por motivo de cierre (solo lotes finalizados)',
    }),
    ApiQuery({
      name: 'fecha_inicio',
      required: false,
      type: String,
      description: 'Fecha inicio del rango de busqueda (ISO 8601)',
    }),
    ApiQuery({
      name: 'fecha_fin',
      required: false,
      type: String,
      description: 'Fecha fin del rango de busqueda (ISO 8601)',
    }),
    ApiQuery({
      name: 'q',
      required: false,
      type: String,
      description: 'Busqueda libre sobre campos de texto del lote',
    }),
    ApiResponse({
      status: 200,
      description: 'Lista de lotes de vivero obtenida',
    }),
    ApiResponse({ status: 400, description: 'Parametros de filtro invalidos' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiObtenerTimeline() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener timeline de eventos del lote',
      description:
        'Devuelve el historial cronologico de eventos del lote (inicio, embolsado, adaptabilidad, mermas, despachos). Permite filtrar por tipo de evento, responsable y rango de fechas.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiQuery({
      name: 'tipo_evento',
      required: false,
      enum: TipoEventoVivero,
      description: 'Filtrar por tipo de evento',
    }),
    ApiQuery({
      name: 'responsable_id',
      required: false,
      type: Number,
      description: 'ID del usuario responsable del evento',
    }),
    ApiQuery({
      name: 'fecha_inicio',
      required: false,
      type: String,
      description: 'Fecha inicio del rango (ISO 8601)',
    }),
    ApiQuery({
      name: 'fecha_fin',
      required: false,
      type: String,
      description: 'Fecha fin del rango (ISO 8601)',
    }),
    ApiResponse({
      status: 200,
      description: 'Timeline del lote obtenido exitosamente',
    }),
    ApiResponse({ status: 400, description: 'Parametros de filtro invalidos' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}
