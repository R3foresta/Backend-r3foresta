import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { exactId } from '../../common/dto/bigint-id';
import { IncorporarPlantasDto } from '../api/dto/incorporar-plantas.dto';
import { validarProcedenciaIncorporacion } from '../domain/policies/incorporacion.policy';

@Injectable()
export class ViveroIncorporacionService {
  constructor(private readonly supabase: SupabaseService) {}

  async incorporar(actorId: string, dto: IncorporarPlantasDto) {
    const motivo = validarProcedenciaIncorporacion(dto);
    if (motivo) throw new BadRequestException(motivo);
    const { solicitud_id, ...payload } = dto;
    return this.ejecutar('m2_incorporacion_crear', {
      p_actor_id: actorId,
      p_solicitud_id: solicitud_id,
      p_payload: payload,
    });
  }

  recuperar(actorId: string, solicitudId: string) {
    // La RPC verifica cuenta y autoría, sin exigir permiso actual para nueva escritura.
    return this.ejecutar('m2_incorporacion_recuperar', {
      p_actor_id: actorId,
      p_solicitud_id: solicitudId,
    });
  }

  private async ejecutar(nombre: string, args: Record<string, unknown>) {
    let result: {
      data: unknown;
      error: { code?: string; message?: string } | null;
    };
    try {
      result = await this.supabase.getAdminClient().rpc(nombre, args);
    } catch {
      throw this.incierto();
    }
    const { data, error } = result;
    if (error) {
      if (['42501', 'PT403'].includes(error.code ?? ''))
        throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
      if (error.code === '23505')
        throw new ConflictException(
          'SOLICITUD_EN_CONFLICTO: conserve la clave y consulte su resultado.',
        );
      if (
        [
          '22023',
          '22007',
          '22008',
          '22003',
          '23514',
          '23503',
          'P0001',
          'P0002',
        ].includes(error.code ?? '')
      )
        throw new BadRequestException(
          error.message || 'Incorporación inválida.',
        );
      throw this.incierto();
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw this.incierto();
    const recibo = data as Record<string, any>;
    if (recibo.estado === 'SIN_RESULTADO')
      return {
        success: true,
        estado: 'SIN_RESULTADO',
        resultado_concluyente: false,
      };
    if (recibo.estado !== 'CONFIRMADO' || !recibo.data) throw this.incierto();
    try {
      // Rechazar IDs ya redondeados por un transporte incompatible; nunca adivinarlos.
      exactId(recibo.data.lote_vivero_id);
      exactId(recibo.data.evento_incorporacion_id);
      if (!Array.isArray(recibo.data.evidencia_ids_vinculadas))
        throw new Error();
      recibo.data.evidencia_ids_vinculadas.forEach((id: unknown) =>
        exactId(id),
      );
    } catch {
      throw this.incierto();
    }
    return { success: true, ...recibo };
  }

  private incierto() {
    return new ServiceUnavailableException({
      error: {
        codigo: 'RESULTADO_NO_DETERMINADO',
        resultado_concluyente: false,
        mensaje:
          'Conserve solicitud_id, intención y evidencias. Consulte el resultado y, si corresponde, reenvíe explícitamente la misma intención con la misma clave.',
      },
    });
  }
}
