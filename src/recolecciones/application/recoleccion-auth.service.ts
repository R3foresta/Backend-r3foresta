import { leerAmbitosVivero } from '../../lotes-vivero/domain/policies/acceso-vivero.policy';
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AccesoRecoleccionPolicy } from '../domain/policies/acceso-recoleccion.policy';
import { SupabaseService } from '../../supabase/supabase.service';

export type RecoleccionUsuario = {
  id: number | string;
  nombre: string;
  rol: string;
};

@Injectable()
export class RecoleccionAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<RecoleccionUsuario> {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('usuario')
      .select('id::text, nombre, rol, activo')
      .eq('auth_id', authId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (data.activo !== true) throw new ForbiddenException('CUENTA_INACTIVA');
    return data as RecoleccionUsuario;
  }

  async assertCanCreate(
    userRole: string,
    userId: number | string,
  ): Promise<void> {
    if (!AccesoRecoleccionPolicy.rolInterno(String(userRole).toUpperCase())) {
      throw new ForbiddenException(
        'Se requiere cuenta interna activa con acceso M1.',
      );
    }
    if (!(await this.hasM1Access(userRole, userId)))
      throw new ForbiddenException(
        'Se requiere acceso explícito de Recolección.',
      );
  }

  async hasM1Access(
    userRole: string,
    userId: number | string,
  ): Promise<boolean> {
    if (!AccesoRecoleccionPolicy.rolInterno(String(userRole).toUpperCase()))
      return false;
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('m1_acceso_efectivo', { p_usuario_id: userId });
    if (error || typeof data !== 'boolean')
      throw new InternalServerErrorException(
        'No se pudo verificar el acceso M1.',
      );
    return data;
  }

  async assertOwnerOrAdmin(
    recoleccion: { usuario_id: number | string },
    userId: number | string,
    userRole: string,
  ): Promise<void> {
    await this.assertCanCreate(userRole, userId);
    if (
      !AccesoRecoleccionPolicy.puedeMantener(
        userRole,
        userId,
        recoleccion.usuario_id,
      )
    ) {
      throw new ForbiddenException(
        'Solo el creador con M1 o ADMIN pueden mantener la recolección.',
      );
    }
  }

  async assertCanRead(
    recoleccion: {
      usuario_id: number | string;
      vivero_id?: number | string | null;
    },
    userId: number | string,
    userRole: string,
  ): Promise<void> {
    if (userRole === 'ADMIN') return;
    if (userRole === 'VALIDADOR' && recoleccion.vivero_id != null) {
      const ambitos = await this.ambitosRevision({ id: userId, rol: userRole });
      if (ambitos && this.viveroEnAmbitos(recoleccion.vivero_id, ambitos))
        return;
    }
    await this.assertOwnerOrAdmin(recoleccion, userId, userRole);
  }

  assertReviewerRole(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['VALIDADOR', 'ADMIN'].includes(role)) {
      throw new ForbiddenException(
        'Solo usuarios con rol VALIDADOR o ADMIN pueden realizar esta acción.',
      );
    }
  }

  assertAdminRole(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo usuarios con rol ADMIN pueden consultar el dashboard global de recolección.',
      );
    }
  }

  isGlobalReviewer(userRole: string): boolean {
    return ['ADMIN'].includes(String(userRole ?? '').toUpperCase());
  }
  async ambitosRevision(usuario: {
    id: number | string;
    rol: string;
  }): Promise<string[] | null> {
    if (usuario.rol === 'ADMIN') return null;
    if (usuario.rol !== 'VALIDADOR') return [];
    const { data, error } = (await this.supabaseService
      .getAdminClient()
      .rpc('m2_ambitos', { p_actor_id: usuario.id })) as {
      data: unknown;
      error: unknown;
    };
    const ambitos = leerAmbitosVivero(data);
    if (error || !ambitos)
      throw new InternalServerErrorException(
        'No se pudo verificar el alcance de revisión.',
      );
    return ambitos.viveros;
  }

  async assertReviewerVivero(
    usuario: { id: number | string; rol: string },
    vivero: unknown,
  ): Promise<void> {
    this.assertReviewerRole(usuario.rol);
    const ambitos = await this.ambitosRevision(usuario);
    if (ambitos !== null && !this.viveroEnAmbitos(vivero, ambitos))
      throw new ForbiddenException(
        'La revisión documental requiere asignación al vivero de almacenamiento.',
      );
  }

  private viveroEnAmbitos(vivero: unknown, ambitos: string[]): boolean {
    // Un Number inseguro ya perdió la identidad: nunca puede prestar un ámbito.
    return (
      (typeof vivero === 'string' ||
        (typeof vivero === 'number' && Number.isSafeInteger(vivero))) &&
      ambitos.includes(String(vivero))
    );
  }
}
