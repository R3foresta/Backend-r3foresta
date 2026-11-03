import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

type BorradorEliminado = {
  recoleccion_id: number;
  eliminado_en: string;
  eliminado_por_usuario_id: number;
};

@Injectable()
export class RecoleccionEliminacionService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async eliminarBorrador(id: number, actorUsuarioId: string) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException(
        'El id debe ser un entero positivo seguro.',
      );
    }

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('fn_recoleccion_eliminar_borrador', {
        p_recoleccion_id: id,
        p_actor_id: actorUsuarioId,
      });

    if (error) {
      switch (error.code) {
        case 'P0002':
          throw new NotFoundException('Recolección no encontrada.');
        case '42501':
          throw new ForbiddenException(
            'Se requiere cuenta interna activa y ser el creador o un ADMIN.',
          );
        case 'P0001':
          throw new ConflictException(
            'Solo se puede eliminar una recolección en BORRADOR.',
          );
        case '40001':
        case '55P03':
        case '57014':
          throw new ConflictException(
            'La recolección está siendo modificada. Vuelve a intentarlo.',
          );
        default:
          throw new InternalServerErrorException(
            'No se pudo eliminar el borrador.',
          );
      }
    }

    if (!data) {
      throw new InternalServerErrorException(
        'No se pudo eliminar el borrador.',
      );
    }

    return { success: true, data: data as BorradorEliminado };
  }
}
