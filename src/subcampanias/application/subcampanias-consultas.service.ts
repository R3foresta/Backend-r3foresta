import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export type ListarSubcampaniasFiltros = {
  campania_id?: number;
  estado?: string;
  zona_id?: number;
};

type EquipoMiembro = {
  usuario_id: number;
  nombre_usuario: string | null;
  rol: string;
  foto_perfil_url: string | null;
};

@Injectable()
export class SubcampaniasConsultasService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listar(filtros: ListarSubcampaniasFiltros = {}) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('subcampania')
      .select(
        'id, campania_id, nombre, descripcion, tipo, estado, fase_mantenimiento, zona_id, area_hectareas, meta_total_arboles, codigo_trazabilidad, total_plantado_inicial, total_repuesto, total_muerto_acumulado, saldo_vivo_actual, nombre_zona_snapshot, created_at, updated_at',
      )
      .is('deleted_at', null);

    if (filtros.campania_id !== undefined)
      query = query.eq('campania_id', filtros.campania_id);
    if (filtros.estado !== undefined)
      query = query.eq('estado', filtros.estado);
    if (filtros.zona_id !== undefined)
      query = query.eq('zona_id', filtros.zona_id);

    const { data: subcampanias, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) throw new BadRequestException(error.message);
    if (!subcampanias || subcampanias.length === 0)
      return { success: true, data: [] };

    const rows = subcampanias as any[];
    const ids = rows.map((s) => Number(s.id));
    const zonaIds = Array.from(new Set(rows.map((s) => Number(s.zona_id))));

    const [
      equipoResult,
      zonasResult,
      planResult,
      asignacionesResult,
      registrosResult,
      eventosResult,
    ] = await Promise.all([
      supabase
        .from('subcampania_equipo')
        .select(
          'subcampania_id, usuario_id, rol, usuario!subcampania_equipo_usuario_fk(id, nombre, foto_perfil_url)',
        )
        .in('subcampania_id', ids),
      supabase
        .from('division_administrativa')
        .select('id, nombre')
        .in('id', zonaIds),
      supabase
        .from('subcampania_meta_especie')
        .select('subcampania_id')
        .in('subcampania_id', ids),
      supabase
        .from('asignacion_vivero_subcampania')
        .select('subcampania_id, lote_vivero_id')
        .in('subcampania_id', ids)
        .eq('estado', 'ACTIVA'),
      supabase
        .from('registro_plantacion')
        .select('subcampania_id')
        .in('subcampania_id', ids),
      supabase
        .from('evento_plantacion')
        .select('subcampania_id')
        .in('subcampania_id', ids),
    ]);

    const equipoMap = new Map<number, EquipoMiembro[]>();
    for (const row of equipoResult.data ?? []) {
      const subId = Number((row as any).subcampania_id);
      const usuario = Array.isArray((row as any).usuario)
        ? (row as any).usuario[0]
        : (row as any).usuario;
      const miembro: EquipoMiembro = {
        usuario_id: Number((row as any).usuario_id),
        nombre_usuario: usuario?.nombre ?? null,
        rol: (row as any).rol,
        foto_perfil_url: usuario?.foto_perfil_url ?? null,
      };
      if (!equipoMap.has(subId)) equipoMap.set(subId, []);
      equipoMap.get(subId)!.push(miembro);
    }

    const zonaMap = new Map<number, string>();
    for (const z of zonasResult.data ?? []) {
      zonaMap.set(Number((z as any).id), (z as any).nombre);
    }

    const conPlanSet = new Set<number>();
    for (const row of planResult.data ?? []) {
      conPlanSet.add(Number((row as any).subcampania_id));
    }

    // lotes_count = lotes distintos actualmente vinculados (asignacion ACTIVA).
    // Si el mismo lote se reserva varias veces sigue siendo el mismo lote.
    const lotesPorSubMap = new Map<number, Set<number>>();
    for (const row of asignacionesResult.data ?? []) {
      const subId = Number((row as any).subcampania_id);
      const loteId = Number((row as any).lote_vivero_id);
      if (!lotesPorSubMap.has(subId)) lotesPorSubMap.set(subId, new Set());
      lotesPorSubMap.get(subId)!.add(loteId);
    }

    const registrosCountMap = new Map<number, number>();
    for (const row of registrosResult.data ?? []) {
      const subId = Number((row as any).subcampania_id);
      registrosCountMap.set(subId, (registrosCountMap.get(subId) ?? 0) + 1);
    }

    const eventosCountMap = new Map<number, number>();
    for (const row of eventosResult.data ?? []) {
      const subId = Number((row as any).subcampania_id);
      eventosCountMap.set(subId, (eventosCountMap.get(subId) ?? 0) + 1);
    }

    return {
      success: true,
      data: rows.map((s) => {
        const subId = Number(s.id);
        const equipo = equipoMap.get(subId) ?? [];
        const coordinador =
          equipo.find((m) => m.rol === 'COORDINADOR') ?? null;
        const plantados = Number(s.total_plantado_inicial ?? 0);
        const meta = Number(s.meta_total_arboles ?? 0);
        const avancePct =
          meta > 0
            ? Math.min(100, Math.max(0, (plantados / meta) * 100))
            : null;
        const zonaNombre =
          (s.nombre_zona_snapshot as string | null) ??
          zonaMap.get(Number(s.zona_id)) ??
          null;
        const eventosCount =
          (registrosCountMap.get(subId) ?? 0) +
          (eventosCountMap.get(subId) ?? 0);

        return {
          id: subId,
          campania_id: Number(s.campania_id),
          nombre: s.nombre,
          descripcion: s.descripcion ?? null,
          tipo: s.tipo,
          estado: s.estado,
          fase_mantenimiento: s.fase_mantenimiento,
          zona_id: Number(s.zona_id),
          zona_nombre: zonaNombre,
          area_hectareas: s.area_hectareas ?? null,
          meta_total_arboles: meta,
          codigo_trazabilidad: s.codigo_trazabilidad,
          total_plantado_inicial: plantados,
          total_repuesto: Number(s.total_repuesto),
          total_muerto_acumulado: Number(s.total_muerto_acumulado),
          saldo_vivo_actual: Number(s.saldo_vivo_actual),
          plantados,
          avance_pct: avancePct,
          has_plan_especies: conPlanSet.has(subId),
          personas_count: equipo.length,
          lotes_count: lotesPorSubMap.get(subId)?.size ?? 0,
          eventos_count: eventosCount,
          equipo,
          coordinador: coordinador
            ? {
                id: coordinador.usuario_id,
                nombre: coordinador.nombre_usuario ?? '',
              }
            : null,
          created_at: s.created_at,
          updated_at: s.updated_at,
        };
      }),
    };
  }

  async obtenerPorId(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data: subcampania, error } = await supabase
      .from('subcampania')
      .select(
        'id, campania_id, nombre, descripcion, tipo, estado, fase_mantenimiento, zona_id, area_hectareas, meta_total_arboles, fecha_estimada_inicio, fecha_estimada_fin, fecha_cierre_operativo, fecha_fin_mantenimiento, motivo_cierre_parcial, observaciones_cierre, tolerancia_gps_metros, nombre_zona_snapshot, nombre_coordinador_snapshot, nombres_organizaciones_snapshot, codigo_trazabilidad, total_plantado_inicial, total_repuesto, total_muerto_acumulado, saldo_vivo_actual, created_at, updated_at',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !subcampania) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }

    const [equipoResult, poligonoResult] = await Promise.all([
      supabase
        .from('subcampania_equipo')
        .select(
          'id, usuario_id, rol, agregado_at, usuario!subcampania_equipo_usuario_fk(id, nombre, foto_perfil_url)',
        )
        .eq('subcampania_id', id),
      supabase.rpc('fn_subcampania_poligono_geojson', { p_id: id }),
    ]);

    const equipo = (equipoResult.data ?? []).map((e: any) => {
      const usuario = Array.isArray(e.usuario) ? e.usuario[0] : e.usuario;

      return {
        id: Number(e.id),
        usuario_id: Number(e.usuario_id),
        rol: e.rol,
        agregado_at: e.agregado_at,
        nombre_usuario: usuario?.nombre ?? null,
        foto_perfil_url: usuario?.foto_perfil_url ?? null,
      };
    });

    const poligonoGeoJSON = poligonoResult.data ?? null;

    return {
      success: true,
      data: {
        id: Number((subcampania as any).id),
        campania_id: Number((subcampania as any).campania_id),
        nombre: (subcampania as any).nombre,
        descripcion: (subcampania as any).descripcion ?? null,
        tipo: (subcampania as any).tipo,
        estado: (subcampania as any).estado,
        fase_mantenimiento: (subcampania as any).fase_mantenimiento,
        zona_id: Number((subcampania as any).zona_id),
        area_hectareas: (subcampania as any).area_hectareas ?? null,
        meta_total_arboles: Number((subcampania as any).meta_total_arboles),
        fecha_estimada_inicio:
          (subcampania as any).fecha_estimada_inicio ?? null,
        fecha_estimada_fin: (subcampania as any).fecha_estimada_fin ?? null,
        fecha_cierre_operativo:
          (subcampania as any).fecha_cierre_operativo ?? null,
        fecha_fin_mantenimiento:
          (subcampania as any).fecha_fin_mantenimiento ?? null,
        motivo_cierre_parcial:
          (subcampania as any).motivo_cierre_parcial ?? null,
        observaciones_cierre: (subcampania as any).observaciones_cierre ?? null,
        tolerancia_gps_metros: Number(
          (subcampania as any).tolerancia_gps_metros,
        ),
        nombre_zona_snapshot: (subcampania as any).nombre_zona_snapshot ?? null,
        nombre_coordinador_snapshot:
          (subcampania as any).nombre_coordinador_snapshot ?? null,
        nombres_organizaciones_snapshot:
          (subcampania as any).nombres_organizaciones_snapshot ?? null,
        codigo_trazabilidad: (subcampania as any).codigo_trazabilidad,
        total_plantado_inicial: Number(
          (subcampania as any).total_plantado_inicial,
        ),
        total_repuesto: Number((subcampania as any).total_repuesto),
        total_muerto_acumulado: Number(
          (subcampania as any).total_muerto_acumulado,
        ),
        saldo_vivo_actual: Number((subcampania as any).saldo_vivo_actual),
        poligono_geojson: poligonoGeoJSON,
        equipo,
        created_at: (subcampania as any).created_at,
        updated_at: (subcampania as any).updated_at,
      },
    };
  }
}
