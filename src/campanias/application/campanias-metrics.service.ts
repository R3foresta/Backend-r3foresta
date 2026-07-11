import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasActivityService } from './campanias-activity.service';
import { CampaniasConsultasService } from './campanias-consultas.service';

export type CampaniaMetrics = {
  supervivencia_pct: number;
  co2_proyectado_ton: number;
  hectareas: number;
  comunidades_count: number;
  eventos_count: number;
  ultima_actividad: {
    autor: string;
    detalle: string;
    timestamp: string;
  } | null;
};

export type CampaniasResumenGlobal = {
  arboles_plantados_total: number;
  avance_meta_pct: number;
  supervivencia_pct: number;
  hectareas_total: number;
  campanias_activas: number;
  campanias_totales: number;
  subcampanias_activas: number;
  subcampanias_totales: number;
};

type SubcampaniaResumenRow = {
  estado: string;
  area_hectareas: number | string | null;
  meta_total_arboles: number | string | null;
  total_plantado_inicial: number | string | null;
  total_repuesto: number | string | null;
  saldo_vivo_actual: number | string | null;
};

type CampaniaEstadoRow = {
  campania_id: number | string;
  estado_derivado: string;
};

@Injectable()
export class CampaniasMetricsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly consultasService: CampaniasConsultasService,
    private readonly activityService: CampaniasActivityService,
  ) {}

  async obtenerResumenGlobal(): Promise<CampaniasResumenGlobal> {
    const supabase = this.supabaseService.getClient();

    const { data: campaniasRows, error: campaniasError } = await supabase
      .from('campania')
      .select('id')
      .is('deleted_at', null);

    if (campaniasError) {
      throw new BadRequestException(campaniasError.message);
    }

    const campaniaIds = (campaniasRows ?? []).map((c) => Number(c.id));
    const [subcampaniasResult, estadosResult] = await Promise.all([
      campaniaIds.length > 0
        ? supabase
            .from('subcampania')
            .select(
              'estado, area_hectareas, meta_total_arboles, total_plantado_inicial, total_repuesto, saldo_vivo_actual',
            )
            .in('campania_id', campaniaIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      campaniaIds.length > 0
        ? supabase
            .from('campania_estado')
            .select('campania_id, estado_derivado')
            .in('campania_id', campaniaIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (subcampaniasResult.error) {
      throw new BadRequestException(subcampaniasResult.error.message);
    }
    if (estadosResult.error) {
      throw new BadRequestException(estadosResult.error.message);
    }

    const subcampanias = (subcampaniasResult.data ??
      []) as SubcampaniaResumenRow[];
    const estados = (estadosResult.data ?? []) as CampaniaEstadoRow[];
    let plantadoInicialTotal = 0;
    let plantadoConReposicionesTotal = 0;
    let metaTotal = 0;
    let saldoVivoTotal = 0;
    let hectareasTotal = 0;

    for (const subcampania of subcampanias) {
      const plantadoInicial = Number(subcampania.total_plantado_inicial ?? 0);
      plantadoInicialTotal += plantadoInicial;
      plantadoConReposicionesTotal +=
        plantadoInicial + Number(subcampania.total_repuesto ?? 0);
      metaTotal += Number(subcampania.meta_total_arboles ?? 0);
      saldoVivoTotal += Number(subcampania.saldo_vivo_actual ?? 0);
      hectareasTotal += Number(subcampania.area_hectareas ?? 0);
    }

    return {
      // La tarjeta de plantados representa el avance inicial de la meta.
      arboles_plantados_total: plantadoInicialTotal,
      avance_meta_pct: this.porcentaje(plantadoInicialTotal, metaTotal),
      // Supervivencia sí considera todas las plantaciones físicas, incluidas reposiciones.
      supervivencia_pct: this.porcentaje(
        saldoVivoTotal,
        plantadoConReposicionesTotal,
      ),
      hectareas_total: this.round(hectareasTotal, 4),
      campanias_activas: estados.filter(
        (estado) => estado.estado_derivado === 'ACTIVA',
      ).length,
      campanias_totales: campaniaIds.length,
      subcampanias_activas: subcampanias.filter(
        (subcampania) => subcampania.estado === 'ACTIVA',
      ).length,
      subcampanias_totales: subcampanias.length,
    };
  }

  async obtener(campaniaId: number): Promise<CampaniaMetrics> {
    await this.consultasService.asegurarExiste(campaniaId);

    const supabase = this.supabaseService.getClient();

    const { data: subcampaniasRows } = await supabase
      .from('subcampania')
      .select(
        'id, area_hectareas, zona_id, total_plantado_inicial, total_repuesto, saldo_vivo_actual',
      )
      .eq('campania_id', campaniaId)
      .is('deleted_at', null);

    const subcampanias = (subcampaniasRows ?? []) as any[];
    const subIds = subcampanias.map((s) => Number(s.id));

    let plantadoTotal = 0;
    let saldoVivoTotal = 0;
    let hectareas = 0;
    const comunidades = new Set<number>();

    for (const s of subcampanias) {
      const plantado =
        Number(s.total_plantado_inicial ?? 0) + Number(s.total_repuesto ?? 0);
      plantadoTotal += plantado;
      saldoVivoTotal += Number(s.saldo_vivo_actual ?? 0);
      hectareas += Number(s.area_hectareas ?? 0);
      comunidades.add(Number(s.zona_id));
    }

    const supervivenciaPct =
      plantadoTotal > 0 ? (saldoVivoTotal / plantadoTotal) * 100 : 0;

    let eventosCount = 0;
    if (subIds.length > 0) {
      const [registrosCount, eventosPlantacionCount] = await Promise.all([
        supabase
          .from('registro_plantacion')
          .select('*', { count: 'exact', head: true })
          .in('subcampania_id', subIds),
        supabase
          .from('evento_plantacion')
          .select('*', { count: 'exact', head: true })
          .in('subcampania_id', subIds),
      ]);
      eventosCount =
        (registrosCount.count ?? 0) + (eventosPlantacionCount.count ?? 0);
    }

    const actividad = await this.activityService.listar(campaniaId, 1, {
      soloSubcampaniasVivas: true,
    });
    const ultimaActividad = actividad[0]
      ? {
          autor: actividad[0].autor,
          detalle: actividad[0].detalle,
          timestamp: actividad[0].timestamp,
        }
      : null;

    return {
      supervivencia_pct: this.round(supervivenciaPct, 2),
      // TODO(RN-PLA-carbono): fórmula final pendiente de producto. Placeholder
      // proporcional al saldo vivo (~22 kg CO2/árbol/año) para dashboards.
      co2_proyectado_ton: this.round(saldoVivoTotal * 0.022, 2),
      hectareas: this.round(hectareas, 4),
      comunidades_count: comunidades.size,
      eventos_count: eventosCount,
      ultima_actividad: ultimaActividad,
    };
  }

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private porcentaje(numerador: number, denominador: number): number {
    if (denominador <= 0) return 0;
    return this.round(
      Math.min(100, Math.max(0, (numerador / denominador) * 100)),
      2,
    );
  }
}
