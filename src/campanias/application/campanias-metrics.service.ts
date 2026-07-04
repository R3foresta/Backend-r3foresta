import { Injectable } from '@nestjs/common';
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

@Injectable()
export class CampaniasMetricsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly consultasService: CampaniasConsultasService,
    private readonly activityService: CampaniasActivityService,
  ) {}

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
}
