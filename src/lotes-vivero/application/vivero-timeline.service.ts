import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';
import { CausaMermaVivero } from '../domain/enums/causa-merma-vivero.enum';
import { DestinoTipoVivero } from '../domain/enums/destino-tipo-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { SubetapaAdaptabilidad } from '../domain/enums/subetapa-adaptabilidad.enum';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';

// ---------------------------------------------------------------------------
// Row types — sin any
// ---------------------------------------------------------------------------

type LoteResumenRow = {
  id: number;
  codigo_trazabilidad: string;
  estado_lote: string;
};

type UsuarioRow = {
  id: number;
  nombre: string;
  apellido: string | null;
};

type EventoTimelineRow = {
  id: number;
  lote_id: number;
  tipo_evento: TipoEventoVivero;
  fecha_evento: string;
  created_at: string;
  responsable_id: number;
  cantidad_afectada: number | null;
  unidad_medida_evento: UnidadMedidaVivero | null;
  causa_merma: CausaMermaVivero | null;
  destino_tipo: DestinoTipoVivero | null;
  destino_referencia: string | null;
  subetapa_destino: SubetapaAdaptabilidad | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
  motivo_cierre_calculado: MotivoCierreLote | null;
  observaciones: string | null;
  usuario: UsuarioRow | null;
};

