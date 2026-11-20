import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';
import { compatibleId, exactId } from '../../common/dto/bigint-id';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';
import { CausaDescartePreEmbolsado } from '../domain/enums/causa-descarte-pre-embolsado.enum';
import { CausaMermaVivero } from '../domain/enums/causa-merma-vivero.enum';
import { DestinoTipoVivero } from '../domain/enums/destino-tipo-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { SubetapaAdaptabilidad } from '../domain/enums/subetapa-adaptabilidad.enum';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';
import {
  crearTimelineCursor,
  leerTimelineCursor,
  timelineContexto,
} from '../domain/policies/timeline-cursor.policy';
import { proyectarUrlEvidenciaVivero } from './vivero-evidencia-url';

// ---------------------------------------------------------------------------
// Row types — sin any
// ---------------------------------------------------------------------------

type LoteResumenRow = {
  id: number | string;
  codigo_trazabilidad: string;
  estado_lote: string;
  nombre_responsable_snapshot: string;
};

type UsuarioRow = {
  id: number | string;
  nombre: string;
  apellido: string | null;
};

type EventoTimelineRow = {
  id: number | string;
  lote_id: number | string;
  tipo_evento: TipoEventoVivero;
  fecha_evento: string;
  created_at: string;
  responsable_id: number | string;
  cantidad_afectada: number | null;
  unidad_medida_evento: UnidadMedidaVivero | null;
  causa_merma: CausaMermaVivero | null;
  causa_descarte_pre_embolsado: CausaDescartePreEmbolsado | null;
  origen_despacho: string | null;
  asignacion_id: number | string | null;
  subcampania_id: number | string | null;
  campania_id: number | string | null;
  registro_plantacion_id: number | string | null;
  destino_tipo: DestinoTipoVivero | null;
  destino_referencia: string | null;
  subetapa_destino: SubetapaAdaptabilidad | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
  motivo_cierre_calculado: MotivoCierreLote | null;
  observaciones: string | null;
  usuario: UsuarioRow | null;
  incorporacion?: Record<string, unknown> | Record<string, unknown>[] | null;
};

type EvidenciaTimelineRow = {
  id: number | string;
  entidad_id: number | string;
  bucket: string;
  ruta_archivo: string;
  mime_type: string;
  tipo_archivo: string;
  es_principal: boolean;
  orden: number;
  titulo: string | null;
  tamano_bytes: number | string | null;
  tomado_en: string | null;
};

// ---------------------------------------------------------------------------
// Payload por tipo de evento (union discriminada)
// ---------------------------------------------------------------------------

type PayloadInicio = {
  tipo: TipoEventoVivero.INICIO;
  cantidad_inicial: number | null;
  unidad_medida: UnidadMedidaVivero | null;
};

type PayloadEmbolsado = {
  tipo: TipoEventoVivero.EMBOLSADO;
  plantas_vivas_iniciales: number | null;
};
type PayloadIncorporacion = {
  tipo: TipoEventoVivero.INCORPORACION;
  cantidad: number | null;
  procedencia: Record<string, unknown> | null;
};

type PayloadAdaptabilidad = {
  tipo: TipoEventoVivero.ADAPTABILIDAD;
  subetapa_destino: SubetapaAdaptabilidad | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
};

type PayloadMerma = {
  tipo: TipoEventoVivero.MERMA;
  cantidad_afectada: number | null;
  causa_merma: CausaMermaVivero | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
};

type PayloadDescartePreEmbolsado = {
  tipo: TipoEventoVivero.DESCARTE_PRE_EMBOLSADO;
  cantidad_material_afectado: number | null;
  unidad_medida_evento: UnidadMedidaVivero | null;
  causa_descarte_pre_embolsado: CausaDescartePreEmbolsado | null;
};

type VinculosPlantacion = {
  origen_despacho: string | null;
  asignacion_id: string | null;
  subcampania_id: string | null;
  campania_id: string | null;
  registro_plantacion_id: string | null;
};

type PayloadDespacho = VinculosPlantacion & {
  tipo: TipoEventoVivero.DESPACHO;
  cantidad_afectada: number | null;
  destino_tipo: DestinoTipoVivero | null;
  destino_referencia: string | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
};

