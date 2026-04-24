import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';

export enum TipoHistorialRecoleccion {
  BORRADOR_CREADO = 'BORRADOR_CREADO',
  SOLICITUD_VALIDACION = 'SOLICITUD_VALIDACION',
  VALIDACION_APROBADA = 'VALIDACION_APROBADA',
  VALIDACION_RECHAZADA = 'VALIDACION_RECHAZADA',
  BORRADOR_ELIMINADO = 'BORRADOR_ELIMINADO',
}

type RegistrarEventoParams = {
  recoleccionId: number;
  tipoHistorial: TipoHistorialRecoleccion;
  estadoOrigen?: EstadoRegistro | null;
  estadoDestino?: EstadoRegistro | null;
  observaciones?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: number | null;
};

@Injectable()
export class RecoleccionHistorialService {
  private readonly logger = new Logger(RecoleccionHistorialService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async registrarEvento(params: RegistrarEventoParams): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase.from('recoleccion_historial').insert({
      recoleccion_id: params.recoleccionId,
      tipo_historial: params.tipoHistorial,
      estado_origen: params.estadoOrigen ?? null,
      estado_destino: params.estadoDestino ?? null,
      observaciones: this.toTrimmedString(params.observaciones),
      metadata: params.metadata ?? {},
      actor_user_id: params.actorUserId ?? null,
    });

    if (error) {
      const errorMessage = [
        error.message,
        error.details,
        error.hint,
        error.code,
      ]
        .filter(Boolean)
        .join(' | ');

      this.logger.error(
        `❌ Error al registrar historial de recolección (recoleccion_id=${params.recoleccionId}, tipo=${params.tipoHistorial}): ${errorMessage}`,
      );
      throw new InternalServerErrorException(
        `Error al registrar historial de recolección: ${error.message}`,
      );
    }
  }

  private toTrimmedString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