type EvidenciaTimelineRow = {
  id: number;
  entidad_id: number;
  ruta_archivo: string;
  mime_type: string;
  tipo_archivo: string;
  es_principal: boolean;
  orden: number;
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

type PayloadDespacho = {
  tipo: TipoEventoVivero.DESPACHO;
  cantidad_afectada: number | null;
  destino_tipo: DestinoTipoVivero | null;
  destino_referencia: string | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
};

type PayloadCierreAutomatico = {
  tipo: TipoEventoVivero.CIERRE_AUTOMATICO;
  motivo_cierre: MotivoCierreLote | null;
};

type EventoPayload =
  | PayloadInicio
  | PayloadEmbolsado
  | PayloadAdaptabilidad
  | PayloadMerma
  | PayloadDespacho
  | PayloadCierreAutomatico;

// ---------------------------------------------------------------------------
// Constante de columnas para el SELECT
// ---------------------------------------------------------------------------

const EVENTO_COLUMNS = [
  'id',
  'lote_id',
  'tipo_evento',
  'fecha_evento',
  'created_at',
  'responsable_id',
  'cantidad_afectada',
  'unidad_medida_evento',
  'causa_merma',
  'destino_tipo',
  'destino_referencia',
  'subetapa_destino',
  'saldo_vivo_antes',
  'saldo_vivo_despues',
  'motivo_cierre_calculado',
  'observaciones',
  'usuario:responsable_id (id, nombre, apellido)',
].join(', ');

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

@Injectable()
export class ViveroTimelineService {
  private readonly logger = new Logger(ViveroTimelineService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async obtenerTimeline(loteId: number, filters: FiltrarTimelineLoteDto) {
    const supabase = this.supabaseService.getClient();

    // 1. Verificar que el lote existe
    const lote = await this.obtenerLote(supabase, loteId);

    // 2. Consultar eventos con join a usuario y aplicar filtros
    let query = supabase
      .from('evento_lote_vivero')
      .select(EVENTO_COLUMNS)
      .eq('lote_id', loteId)
      .order('fecha_evento', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (filters.tipo_evento) {
      query = query.eq('tipo_evento', filters.tipo_evento);
    }

    if (filters.responsable_id) {
      query = query.eq('responsable_id', filters.responsable_id);
    }

    if (filters.fecha_inicio) {
      query = query.gte('fecha_evento', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      query = query.lte('fecha_evento', filters.fecha_fin);
    }

    const { data: eventosRaw, error: eventosError } = await query;

    if (eventosError) {
      this.logger.error(
        `Error al obtener timeline del lote ${loteId}:`,
        eventosError,
      );
      throw new InternalServerErrorException(
        'Error al obtener el historial del lote',
      );
    }

    const eventos = (eventosRaw ?? []) as unknown as EventoTimelineRow[];

    if (eventos.length === 0) {
      return {
        success: true,
        data: {
          lote_id: loteId,
          codigo_trazabilidad: lote.codigo_trazabilidad,
          estado_lote: lote.estado_lote,
          total_eventos: 0,
          eventos: [],
        },
      };
    }

    // 3. Cargar evidencias en una sola consulta (evita N+1)
    const eventoIds = eventos.map((e) => Number(e.id));
    const evidenciasPorEvento = await this.cargarEvidenciasBatch(
      supabase,
      eventoIds,
    );

    // 4. Mapear eventos al formato de respuesta
    const eventosMapeados = eventos.map((evento) => {
      const eventoId = Number(evento.id);

      const evidencias = (evidenciasPorEvento.get(eventoId) ?? []).map(
        (ev) => {
          // TODO(vivero-mvp): bucket hardcoded. Ver decisión pendiente en
          //   vivero-evidencias.service.ts. Si se migra a bucket dedicado, sincronizar.
          const { data: urlData } = supabase.storage
            .from('recoleccion_fotos')
            .getPublicUrl(ev.ruta_archivo);

          return {
            id: ev.id,
            ruta_archivo: ev.ruta_archivo,
            mime_type: ev.mime_type,
            tipo_archivo: ev.tipo_archivo,
            es_principal: ev.es_principal,
            orden: ev.orden,
            public_url: urlData.publicUrl,
          };
        },
      );

      const responsable_nombre = this.buildNombreResponsable(evento.usuario);

      return {
        id: eventoId,
        lote_vivero_id: Number(evento.lote_id),
        tipo_evento: evento.tipo_evento,
        fecha_evento: evento.fecha_evento,
        created_at: evento.created_at,
        responsable_id: Number(evento.responsable_id),
        responsable_nombre,
        observaciones: evento.observaciones ?? null,
        payload: this.buildPayload(evento),
        evidencias,
      };
    });

    return {
      success: true,
      data: {
        lote_id: loteId,
        codigo_trazabilidad: lote.codigo_trazabilidad,
        estado_lote: lote.estado_lote,
        total_eventos: eventosMapeados.length,
        eventos: eventosMapeados,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async obtenerLote(
    supabase: SupabaseClient,
    loteId: number,
  ): Promise<LoteResumenRow> {
    const { data, error } = await supabase
      .from('lote_vivero')
      .select('id, codigo_trazabilidad, estado_lote')
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

  private async cargarEvidenciasBatch(
    supabase: SupabaseClient,
    eventoIds: number[],
  ): Promise<Map<number, EvidenciaTimelineRow[]>> {
    if (eventoIds.length === 0) {
      return new Map();
    }

    // Obtener el tipo_entidad_id para EVENTO_LOTE_VIVERO
    const { data: tipoEntidadRaw } = await supabase
      .from('tipos_entidad_evidencia')
      .select('id')
      .ilike('codigo', 'EVENTO_LOTE_VIVERO')
      .eq('activo', true)
      .maybeSingle();

    const tipoEntidad = tipoEntidadRaw as { id: number } | null;

    if (!tipoEntidad) {
      return new Map();
    }

    const { data: evidenciasRaw, error } = await supabase
      .from('evidencias_trazabilidad')
      .select(
        'id, entidad_id, ruta_archivo, mime_type, tipo_archivo, es_principal, orden',
      )
      .eq('tipo_entidad_id', Number(tipoEntidad.id))
      .in('entidad_id', eventoIds)
      .is('eliminado_en', null)
      .order('es_principal', { ascending: false })
      .order('orden', { ascending: true });

    if (error) {
      this.logger.warn(
        'Error al cargar evidencias en batch para timeline:',
        error,
      );
      return new Map();
    }

    const filas = (evidenciasRaw ?? []) as EvidenciaTimelineRow[];
    const mapa = new Map<number, EvidenciaTimelineRow[]>();

    for (const ev of filas) {
      const key = Number(ev.entidad_id);
      const lista = mapa.get(key) ?? [];
      lista.push(ev);
      mapa.set(key, lista);
    }

    return mapa;
  }

  private buildNombreResponsable(usuario: UsuarioRow | null): string | null {
    if (!usuario) return null;
    const apellido = usuario.apellido?.trim() ?? '';
    return apellido
      ? `${usuario.nombre.trim()} ${apellido}`
      : usuario.nombre.trim();
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
          cantidad_afectada: num(evento.cantidad_afectada),
          destino_tipo: evento.destino_tipo ?? null,
          destino_referencia: evento.destino_referencia ?? null,
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
