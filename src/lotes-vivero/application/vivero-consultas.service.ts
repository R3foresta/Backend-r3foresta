import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { FiltrarLotesViveroDto } from '../api/dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';

@Injectable()
export class ViveroConsultasService {
  private readonly logger = new Logger(ViveroConsultasService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

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

    query = this.applyListFilters(query, filters);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('Error al listar lotes de vivero:', error);
      throw new InternalServerErrorException('Error al listar lotes de vivero');
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: (data || []).map((row: any) => this.mapLoteRow(row)),
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
    void loteId;
    void filters;
    throw new NotImplementedException(
      'Pendiente: obtener timeline auditable del lote de vivero.',
    );
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
