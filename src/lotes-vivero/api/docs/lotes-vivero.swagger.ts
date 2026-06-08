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
            example: false,
            description:
              'Ignorado mientras la evidencia esta pendiente; la evidencia principal aplica cuando ya existe el evento definitivo',
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
        'Registra el embolsado llamando fn_vivero_registrar_embolsado. Crea el evento EMBOLSADO, materializa el saldo vivo e inica el conteo de plantas vivas en UNIDAD. El responsable_id sale del usuario autenticado (x-auth-id), nunca del body.',
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
        required: ['fecha_evento', 'plantas_vivas_iniciales', 'evidencia_ids'],
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
            description:
              'Cantidad de plantas vivas observadas. No se convierte desde gramos; es un conteo operativo del proceso.',
          },
          evidencia_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            minItems: 1,
            example: [137],
            description:
              'IDs de evidencias pendientes a vincular al evento EMBOLSADO. Obligatorio.',
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
      description:
        'Embolsado registrado. Devuelve { success: true, data } con evento_embolsado_id, lote_vivero_id, codigo_trazabilidad, plantas_vivas_iniciales, saldo_vivo_antes (null), saldo_vivo_despues y evidencia_ids_vinculadas.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Datos invalidos, lote sin INICIO, EMBOLSADO duplicado, evidencia ya vinculada o saldo incorrecto.',
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
        'Registra un evento ADAPTABILIDAD via RPC fn_vivero_registrar_adaptabilidad. Actualiza subetapa_actual del lote sin modificar el saldo vivo. Permite multiples registros y secuencia flexible de subetapas. La evidencia es opcional.',
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
            description:
              'Subetapa a la que avanza el lote. Sin orden obligatorio.',
          },
          evidencia_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            example: [310, 311],
            description:
              'IDs de evidencias pendientes obtenidos en POST :id/adaptabilidad/evidencias-pendientes. Opcional: puede omitirse o enviarse vacio.',
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
      description:
        'Adaptabilidad registrada. Devuelve { success: true, message, data } con evento_adaptabilidad_id, subetapa_destino, saldo_vivo_actual y evidencia_ids_vinculadas.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Datos invalidos, lote sin EMBOLSADO previo, lote FINALIZADO, fecha invalida o evidencia ya vinculada.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({
      status: 403,
      description: 'Rol del usuario sin permiso de escritura',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarMerma() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar merma de plantas',
      description:
        'Registra la perdida de plantas via RPC fn_vivero_registrar_merma. Reduce el saldo vivo del lote, vincula evidencias y activa cierre automatico si el saldo llega a 0. El responsable_id sale del usuario autenticado (x-auth-id), nunca del body.',
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
          'causa_merma',
          'evidencia_ids',
        ],
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
            description:
              'Numero de plantas perdidas. No puede superar el saldo vivo disponible.',
          },
          causa_merma: {
            type: 'string',
            enum: Object.values(CausaMermaVivero),
            example: CausaMermaVivero.PLAGA,
          },
          evidencia_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            minItems: 1,
            example: [201, 202],
            description:
              'IDs de evidencias pendientes obtenidos en POST :id/merma/evidencias-pendientes. Obligatorio.',
          },
          observaciones: {
            type: 'string',
            maxLength: 1000,
            example: 'Plaga de mosca blanca detectada en sector norte',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Merma registrada. Devuelve { success: true, data } con evento_merma_id, saldo_vivo_antes, saldo_vivo_despues, lote_finalizado y motivo_cierre.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Datos invalidos, lote sin EMBOLSADO previo, cantidad supera saldo, evidencia ya vinculada o eliminada.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({
      status: 403,
      description: 'Rol del usuario sin permiso de escritura',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiRegistrarDespacho() {
  return applyDecorators(
    ApiOperation({
      summary: 'Registrar despacho manual de plantas',
      description:
        'Registra la salida de plantas del vivero hacia un destino llamando la RPC fn_vivero_registrar_despacho en una sola transaccion. El responsable_id sale del usuario autenticado (x-auth-id), nunca del body. Requiere EMBOLSADO previo y al menos una evidencia. Si el stock llega a cero, el lote se cierra automaticamente. El destino PLANTACION_CAMPANIA esta reservado para despachos automaticos del Modulo 3 y se rechaza en este endpoint.',
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
          'evidencia_ids',
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
            description:
              'Numero de plantas despachadas. No puede superar el saldo vivo disponible.',
          },
          destino_tipo: {
            type: 'string',
            enum: Object.values(DestinoTipoVivero),
            example: DestinoTipoVivero.PLANTACION_PROPIA,
            description:
              'Destino del despacho. PLANTACION_CAMPANIA NO esta permitido aqui (es exclusivo de M3).',
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
              'ID de la comunidad destino (opcional). Recomendado cuando destino_tipo refiere a una comunidad (PLANTACION_COMUNIDAD, DONACION).',
          },
          evidencia_ids: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            minItems: 1,
            example: [305, 306],
            description:
              'IDs de evidencias pendientes obtenidos en POST :id/despacho/evidencias-pendientes. Obligatorio (RN-VIV-23).',
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
      description:
        'Despacho registrado. Devuelve { success: true, data } con evento_despacho_id, saldo_vivo_antes, saldo_vivo_despues, evidencia_ids_vinculadas, lote_finalizado y motivo_cierre.',
    }),
    ApiResponse({
      status: 400,
      description:
        'Datos invalidos, lote sin EMBOLSADO previo, cantidad supera saldo, destino PLANTACION_CAMPANIA usado, evidencia ya vinculada o eliminada.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({
      status: 403,
      description: 'Rol del usuario sin permiso de escritura',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiCrearEvidenciasPendientesDespacho() {
  return applyDecorators(
    ApiOperation({
      summary: 'Subir evidencias pendientes para despacho',
      description:
        'Sube fotos al storage y crea registros en evidencias_trazabilidad con entidad_id=0, vinculando el codigo_trazabilidad del lote. Los IDs retornados deben enviarse en POST :id/despacho.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Fotos de evidencia para el despacho',
      schema: {
        type: 'object',
        required: ['fotos'],
        properties: {
          titulo: {
            type: 'string',
            maxLength: 120,
            example: 'Despacho a comunidad',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            example: 'Carga de plantas en camion para entrega',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Archivos de imagen (max 5, solo JPG/JPEG/PNG)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Evidencias pendientes creadas. Devuelve { success: true, data } con evidencia_ids y evidencias con codigo_trazabilidad del lote.',
    }),
    ApiResponse({ status: 400, description: 'Sin fotos o lote no ACTIVO' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiObtenerDespachos() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar despachos registrados del lote',
      description:
        'Devuelve todos los eventos DESPACHO del lote en orden cronologico con sus evidencias vinculadas, origen_despacho (MANUAL / AUTOMATICO_PLANTACION) y el saldo vivo actual.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data } con lote_id, estado_lote, motivo_cierre, saldo_vivo_actual, total_despachos y despachos con evidencias.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiObtenerDetalleLote() {
  return applyDecorators(
    ApiOperation({
      summary: 'Detalle del lote con snapshot del ultimo evento por tipo',
      description:
        'Devuelve los campos del lote, sus relaciones (vivero, recoleccion, planta, responsable) y un mapa ultimo_evento_por_tipo con el evento mas reciente de cada tipo (INICIO, EMBOLSADO, ADAPTABILIDAD, MERMA, DESPACHO, CIERRE_AUTOMATICO). Pensado para que los formularios de eventos validen fechas contra el evento previo (RN-VIV-10/RN-VIV-33) sin disparar N+1 calls.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data } con el lote, sus relaciones y ultimo_evento_por_tipo (null por tipo si todavia no ocurrio).',
    }),
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

export function ApiObtenerContextoEmbolsado() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener contexto para pantalla de embolsado',
      description:
        'Devuelve datos de solo lectura del lote para cargar la pantalla de embolsado. Incluye puede_registrar_embolsado y motivo_bloqueo si aplica. No guarda nada.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data } con lote_id, codigo_trazabilidad, snapshots, cantidades, puede_registrar_embolsado y motivo_bloqueo.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiCrearEvidenciasPendientesEmbolsado() {
  return applyDecorators(
    ApiOperation({
      summary: 'Subir evidencias pendientes para embolsado',
      description:
        'Sube fotos al storage y crea registros en evidencias_trazabilidad con entidad_id=0, vinculando el codigo_trazabilidad del lote. Los IDs retornados deben enviarse en POST :id/embolsado.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Fotos de evidencia para el embolsado',
      schema: {
        type: 'object',
        required: ['fotos'],
        properties: {
          titulo: {
            type: 'string',
            maxLength: 120,
            example: 'Embolsado inicial',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            example: 'Plantas transferidas a bolsas',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Archivos de imagen (max 5, solo JPG/JPEG/PNG)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Evidencias pendientes creadas. Devuelve { success: true, data } con evidencia_ids y evidencias con codigo_trazabilidad del lote.',
    }),
    ApiResponse({ status: 400, description: 'Sin fotos o lote no ACTIVO' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiObtenerResultadoEmbolsado() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar resultado del embolsado registrado',
      description:
        'Devuelve el evento EMBOLSADO del lote si existe, con plantas_vivas_iniciales, saldo_vivo_actual y evidencias vinculadas. Si no existe, devuelve registrado: false.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data }. data.registrado: true con evento, lote y evidencias si existe; registrado: false con evento: null si no.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiCrearEvidenciasPendientesMerma() {
  return applyDecorators(
    ApiOperation({
      summary: 'Subir evidencias pendientes para merma',
      description:
        'Sube fotos al storage y crea registros en evidencias_trazabilidad con entidad_id=0, vinculando el codigo_trazabilidad del lote. Los IDs retornados deben enviarse en POST :id/merma.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Fotos de evidencia para la merma',
      schema: {
        type: 'object',
        required: ['fotos'],
        properties: {
          titulo: {
            type: 'string',
            maxLength: 120,
            example: 'Evidencia de merma por plaga',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            example: 'Fotos de plantas afectadas por plaga',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Archivos de imagen (max 5, solo JPG/JPEG/PNG)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Evidencias pendientes creadas. Devuelve { success: true, data } con evidencia_ids y evidencias con codigo_trazabilidad del lote.',
    }),
    ApiResponse({ status: 400, description: 'Sin fotos o lote no ACTIVO' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

// TODO(vivero-mvp): este decorador marca x-auth-id como requerido, pero el endpoint
//   GET /lotes-vivero/:id/merma del controller no valida el header. Swagger queda
//   engañando al consumidor. Decidir cuál es la verdad:
//     a) si el endpoint debe exigir auth (alinear con RF-VIV-07 "control de acceso
//        por rol"), agregar la validación `x-auth-id` en el controller, o
//     b) si seguirá siendo público, quitar ApiSecurity/ApiHeader aquí.
//   La misma duda aplica a los otros GET (ApiListarLotes, ApiObtenerTimeline,
//   ApiObtenerAdaptabilidades, ApiObtenerResultadoEmbolsado,
//   ApiObtenerContextoEmbolsado): revisar consistencia global.
export function ApiObtenerMermas() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar mermas registradas del lote',
      description:
        'Devuelve todos los eventos MERMA del lote en orden cronologico con sus evidencias vinculadas y el saldo vivo actual.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data } con lote_id, saldo_vivo_actual, total_mermas y mermas con evidencias.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiCrearEvidenciasPendientesAdaptabilidad() {
  return applyDecorators(
    ApiOperation({
      summary: 'Subir evidencias pendientes para adaptabilidad',
      description:
        'Sube fotos al storage y crea registros en evidencias_trazabilidad con entidad_id=0, vinculando el codigo_trazabilidad del lote. Los IDs retornados pueden enviarse en POST :id/adaptabilidad. Este paso es opcional: adaptabilidad no requiere evidencia obligatoria.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Fotos de evidencia para la adaptabilidad (opcional)',
      schema: {
        type: 'object',
        required: ['fotos'],
        properties: {
          titulo: {
            type: 'string',
            maxLength: 120,
            example: 'Subetapa media sombra',
          },
          descripcion: {
            type: 'string',
            maxLength: 1000,
            example: 'Plantas en fase de aclimatacion a media sombra',
          },
          fotos: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Archivos de imagen (max 5, solo JPG/JPEG/PNG)',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Evidencias pendientes creadas. Devuelve { success: true, data } con evidencia_ids y evidencias con codigo_trazabilidad del lote.',
    }),
    ApiResponse({ status: 400, description: 'Sin fotos o lote no ACTIVO' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiObtenerSaldos() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar saldos derivados del lote',
      description:
        'Devuelve saldo_vivo_actual, saldo_asignado_total (suma de reservas activas para subcampanas) y saldo_vivo_disponible_asignacion (lo que puede despachar manualmente un operario). Incluye el detalle de cada asignacion ACTIVA con su saldo individual.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data } con lote_id, saldo_vivo_actual, saldo_asignado_total, saldo_vivo_disponible_asignacion y asignaciones_activas.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiObtenerAdaptabilidades() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consultar adaptabilidades registradas del lote',
      description:
        'Devuelve todos los eventos ADAPTABILIDAD del lote ordenados por fecha descendente con sus evidencias vinculadas, subetapa_actual y saldo vivo actual.',
    }),
    ApiParam({
      name: 'id',
      type: Number,
      description: 'ID del lote de vivero',
    }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data } con lote_id, saldo_vivo_actual, subetapa_actual, total_adaptabilidades y adaptabilidades con evidencias.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

// ---- Asignaciones ----

export function ApiCrearAsignacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Crear asignación de lote a subcampaña',
      description:
        'Reserva una cantidad del saldo disponible del lote para una subcampaña activa. Valida que el lote esté ACTIVO, la subcampaña exista y el saldo sea suficiente. El campo proposito es opcional (default PLANTACION_INICIAL).',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: Number, description: 'ID del lote de vivero' }),
    ApiBody({
      description: 'Datos de la asignación',
      schema: {
        type: 'object',
        required: ['subcampania_id', 'cantidad_asignada'],
        properties: {
          subcampania_id: { type: 'integer', example: 1 },
          cantidad_asignada: { type: 'integer', minimum: 1, example: 50 },
          proposito: {
            type: 'string',
            enum: ['PLANTACION_INICIAL', 'REPOSICION'],
            example: 'PLANTACION_INICIAL',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description:
        'Asignación creada. Devuelve { success: true, data } con el registro asignacion_vivero_subcampania.',
    }),
    ApiResponse({ status: 400, description: 'Datos inválidos' }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 403, description: 'Sin permisos de escritura' }),
    ApiResponse({ status: 404, description: 'Lote o subcampaña no encontrados' }),
    ApiResponse({ status: 409, description: 'Subcampaña cerrada' }),
    ApiResponse({ status: 422, description: 'Lote no ACTIVO o saldo insuficiente' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiListarAsignaciones() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar asignaciones activas del lote',
      description:
        'Devuelve todas las asignaciones en estado ACTIVA del lote, incluyendo nombre de subcampaña y saldo disponible de cada una.',
    }),
    ApiParam({ name: 'id', type: Number, description: 'ID del lote de vivero' }),
    ApiResponse({
      status: 200,
      description:
        'Devuelve { success: true, data: AsignacionRow[] } ordenado por fecha_asignacion ASC.',
    }),
    ApiResponse({ status: 404, description: 'Lote de vivero no encontrado' }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}

export function ApiCancelarAsignacion() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancelar asignación de lote',
      description:
        'Cancela una asignación ACTIVA que no haya sido consumida en plantación (cantidad_consumida = 0). Libera el saldo devolviendo la reserva al lote.',
    }),
    ApiSecurity('x-auth-id'),
    ApiHeader(AUTH_ID_HEADER),
    ApiParam({ name: 'id', type: Number, description: 'ID del lote de vivero' }),
    ApiParam({
      name: 'asignacionId',
      type: Number,
      description: 'ID de la asignación a cancelar',
    }),
    ApiResponse({
      status: 200,
      description:
        'Asignación cancelada (estado DEVUELTA). Devuelve { success: true, data }.',
    }),
    ApiResponse({ status: 401, description: 'Header x-auth-id requerido' }),
    ApiResponse({ status: 403, description: 'Sin permisos de escritura' }),
    ApiResponse({
      status: 404,
      description: 'Lote o asignación no encontrados',
    }),
    ApiResponse({
      status: 409,
      description:
        'Asignación ya cancelada/agotada o con consumo en plantación',
    }),
    ApiResponse({ status: 500, description: 'Error interno del servidor' }),
  );
}
