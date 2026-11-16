import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';

export enum TipoHistorialSubcampania {
  BORRADOR_CREADO = 'BORRADOR_CREADO',
  SUBCAMPANIA_ACTIVADA = 'SUBCAMPANIA_ACTIVADA',
  SUBCAMPANIA_COMPLETADA = 'SUBCAMPANIA_COMPLETADA',
  SUBCAMPANIA_FINALIZADA_PARCIAL = 'SUBCAMPANIA_FINALIZADA_PARCIAL',
  SUBCAMPANIA_CANCELADA = 'SUBCAMPANIA_CANCELADA',
  TRANSICION_A_MONITOREO_HISTORICO = 'TRANSICION_A_MONITOREO_HISTORICO',
  EQUIPO_AMPLIADO = 'EQUIPO_AMPLIADO',
  EQUIPO_REDUCIDO = 'EQUIPO_REDUCIDO',
  COORDINADOR_CAMBIADO = 'COORDINADOR_CAMBIADO',
  PLAN_REVISADO = 'PLAN_REVISADO',
}

export type RegistrarEventoParams = {
  subcampaniaId: number;
  tipo: TipoHistorialSubcampania;
  actorUserId: number | null;
  estadoOrigen?: EstadoSubcampania | null;
  estadoDestino?: EstadoSubcampania | null;
  observaciones?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class SubcampaniasHistorialService {
  private readonly logger = new Logger(SubcampaniasHistorialService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async registrar(params: RegistrarEventoParams): Promise<void> {
    // Estos eventos son obligatorios dentro de sus RPC transaccionales.
    if (params.tipo === TipoHistorialSubcampania.PLAN_REVISADO) {
      throw new Error('PLAN_REVISADO requiere fn_subcampania_revisar_plan.');
    }
    if (params.tipo === TipoHistorialSubcampania.BORRADOR_CREADO) {
      throw new Error('BORRADOR_CREADO requiere pa_d_subcampania_crear.');
    }
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase.from('subcampania_historial').insert({
      subcampania_id: params.subcampaniaId,
      tipo_historial: params.tipo,
      estado_origen: params.estadoOrigen ?? null,
      estado_destino: params.estadoDestino ?? null,
      observaciones: params.observaciones ?? null,
      metadata: params.metadata ?? {},
      actor_user_id: params.actorUserId,
    });

    if (error) {
      // El historial restante conserva su comportamiento best-effort:
      // si la tabla aun no fue migrada en el entorno, no rompemos el flujo.
      // Logueamos para que el operador la revise.
      this.logger.warn(
        `No se pudo registrar historial ${params.tipo} para subcampania ${params.subcampaniaId}: ${error.message}`,
      );
    }
  }
}