// Entrada fisica por devolucion de stock asignado desde M3 (RN-VIV-48).
type PayloadDevolucionPlantacion = VinculosPlantacion & {
  naturaleza_devolucion: 'NO_REGISTRADA';
  tipo: TipoEventoVivero.DEVOLUCION_PLANTACION;
  cantidad_afectada: number | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
};

type PayloadCierreAutomatico = {
  tipo: TipoEventoVivero.CIERRE_AUTOMATICO;
  motivo_cierre: MotivoCierreLote | null;
};

type EventoPayload =
  | PayloadInicio
  | PayloadIncorporacion
  | PayloadEmbolsado
  | PayloadDescartePreEmbolsado
  | PayloadAdaptabilidad
  | PayloadMerma
  | PayloadDespacho
  | PayloadDevolucionPlantacion
  | PayloadCierreAutomatico;

// ---------------------------------------------------------------------------
// Constante de columnas para el SELECT
// ---------------------------------------------------------------------------

const EVENTO_COLUMNS = [
  'id::text',
  'lote_id::text',
  'tipo_evento',
  'fecha_evento',
  'created_at',
  'responsable_id::text',
  'cantidad_afectada',
  'unidad_medida_evento',
  'causa_merma',
  'causa_descarte_pre_embolsado',
  'origen_despacho',
  'asignacion_id::text',
  'subcampania_id::text',
  'campania_id::text',
  'registro_plantacion_id::text',
  'destino_tipo',
  'destino_referencia',
  'subetapa_destino',
  'saldo_vivo_antes',
  'saldo_vivo_despues',
  'motivo_cierre_calculado',
  'observaciones',
  'usuario:responsable_id (id::text, nombre, apellido)',
  'incorporacion:vivero_incorporacion(modalidad,procedencia,tercero_origen,referencia_documental,registrado_en)',
].join(', ');

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

