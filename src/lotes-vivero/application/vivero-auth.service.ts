import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export type ViveroUsuario = {
  id: number;
  nombre: string;
  rol: string;
};

@Injectable()
export class ViveroAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<ViveroUsuario> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('usuario')
      .select('id, nombre, rol')
      .eq('auth_id', authId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Usuario con auth_id ${authId} no encontrado`);
    }

    return data as ViveroUsuario;
  }

  assertCanWrite(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['ADMIN', 'GENERAL'].includes(role)) {
      throw new ForbiddenException(
        'No tienes permisos para operar lotes de vivero.',
      );
    }
  }
}
