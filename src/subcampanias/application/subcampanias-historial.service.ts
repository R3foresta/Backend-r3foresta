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
    const supabase = this.supabaseService.getClient();

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
      // El historial es best-effort para las transiciones iniciales:
      // si la tabla aun no fue migrada en el entorno, no rompemos el flujo.
      // Logueamos para que el operador la revise.
      this.logger.warn(
        `No se pudo registrar historial ${params.tipo} para subcampania ${params.subcampaniaId}: ${error.message}`,
      );
    }
  }
}
