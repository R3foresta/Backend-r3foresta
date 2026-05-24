import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      throw new NotFoundException(
        `Usuario con auth_id ${authId} no encontrado`,
      );
    }

    return data as ViveroUsuario;
  }

  // TODO(vivero-mvp): revisar matriz de permisos contra la doc oficial.
  //   Spec: RN-VIV-42/RN-VIV-43 define 4 roles con alcances distintos:
  //     - ADMIN: parametriza, consulta y administra.
  //     - GENERAL: registra eventos y consulta.
  //     - VALIDADOR: existe globalmente pero NO activa flujo especial en este módulo.
  //     - VOLUNTARIO: NO debería registrar eventos críticos salvo parametrización explícita.
  //   Hoy permitimos ADMIN/VALIDADOR/GENERAL con los mismos privilegios y excluimos
  //   VOLUNTARIO sin diferenciación. Sensible: tocar esto afecta toda la cadena de
  //   escritura del módulo. Confirmar con product la matriz definitiva antes de cambiar.
  assertCanWrite(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['ADMIN', 'VALIDADOR', 'GENERAL'].includes(role)) {
      throw new ForbiddenException(
        'No tienes permisos para operar lotes de vivero.',
      );
    }
  }
}
