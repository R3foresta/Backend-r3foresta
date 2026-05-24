import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

export type PlantacionUsuario = {
  id: number;
  nombre: string;
  rol: string;
};

@Injectable()
export class PlantacionAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<PlantacionUsuario> {
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

    return data as PlantacionUsuario;
  }

  // El permiso operativo sobre la subcampania (pertenencia a SUBCAMPANIA_EQUIPO con
  // rol COORDINADOR u OPERARIO) se valida atomicamente dentro de la RPC. Aca solo
  // exigimos un rol global minimo para evitar que VOLUNTARIOs lleguen al endpoint.
  assertCanWrite(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['ADMIN', 'VALIDADOR', 'GENERAL'].includes(role)) {
      throw new ForbiddenException(
        'No tienes permisos para registrar plantaciones.',
      );
    }
  }
}