@Injectable()
export class ViveroTimelineService {
  private readonly logger = new Logger(ViveroTimelineService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async obtenerTimeline(
    loteId: number | string,
    filters: FiltrarTimelineLoteDto,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    // 1. Verificar que el lote existe
    const lote = await this.obtenerLote(supabase, loteId);

    const limite = filters.limite ?? 100;
    if (!Number.isInteger(limite) || limite < 1 || limite > 200) {
      throw new BadRequestException(
        'El límite del historial debe estar entre 1 y 200.',
      );
    }
    const contexto = timelineContexto(loteId, filters);
    const cursor = leerTimelineCursor(filters.cursor, contexto);
    const corte =
      cursor?.corte ?? (await this.obtenerCorte(supabase, loteId, filters));

    let total = 0;
    let restantes = 0;
    let eventos: EventoTimelineRow[] = [];
    if (corte !== null) {
      // El conteo exacto permite detectar también un límite de filas PostgREST
      // menor al solicitado. La página no se declara final por su tamaño.
      total = await this.contarEventos(supabase, loteId, filters, corte);
      if (cursor && cursor.total !== total) this.historialCambio();
      let query = this.filtrarEventos(
        supabase
          .from('evento_lote_vivero')
          .select(EVENTO_COLUMNS, { count: 'exact' }),
        loteId,
        filters,
      ).lte('id', corte);
      if (cursor) {
        query = query.or(
          `fecha_evento.gt.${cursor.fecha},and(fecha_evento.eq.${cursor.fecha},created_at.gt.${cursor.creado}),and(fecha_evento.eq.${cursor.fecha},created_at.eq.${cursor.creado},id.gt.${cursor.id})`,
        );
      }
      const result = await query
        .order('fecha_evento', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limite);
      if (
        result.error ||
        !Number.isSafeInteger(result.count) ||
        result.count === null ||
        result.count < 0
      ) {
        throw new InternalServerErrorException(
          'Error al obtener el historial completo del lote.',
        );
      }
      restantes = result.count;
      eventos = (result.data ?? []) as unknown as EventoTimelineRow[];
      if (restantes > 0 && eventos.length === 0) {
        throw new InternalServerErrorException(
          'No se pudo continuar el historial del lote.',
        );
      }
    }

    const evidenciaBatch = await this.cargarEvidenciasBatch(
      supabase,
      eventos.map((e) => exactId(e.id)),
    );
    const eventosMapeados = await Promise.all(
      eventos.map(async (evento) => {
        const incorporacion = Array.isArray(evento.incorporacion)
          ? evento.incorporacion[0]
          : evento.incorporacion;
        const esIncorporacion =
          evento.tipo_evento === TipoEventoVivero.INCORPORACION;
        const responsableNombre = esIncorporacion
          ? lote.nombre_responsable_snapshot?.trim() || null
          : this.buildNombreResponsable(evento.usuario);
        return {
          id: compatibleId(evento.id),
          lote_vivero_id: compatibleId(evento.lote_id),
          tipo_evento: evento.tipo_evento,
          fecha_evento: evento.fecha_evento,
          created_at: evento.created_at,
          registrado_en: esIncorporacion
            ? (incorporacion?.registrado_en ?? null)
            : null,
          responsable_id: compatibleId(evento.responsable_id),
          responsable_nombre: responsableNombre,
          responsable_nombre_fuente:
            esIncorporacion && responsableNombre !== null
              ? 'SNAPSHOT_INCORPORACION'
              : responsableNombre !== null
                ? 'CUENTA_ACTUAL'
                : 'NO_REGISTRADO',
          observaciones: evento.observaciones ?? null,
          payload: this.buildPayload(evento),
          estado_evidencias: evidenciaBatch.completa
            ? 'CONSULTADAS'
            : 'ERROR_CONSULTA',
          evidencias: await Promise.all(
            (evidenciaBatch.mapa.get(exactId(evento.id)) ?? []).map((ev) =>
              this.proyectarEvidencia(supabase, ev),
            ),
          ),
        };
      }),
    );
    const hayMas = restantes > eventos.length;
    const ultimo = eventos[eventos.length - 1];
    // Un ID reservado en otra transacción puede confirmar por debajo del corte
    // mientras se leen/firman fotos. El conjunto append-only debe conservar su
    // conteo antes y después de la página, y frente al total inicial del cursor.
    if (
      corte !== null &&
      (await this.contarEventos(supabase, loteId, filters, corte)) !== total
    ) {
      this.historialCambio();
    }
    return {
      success: true,
      data: {
        lote_id: compatibleId(loteId),
        codigo_trazabilidad: lote.codigo_trazabilidad,
        estado_lote: lote.estado_lote,
        total_eventos: eventosMapeados.length,
        eventos: eventosMapeados,
        paginacion: {
          limite,
          devueltos: eventos.length,
          total_en_lectura: total,
          hay_mas: hayMas,
          cursor_siguiente:
            hayMas && ultimo && corte !== null
              ? crearTimelineCursor({
                  version: 1,
                  contexto,
                  orden: 'ASC',
                  corte,
                  total,
                  fecha: ultimo.fecha_evento,
                  creado: ultimo.created_at,
                  id: exactId(ultimo.id),
                })
              : null,
          // Señala la última página del corte. Una página final aislada no es
          // todo el historial: el consumidor debe reunir las páginas anteriores.
          lectura_completa: !hayMas,
          corte_evento_id: corte,
          orden: ['fecha_evento', 'created_at', 'id'],
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async obtenerLote(
    supabase: SupabaseClient,
    loteId: number | string,
  ): Promise<LoteResumenRow> {
    const { data, error } = await supabase
      .from('lote_vivero')
      .select(
        'id::text, codigo_trazabilidad, estado_lote, nombre_responsable_snapshot',
      )
      .eq('id', loteId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Error al verificar lote ${loteId} para timeline:`,
        error,
      );
      throw new InternalServerErrorException('Error al obtener datos del lote');
    }

    if (!data) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    return data as LoteResumenRow;
  }

  private filtrarEventos<Q extends PostgrestFilterBuilder<any, any, any, any>>(
    query: Q,
    loteId: number | string,
    filters: FiltrarTimelineLoteDto,
  ): Q {
    query = query.eq('lote_id', loteId);
    if (filters.tipo_evento)
      query = query.eq('tipo_evento', filters.tipo_evento);
    if (filters.responsable_id)
      query = query.eq('responsable_id', filters.responsable_id);
    if (filters.fecha_inicio)
      query = query.gte('fecha_evento', filters.fecha_inicio);
    if (filters.fecha_fin) query = query.lte('fecha_evento', filters.fecha_fin);
    return query;
  }

  private async obtenerCorte(
    supabase: SupabaseClient,
    loteId: number | string,
    filters: FiltrarTimelineLoteDto,
  ): Promise<string | null> {
    const { data, error } = await this.filtrarEventos(
      supabase.from('evento_lote_vivero').select('id::text'),
      loteId,
      filters,
    )
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new InternalServerErrorException(
        'No se pudo iniciar la lectura del historial.',
      );
    return data ? exactId(data.id) : null;
  }

  private async contarEventos(
    supabase: SupabaseClient,
    loteId: number | string,
    filters: FiltrarTimelineLoteDto,
    corte: string,
  ): Promise<number> {
    const { error, count } = await this.filtrarEventos(
      supabase
        .from('evento_lote_vivero')
        .select('id', { count: 'exact', head: true }),
      loteId,
      filters,
    ).lte('id', corte);
    if (error || !Number.isSafeInteger(count) || count === null || count < 0) {
      throw new InternalServerErrorException(
        'No se pudo comprobar la completitud del historial.',
      );
    }
    return count;
  }

  private historialCambio(): never {
    throw new ConflictException({
      error: {
        codigo: 'HISTORIAL_CAMBIO_DURANTE_LECTURA',
        mensaje: 'El historial cambió durante la lectura; reinicie sin cursor.',
      },
    });
  }

  private async cargarEvidenciasBatch(
    supabase: SupabaseClient,
    eventoIds: string[],
  ): Promise<{ mapa: Map<string, EvidenciaTimelineRow[]>; completa: boolean }> {
    const mapa = new Map<string, EvidenciaTimelineRow[]>();
    if (eventoIds.length === 0) return { mapa, completa: true };
    try {
      const { data: tipoEntidad, error: tipoError } = await supabase
        .from('tipos_entidad_evidencia')
        .select('id::text')
        .ilike('codigo', 'EVENTO_LOTE_VIVERO')
        .eq('activo', true)
        .maybeSingle();
      if (tipoError || !tipoEntidad) return { mapa, completa: false };

      // Las evidencias legadas no tienen el máximo de cinco fotos T5.
      // Se recorre el resultado con conteo exacto para no ocultar truncamientos.
      let offset = 0;
      while (true) {
        const { data, error, count } = await supabase
          .from('evidencias_trazabilidad')
          .select(
            'id::text, entidad_id::text, bucket, ruta_archivo, mime_type, tipo_archivo, es_principal, orden, titulo, tamano_bytes::text, tomado_en',
            { count: 'exact' },
          )
          .eq('tipo_entidad_id', exactId(tipoEntidad.id))
          .in('entidad_id', eventoIds)
          .is('eliminado_en', null)
          .order('es_principal', { ascending: false })
          .order('orden', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + 199);
        if (
          error ||
          !Number.isSafeInteger(count) ||
          count === null ||
          count < 0
        )
          return { mapa, completa: false };
        const filas = (data ?? []) as unknown as EvidenciaTimelineRow[];
        if (filas.length === 0 && offset < count)
          return { mapa, completa: false };
        for (const ev of filas) {
          const key = exactId(ev.entidad_id);
          const lista = mapa.get(key) ?? [];
          lista.push(ev);
          mapa.set(key, lista);
        }
        offset += filas.length;
        if (offset >= count) return { mapa, completa: true };
      }
    } catch {
      // La página de eventos sigue siendo utilizable con un fallo de fotos.
      return { mapa, completa: false };
    }
  }

  private async proyectarEvidencia(
    supabase: SupabaseClient,
    ev: EvidenciaTimelineRow,
  ) {
    const evidencia = {
      id: compatibleId(ev.id),
      ruta_archivo: ev.ruta_archivo,
      mime_type: ev.mime_type,
      tipo_archivo: ev.tipo_archivo,
      es_principal: ev.es_principal,
      orden: ev.orden,
      titulo: ev.titulo ?? null,
      tamano_bytes:
        ev.tamano_bytes == null
          ? null
          : Number.isSafeInteger(Number(ev.tamano_bytes))
            ? Number(ev.tamano_bytes)
            : String(ev.tamano_bytes),
      tomado_en: ev.tomado_en ?? null,
    };
    return { ...evidencia, ...(await proyectarUrlEvidenciaVivero(supabase, ev)) };
  }

  private buildNombreResponsable(usuario: UsuarioRow | null): string | null {
    if (!usuario) return null;
    return (
      [usuario.nombre?.trim(), usuario.apellido?.trim()]
        .filter(Boolean)
        .join(' ') || null
    );
  }

  private vinculosPlantacion(evento: EventoTimelineRow): VinculosPlantacion {
    const nullableId = (value: number | string | null | undefined) =>
      value == null ? null : exactId(value);
    return {
      origen_despacho: evento.origen_despacho ?? null,
      asignacion_id: nullableId(evento.asignacion_id),
      subcampania_id: nullableId(evento.subcampania_id),
      campania_id: nullableId(evento.campania_id),
      registro_plantacion_id: nullableId(evento.registro_plantacion_id),
    };
  }

  private buildPayload(evento: EventoTimelineRow): EventoPayload {
    const num = (v: number | null): number | null =>
      v !== null ? Number(v) : null;

    switch (evento.tipo_evento) {
      case TipoEventoVivero.INICIO:
        return {
          tipo: TipoEventoVivero.INICIO,
          cantidad_inicial: num(evento.cantidad_afectada),
          unidad_medida: evento.unidad_medida_evento ?? null,
        };

      case TipoEventoVivero.INCORPORACION:
        return {
          tipo: TipoEventoVivero.INCORPORACION,
          cantidad: num(evento.cantidad_afectada),
          procedencia:
            (Array.isArray(evento.incorporacion)
              ? evento.incorporacion[0]
              : evento.incorporacion) ?? null,
        };

      case TipoEventoVivero.EMBOLSADO:
        return {
          tipo: TipoEventoVivero.EMBOLSADO,
          plantas_vivas_iniciales: num(evento.saldo_vivo_despues),
        };

      case TipoEventoVivero.ADAPTABILIDAD:
        return {
          tipo: TipoEventoVivero.ADAPTABILIDAD,
          subetapa_destino: evento.subetapa_destino ?? null,
          saldo_vivo_antes: num(evento.saldo_vivo_antes),
          saldo_vivo_despues: num(evento.saldo_vivo_despues),
        };

      case TipoEventoVivero.DESCARTE_PRE_EMBOLSADO:
        return {
          tipo: TipoEventoVivero.DESCARTE_PRE_EMBOLSADO,
          cantidad_material_afectado: num(evento.cantidad_afectada),
          unidad_medida_evento: evento.unidad_medida_evento ?? null,
          causa_descarte_pre_embolsado:
            evento.causa_descarte_pre_embolsado ?? null,
        };

      case TipoEventoVivero.MERMA:
        return {
          tipo: TipoEventoVivero.MERMA,
          cantidad_afectada: num(evento.cantidad_afectada),
          causa_merma: evento.causa_merma ?? null,
          saldo_vivo_antes: num(evento.saldo_vivo_antes),
          saldo_vivo_despues: num(evento.saldo_vivo_despues),
        };

      case TipoEventoVivero.DESPACHO:
        return {
          tipo: TipoEventoVivero.DESPACHO,
          ...this.vinculosPlantacion(evento),
          cantidad_afectada: num(evento.cantidad_afectada),
          destino_tipo: evento.destino_tipo ?? null,
          destino_referencia: evento.destino_referencia ?? null,
          saldo_vivo_antes: num(evento.saldo_vivo_antes),
          saldo_vivo_despues: num(evento.saldo_vivo_despues),
        };

      case TipoEventoVivero.DEVOLUCION_PLANTACION:
        return {
          tipo: TipoEventoVivero.DEVOLUCION_PLANTACION,
          ...this.vinculosPlantacion(evento),
          naturaleza_devolucion: 'NO_REGISTRADA',
          cantidad_afectada: num(evento.cantidad_afectada),
          saldo_vivo_antes: num(evento.saldo_vivo_antes),
          saldo_vivo_despues: num(evento.saldo_vivo_despues),
        };

      case TipoEventoVivero.CIERRE_AUTOMATICO:
        return {
          tipo: TipoEventoVivero.CIERRE_AUTOMATICO,
          motivo_cierre: evento.motivo_cierre_calculado ?? null,
        };

      default: {
        const _exhaustive: never = evento.tipo_evento;
        throw new InternalServerErrorException(
          `Tipo de evento no reconocido: ${String(_exhaustive)}`,
        );
      }
    }
  }
}
