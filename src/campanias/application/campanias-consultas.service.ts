import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

type CampaniaRow = {
  id: number;
  nombre: string;
  tipo: string;
  descripcion: string | null;
  codigo_trazabilidad: string;
  fecha_estimada_inicio: string | null;
  fecha_estimada_fin: string | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class CampaniasConsultasService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listar() {
    const supabase = this.supabaseService.getClient();

    const { data: campanias, error } = await supabase
      .from('campania')
      .select(
        'id, nombre, tipo, descripcion, codigo_trazabilidad, fecha_estimada_inicio, fecha_estimada_fin, created_at, updated_at',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    if (!campanias || campanias.length === 0)
      return { success: true, data: [] };

    const ids = campanias.map((c) => c.id);

    const [estadosResult, orgsResult, subcampResult] = await Promise.all([
      supabase
        .from('campania_estado')
        .select('campania_id, estado_derivado')
        .in('campania_id', ids),
      supabase
        .from('campania_organizacion')
        .select(
          'campania_id, organizacion_id, organizacion(id, nombre, tipo, activo, logo_url)',
        )
        .in('campania_id', ids),
      supabase
        .from('subcampania')
        .select('campania_id')
        .in('campania_id', ids)
        .is('deleted_at', null),
    ]);

    const estadosMap = new Map<number, string>();
    for (const e of estadosResult.data ?? []) {
      estadosMap.set(Number(e.campania_id), (e as any).estado_derivado);
    }

    const orgsMap = new Map<number, any[]>();
    for (const o of orgsResult.data ?? []) {
      const cid = Number((o as any).campania_id);
      if (!orgsMap.has(cid)) orgsMap.set(cid, []);
      const org = (o as any).organizacion;
      if (org) orgsMap.get(cid)!.push(org);
    }

    const countMap = new Map<number, number>();
    for (const s of subcampResult.data ?? []) {
      const cid = Number((s as any).campania_id);
      countMap.set(cid, (countMap.get(cid) ?? 0) + 1);
    }

    return {
      success: true,
      data: (campanias as CampaniaRow[]).map((c) =>
        this.mapRow(c, estadosMap, orgsMap, countMap),
      ),
    };
  }

  async obtenerPorId(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data: campania, error } = await supabase
      .from('campania')
      .select(
        'id, nombre, tipo, descripcion, codigo_trazabilidad, fecha_estimada_inicio, fecha_estimada_fin, created_at, updated_at',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !campania) {
      throw new NotFoundException(`Campaña con id ${id} no encontrada`);
    }

    const [estadoResult, orgsResult, subcampResult] = await Promise.all([
      supabase
        .from('campania_estado')
        .select('estado_derivado')
        .eq('campania_id', id)
        .single(),
      supabase
        .from('campania_organizacion')
        .select(
          'organizacion_id, organizacion(id, nombre, tipo, activo, logo_url)',
        )
        .eq('campania_id', id),
      supabase
        .from('subcampania')
        .select('id', { count: 'exact', head: true })
        .eq('campania_id', id)
        .is('deleted_at', null),
    ]);

    const estadoDerivado =
      (estadoResult.data as any)?.estado_derivado ?? 'BORRADOR';
    const organizaciones = (orgsResult.data ?? [])
      .map((o: any) => o.organizacion)
      .filter(Boolean);
    const countSubcampanias = subcampResult.count ?? 0;

    return {
      success: true,
      data: {
        id: Number((campania as any).id),
        nombre: (campania as any).nombre,
        tipo: (campania as any).tipo,
        descripcion: (campania as any).descripcion ?? null,
        codigo_trazabilidad: (campania as any).codigo_trazabilidad,
        fecha_estimada_inicio: (campania as any).fecha_estimada_inicio ?? null,
        fecha_estimada_fin: (campania as any).fecha_estimada_fin ?? null,
        estado_derivado: estadoDerivado,
        count_subcampanias: Number(countSubcampanias),
        organizaciones,
        created_at: (campania as any).created_at,
        updated_at: (campania as any).updated_at,
      },
    };
  }

  async asegurarExiste(id: number): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('campania')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Campaña con id ${id} no encontrada`);
    }
  }

  private mapRow(
    c: CampaniaRow,
    estadosMap: Map<number, string>,
    orgsMap: Map<number, any[]>,
    countMap: Map<number, number>,
  ) {
    return {
      id: Number(c.id),
      nombre: c.nombre,
      tipo: c.tipo,
      descripcion: c.descripcion ?? null,
      codigo_trazabilidad: c.codigo_trazabilidad,
      fecha_estimada_inicio: c.fecha_estimada_inicio ?? null,
      fecha_estimada_fin: c.fecha_estimada_fin ?? null,
      estado_derivado: estadosMap.get(Number(c.id)) ?? 'BORRADOR',
      count_subcampanias: countMap.get(Number(c.id)) ?? 0,
      organizaciones: orgsMap.get(Number(c.id)) ?? [],
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  }
}
