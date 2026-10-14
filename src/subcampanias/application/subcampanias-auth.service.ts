import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export type SubcampaniaUsuario = {
  id: number;
  nombre: string;
  rol: string;
  activo?: boolean;
};

@Injectable()
export class SubcampaniasAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<SubcampaniaUsuario> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('usuario')
      .select('id, nombre, rol, activo')
      .eq('auth_id', authId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new InternalServerErrorException(
        'No se pudo verificar el usuario.',
      );
    }
    if (error || !data) {
      throw new NotFoundException(
        `Usuario con auth_id ${authId} no encontrado`,
      );
    }

    if (data.activo !== true) {
      throw new ForbiddenException('CUENTA_INACTIVA');
    }
    if (!Number.isSafeInteger(Number(data.id)) || Number(data.id) <= 0) {
      throw new InternalServerErrorException(
        'ID fuera del rango seguro del contrato interno.',
      );
    }
    return data as SubcampaniaUsuario;
  }

  async getAuthenticatedUser(authId: string): Promise<SubcampaniaUsuario> {
    if (!authId?.trim()) {
      throw new UnauthorizedException('La sesión no identifica a un usuario.');
    }
    try {
      return await this.getUserByAuthId(authId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('El usuario de la sesión no existe.');
      }
      throw error;
    }
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
