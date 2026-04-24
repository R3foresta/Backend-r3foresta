import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export type RecoleccionUsuario = {
  id: number;
  nombre: string;
  rol: string;
};

@Injectable()
export class RecoleccionAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<RecoleccionUsuario> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('usuario')
      .select('id, nombre, rol')
      .eq('auth_id', authId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Usuario con auth_id ${authId} no encontrado`);
    }

    return data as RecoleccionUsuario;
  }

  assertCanCreate(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['ADMIN', 'GENERAL'].includes(role)) {
      throw new ForbiddenException(
        'No tienes permisos para crear recolecciones. Solo usuarios con rol ADMIN o GENERAL pueden realizar esta acción.',
      );
    }
  }

  assertOwnerOrAdmin(
    recoleccion: { usuario_id: number },
    userId: number,
    userRole: string,
  ): void {
    const role = String(userRole ?? '').toUpperCase();
    if (recoleccion.usuario_id !== userId && role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo el creador de la recolección o un ADMIN pueden realizar esta acción.',
      );
    }
  }

  assertReviewerRole(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['VALIDADOR', 'ADMIN'].includes(role)) {
      throw new ForbiddenException(
        'Solo usuarios con rol VALIDADOR o ADMIN pueden realizar esta acción.',
      );
    }
  }

  isGlobalReviewer(userRole: string): boolean {
    return ['VALIDADOR', 'ADMIN'].includes(String(userRole ?? '').toUpperCase());
  }
}
