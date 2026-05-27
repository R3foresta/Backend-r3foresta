import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export type SubcampaniaUsuario = {
  id: number;
  nombre: string;
  rol: string;
};

@Injectable()
export class SubcampaniasAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<SubcampaniaUsuario> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('usuario')
      .select('id, nombre, rol')
      .eq('auth_id', authId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `Usuario con auth_id ${authId} no encontrado`,
      );
    }

    return data as SubcampaniaUsuario;
  }

  assertAdmin(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo el rol ADMIN puede realizar esta operación.',
      );
    }
  }
}
