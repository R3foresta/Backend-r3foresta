import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { FiltrarLotesViveroDto } from '../api/dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';
import { CausaMermaVivero } from '../domain/enums/causa-merma-vivero.enum';
import { DestinoTipoVivero } from '../domain/enums/destino-tipo-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { SubetapaAdaptabilidad } from '../domain/enums/subetapa-adaptabilidad.enum';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';
import { ViveroTimelineService } from './vivero-timeline.service';

type EventoSnapshot = {
  id: number;
  fecha_evento: string;
  created_at: string;
  responsable_id: number;
  cantidad_afectada: number | null;
  unidad_medida_evento: UnidadMedidaVivero | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
  subetapa_destino: SubetapaAdaptabilidad | null;
  causa_merma: CausaMermaVivero | null;
  destino_tipo: DestinoTipoVivero | null;
  destino_referencia: string | null;
  motivo_cierre_calculado: MotivoCierreLote | null;
};

type UltimoEventoPorTipo = {
  [K in TipoEventoVivero]: EventoSnapshot | null;
};

type EventoSnapshotRow = {
  id: number | string;
  tipo_evento: TipoEventoVivero;
  fecha_evento: string;
  created_at: string;
  responsable_id: number | string;
  cantidad_afectada: number | string | null;
  unidad_medida_evento: UnidadMedidaVivero | null;
  saldo_vivo_antes: number | string | null;
  saldo_vivo_despues: number | string | null;
  subetapa_destino: SubetapaAdaptabilidad | null;
  causa_merma: CausaMermaVivero | null;
  destino_tipo: DestinoTipoVivero | null;
  destino_referencia: string | null;
  motivo_cierre_calculado: MotivoCierreLote | null;
};

@Injectable()
export class ViveroConsultasService {
  private readonly logger = new Logger(ViveroConsultasService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly timelineService: ViveroTimelineService,
  ) { }

