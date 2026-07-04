import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasConsultasService } from './campanias-consultas.service';

export type ActivityItem = {
  id: string;
  tipo:
    | 'plantacion'
    | 'nueva_subcampana'
    | 'activacion'
    | 'cancelacion'
    | 'cambio_coordinador';
  autor: string;
  detalle: string;
  ubicacion: string;
  timestamp: string;
};

const HISTORIAL_TIPO_MAP: Record<string, ActivityItem['tipo']> = {
  BORRADOR_CREADO: 'nueva_subcampana',
  SUBCAMPANIA_ACTIVADA: 'activacion',
  SUBCAMPANIA_CANCELADA: 'cancelacion',
  COORDINADOR_CAMBIADO: 'cambio_coordinador',
};

@Injectable()
export class CampaniasActivityService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly consultasService: CampaniasConsultasService,
  ) {}

  async listar(
    campaniaId: number,
    limit = 5,
    opts: { soloSubcampaniasVivas?: boolean } = {},
  ): Promise<ActivityItem[]> {
    await this.consultasService.asegurarExiste(campaniaId);

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('limit debe ser un entero entre 1 y 50.');
    }

    const supabase = this.supabaseService.getClient();

    // Por defecto incluye subcampañas soft-deleted para que el feed muestre
    // eventos SUBCAMPANIA_CANCELADA (fn_subcampania_cancelar marca deleted_at
    // en la misma transaccion en la que inserta el historial). Metrics pasa
    // soloSubcampaniasVivas=true para alinear ultima_actividad con los totales.
    let subQuery = supabase
      .from('subcampania')
      .select('id, nombre, nombre_zona_snapshot, zona_id')
      .eq('campania_id', campaniaId);
    if (opts.soloSubcampaniasVivas) {
      subQuery = subQuery.is('deleted_at', null);
    }
    const { data: subcampaniasRows } = await subQuery;

    const subcampanias = (subcampaniasRows ?? []) as any[];
    if (subcampanias.length === 0) return [];

    const subIds = subcampanias.map((s) => Number(s.id));
    const zonaIds = Array.from(
      new Set(subcampanias.map((s) => Number(s.zona_id))),
    );

    const [zonasResult, registrosResult, historialResult] = await Promise.all([
      supabase
        .from('division_administrativa')
        .select('id, nombre')
        .in('id', zonaIds),
      supabase
        .from('registro_plantacion')
        .select(
          'id, subcampania_id, fecha_plantacion, created_at, cantidad_total_plantada, responsable_id, nombre_responsable_snapshot, nombre_subcampania_snapshot, nombre_zona_snapshot, usuario!registro_plantacion_responsable_fk(id, nombre)',
        )
        .in('subcampania_id', subIds)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('subcampania_historial')
        .select(
          'id, subcampania_id, tipo_historial, observaciones, created_at, actor_user_id, usuario!subcampania_historial_actor_fk(id, nombre)',
        )
        .in('subcampania_id', subIds)
        .in('tipo_historial', Object.keys(HISTORIAL_TIPO_MAP))
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    const zonaMap = new Map<number, string>();
    for (const z of zonasResult.data ?? []) {
      zonaMap.set(Number((z as any).id), (z as any).nombre);
    }
    const subMap = new Map<
      number,
      { nombre: string; zona_id: number; nombre_zona_snapshot: string | null }
    >();
    for (const s of subcampanias) {
      subMap.set(Number(s.id), {
        nombre: s.nombre,
        zona_id: Number(s.zona_id),
        nombre_zona_snapshot: s.nombre_zona_snapshot ?? null,
      });
    }

    const items: ActivityItem[] = [];

    for (const r of (registrosResult.data ?? []) as any[]) {
      const sub = subMap.get(Number(r.subcampania_id));
      const usuario = Array.isArray(r.usuario) ? r.usuario[0] : r.usuario;
      const autor =
        (r.nombre_responsable_snapshot as string | null) ??
        usuario?.nombre ??
        'Sistema';
      const subNombre =
        (r.nombre_subcampania_snapshot as string | null) ??
        sub?.nombre ??
        `Subcampaña ${r.subcampania_id}`;
      const zonaNombre =
        (r.nombre_zona_snapshot as string | null) ??
        sub?.nombre_zona_snapshot ??
        (sub ? zonaMap.get(sub.zona_id) : null) ??
        '';
      const ubicacion = zonaNombre ? `${subNombre} · ${zonaNombre}` : subNombre;
      items.push({
        id: `registro-${r.id}`,
        tipo: 'plantacion',
        autor,
        detalle: `${Number(r.cantidad_total_plantada)} árboles`,
        ubicacion,
        timestamp: r.created_at,
      });
    }

    for (const h of (historialResult.data ?? []) as any[]) {
      const sub = subMap.get(Number(h.subcampania_id));
      const usuario = Array.isArray(h.usuario) ? h.usuario[0] : h.usuario;
      const tipo = HISTORIAL_TIPO_MAP[h.tipo_historial as string];
      if (!tipo) continue;
      const subNombre = sub?.nombre ?? `Subcampaña ${h.subcampania_id}`;
      const zonaNombre =
        sub?.nombre_zona_snapshot ??
        (sub ? zonaMap.get(sub.zona_id) : null) ??
        '';
      const ubicacion = zonaNombre ? `${subNombre} · ${zonaNombre}` : subNombre;
      items.push({
        id: `historial-${h.id}`,
        tipo,
        autor: usuario?.nombre ?? 'Sistema',
        detalle: (h.observaciones as string | null) ?? '',
        ubicacion,
        timestamp: h.created_at,
      });
    }

    items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return items.slice(0, limit);
  }
}