  async listarLotes(filters: FiltrarLotesViveroDto) {
    const supabase = this.supabaseService.getClient();
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('lote_vivero')
      .select(this.getLoteViveroSelect(), { count: 'exact' })
      .order('fecha_inicio', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.subcampania_id) {
      const { data: asigData } = await supabase
        .from('asignacion_vivero_subcampania')
        .select('lote_vivero_id')
        .eq('subcampania_id', filters.subcampania_id)
        .eq('estado', 'ACTIVA');
      const loteIds = (asigData || []).map((a: any) => Number(a.lote_vivero_id));
      if (loteIds.length === 0) {
        query = query.in('id', [-1]);
      } else {
        query = query.in('id', loteIds);
      }
    }

    query = this.applyListFilters(query, filters);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('Error al listar lotes de vivero:', error);
      throw new InternalServerErrorException('Error al listar lotes de vivero');
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    const loteIds = (data || []).map((row: any) => Number(row.id));
    const saldosMap = new Map<number, { saldo_asignado_total: number; saldo_vivo_disponible_asignacion: number | null }>();
    const countsMap = new Map<number, number>();

    if (loteIds.length > 0) {
      // 1. Cargar saldos
      const { data: saldosData, error: saldosError } = await supabase
        .from('v_lote_vivero_saldos')
        .select('lote_id, saldo_asignado_total, saldo_vivo_disponible_asignacion')
        .in('lote_id', loteIds);

      if (!saldosError && saldosData) {
        saldosData.forEach((s: any) => {
          saldosMap.set(Number(s.lote_id), {
            saldo_asignado_total: Number(s.saldo_asignado_total || 0),
            saldo_vivo_disponible_asignacion: s.saldo_vivo_disponible_asignacion !== null ? Number(s.saldo_vivo_disponible_asignacion) : null,
          });
        });
      }

      // 2. Cargar cantidad de asignaciones activas
      const { data: asigData, error: asigError } = await supabase
        .from('asignacion_vivero_subcampania')
        .select('lote_vivero_id')
        .eq('estado', 'ACTIVA')
        .in('lote_vivero_id', loteIds);

      if (!asigError && asigData) {
        asigData.forEach((a: any) => {
          const lid = Number(a.lote_vivero_id);
          countsMap.set(lid, (countsMap.get(lid) || 0) + 1);
        });
      }
    }

    return {
      success: true,
      data: (data || []).map((row: any) => {
        const mapped = this.mapLoteRow(row);
        const saldos = saldosMap.get(mapped.id);
        const activeAsigCount = countsMap.get(mapped.id) || 0;
        return {
          ...mapped,
          saldo_asignado_total: saldos ? saldos.saldo_asignado_total : 0,
          saldo_vivo_disponible_asignacion: saldos && saldos.saldo_vivo_disponible_asignacion !== null
            ? saldos.saldo_vivo_disponible_asignacion
            : mapped.saldo_vivo_actual,
          cantidad_asignaciones_activas: activeAsigCount,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1 && totalPages > 0,
      },
    };
  }

  async obtenerTimeline(loteId: number, filters: FiltrarTimelineLoteDto) {
    return this.timelineService.obtenerTimeline(loteId, filters);
  }

  // ---------------------------------------------------------------------------
  // GET /lotes-vivero/:id
  // Detalle del lote + snapshot del último evento por tipo. Evita N+1 calls
  // desde el frontend para validaciones de fecha contra eventos previos
  // (RN-VIV-10/RN-VIV-33).
  // ---------------------------------------------------------------------------
  async obtenerDetalle(loteId: number) {
    const supabase = this.supabaseService.getClient();

    const { data: loteRow, error: loteError } = await supabase
      .from('lote_vivero')
      .select(this.getLoteViveroSelect())
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error(
        `Error al obtener detalle del lote ${loteId}:`,
        loteError,
      );
      throw new InternalServerErrorException(
        'Error al obtener detalle del lote',
      );
    }

    if (!loteRow) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    // Obtener saldos y cantidad de asignaciones
    let saldoAsignadoTotal = 0;
    let saldoVivoDisponibleAsignacion: number | null = null;
    let activeAsigCount = 0;

    const { data: saldosData } = await supabase
      .from('v_lote_vivero_saldos')
      .select('saldo_asignado_total, saldo_vivo_disponible_asignacion')
      .eq('lote_id', loteId)
      .maybeSingle();

    if (saldosData) {
      saldoAsignadoTotal = Number(saldosData.saldo_asignado_total || 0);
      saldoVivoDisponibleAsignacion = saldosData.saldo_vivo_disponible_asignacion !== null
        ? Number(saldosData.saldo_vivo_disponible_asignacion)
        : null;
    }

    const { data: asigData } = await supabase
      .from('asignacion_vivero_subcampania')
      .select('id')
      .eq('lote_vivero_id', loteId)
      .eq('estado', 'ACTIVA');

    if (asigData) {
      activeAsigCount = asigData.length;
    }

    const { data: eventosRaw, error: eventosError } = await supabase
      .from('evento_lote_vivero')
      .select(
        [
          'id',
          'tipo_evento',
          'fecha_evento',
          'created_at',
          'responsable_id',
          'cantidad_afectada',
          'unidad_medida_evento',
          'saldo_vivo_antes',
          'saldo_vivo_despues',
          'subetapa_destino',
          'causa_merma',
          'destino_tipo',
          'destino_referencia',
          'motivo_cierre_calculado',
        ].join(', '),
      )
      .eq('lote_id', loteId)
      .order('fecha_evento', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (eventosError) {
      this.logger.error(
        `Error al obtener eventos del lote ${loteId}:`,
        eventosError,
      );
      throw new InternalServerErrorException(
        'Error al obtener eventos del lote',
      );
    }

    const ultimoEventoPorTipo = this.buildUltimoEventoPorTipo(
      (eventosRaw ?? []) as unknown as EventoSnapshotRow[],
    );

    const mapped = this.mapLoteRow(loteRow);
    return {
      success: true,
      data: {
        ...mapped,
        saldo_asignado_total: saldoAsignadoTotal,
        saldo_vivo_disponible_asignacion: saldoVivoDisponibleAsignacion !== null
          ? saldoVivoDisponibleAsignacion
          : mapped.saldo_vivo_actual,
        cantidad_asignaciones_activas: activeAsigCount,
        ultimo_evento_por_tipo: ultimoEventoPorTipo,
      },
    };
  }

  private buildUltimoEventoPorTipo(
    eventos: EventoSnapshotRow[],
  ): UltimoEventoPorTipo {
    const result: UltimoEventoPorTipo = {
      [TipoEventoVivero.INICIO]: null,
      [TipoEventoVivero.EMBOLSADO]: null,
      [TipoEventoVivero.ADAPTABILIDAD]: null,
      [TipoEventoVivero.MERMA]: null,
      [TipoEventoVivero.DESPACHO]: null,
      [TipoEventoVivero.CIERRE_AUTOMATICO]: null,
    };

    // Eventos vienen ordenados DESC por (fecha_evento, created_at, id), así que
    // el primer match por tipo es el más reciente.
    for (const ev of eventos) {
      if (result[ev.tipo_evento] === null) {
        result[ev.tipo_evento] = this.mapEventoSnapshot(ev);
      }
    }

    return result;
  }

  private mapEventoSnapshot(ev: EventoSnapshotRow): EventoSnapshot {
    const num = (v: number | string | null): number | null =>
      v === null || v === undefined ? null : Number(v);

    return {
      id: Number(ev.id),
      fecha_evento: ev.fecha_evento,
      created_at: ev.created_at,
      responsable_id: Number(ev.responsable_id),
      cantidad_afectada: num(ev.cantidad_afectada),
      unidad_medida_evento: ev.unidad_medida_evento ?? null,
      saldo_vivo_antes: num(ev.saldo_vivo_antes),
      saldo_vivo_despues: num(ev.saldo_vivo_despues),
      subetapa_destino: ev.subetapa_destino ?? null,
      causa_merma: ev.causa_merma ?? null,
      destino_tipo: ev.destino_tipo ?? null,
      destino_referencia: ev.destino_referencia ?? null,
      motivo_cierre_calculado: ev.motivo_cierre_calculado ?? null,
    };
  }

  private applyListFilters(query: any, filters: FiltrarLotesViveroDto) {
    let nextQuery = query;

    if (filters.estado_lote) {
      nextQuery = nextQuery.eq('estado_lote', filters.estado_lote);
    }

    if (filters.vivero_id) {
      nextQuery = nextQuery.eq('vivero_id', filters.vivero_id);
    }

    if (filters.recoleccion_id) {
      nextQuery = nextQuery.eq('recoleccion_id', filters.recoleccion_id);
    }

    if (filters.lote_vivero_id) {
      nextQuery = nextQuery.eq('id', filters.lote_vivero_id);
    }

    if (filters.motivo_cierre) {
      nextQuery = nextQuery.eq('motivo_cierre', filters.motivo_cierre);
    }

    if (filters.fecha_inicio) {
      nextQuery = nextQuery.gte('fecha_inicio', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      nextQuery = nextQuery.lte('fecha_inicio', filters.fecha_fin);
    }

    const searchTerm = filters.q?.trim();
    if (searchTerm) {
      const safeTerm = this.escapePostgrestOrTerm(searchTerm);
      nextQuery = nextQuery.or(
        [
          `codigo_trazabilidad.ilike.%${safeTerm}%`,
          `nombre_cientifico_snapshot.ilike.%${safeTerm}%`,
          `nombre_comercial_snapshot.ilike.%${safeTerm}%`,
          `variedad_snapshot.ilike.%${safeTerm}%`,
          `nombre_comunidad_origen_snapshot.ilike.%${safeTerm}%`,
          `nombre_responsable_snapshot.ilike.%${safeTerm}%`,
        ].join(','),
      );
    }

    return nextQuery;
  }

  private getLoteViveroSelect(): string {
    return `
      id,
      codigo_trazabilidad,
      estado_lote,
      motivo_cierre,
      recoleccion_id,
      planta_id,
      vivero_id,
      responsable_id,
      nombre_cientifico_snapshot,
      nombre_comercial_snapshot,
      tipo_material_snapshot,
      variedad_snapshot,
      nombre_comunidad_origen_snapshot,
      nombre_responsable_snapshot,
      fecha_inicio,
      cantidad_inicial_en_proceso,
      unidad_medida_inicial,
      plantas_vivas_iniciales,
      saldo_vivo_actual,
      subetapa_actual,
      created_at,
      updated_at,
      vivero:vivero_id (
        id,
        codigo,
        nombre
      ),
      recoleccion:recoleccion_id (
        id,
        codigo_trazabilidad,
        fecha,
        tipo_material,
        estado_registro,
        estado_operativo,
        saldo_actual,
        unidad_canonica
      ),
      planta:planta_id (
        id,
        especie,
        nombre_cientifico,
        nombre_comun_principal,
        variedad,
        imagen_url
      ),
      responsable:responsable_id (
        id,
        nombre,
        apellido,
        username,
        correo
      )
    `;
  }

  private mapLoteRow(row: any) {
    const saldoVivoActual =
      row.saldo_vivo_actual === null || row.saldo_vivo_actual === undefined
        ? null
        : Number(row.saldo_vivo_actual);

    return {
      id: Number(row.id),
      codigo_trazabilidad: row.codigo_trazabilidad,
      estado_lote: row.estado_lote,
      motivo_cierre: row.motivo_cierre,
      recoleccion_id: Number(row.recoleccion_id),
      planta_id: Number(row.planta_id),
      vivero_id: Number(row.vivero_id),
      responsable_id: Number(row.responsable_id),
      nombre_cientifico_snapshot: row.nombre_cientifico_snapshot,
      nombre_comercial_snapshot: row.nombre_comercial_snapshot,
      tipo_material_snapshot: row.tipo_material_snapshot,
      variedad_snapshot: row.variedad_snapshot,
      nombre_comunidad_origen_snapshot: row.nombre_comunidad_origen_snapshot,
      nombre_responsable_snapshot: row.nombre_responsable_snapshot,
      fecha_inicio: row.fecha_inicio,
      cantidad_inicial_en_proceso: Number(row.cantidad_inicial_en_proceso),
      unidad_medida_inicial: row.unidad_medida_inicial,
      plantas_vivas_iniciales:
        row.plantas_vivas_iniciales === null ||
          row.plantas_vivas_iniciales === undefined
          ? null
          : Number(row.plantas_vivas_iniciales),
      saldo_vivo_actual: saldoVivoActual,
      stock_vivo_actual: saldoVivoActual,
      subetapa_actual: row.subetapa_actual,
      created_at: row.created_at,
      updated_at: row.updated_at,
      vivero: row.vivero ?? null,
      recoleccion: row.recoleccion ?? null,
      planta: row.planta ?? null,
      responsable: row.responsable ?? null,
    };
  }

  private escapePostgrestOrTerm(term: string): string {
    return term.replace(/[%_,()]/g, '\\$&');
  }
}
