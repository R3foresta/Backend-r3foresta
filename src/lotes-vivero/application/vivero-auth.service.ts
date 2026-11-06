import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  AccesoViveroPolicy,
  leerAmbitosVivero,
} from '../domain/policies/acceso-vivero.policy';

export type ViveroUsuario = {
  id: number | string;
  nombre: string;
  rol: string;
};

@Injectable()
export class ViveroAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getUserByAuthId(authId: string): Promise<ViveroUsuario> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('usuario')
      .select('id::text, nombre, rol, activo')
      .eq('auth_id', authId)
      .single();
    if (error || !data) throw new NotFoundException('Usuario no encontrado.');
    if (data.activo !== true) throw new ForbiddenException('CUENTA_INACTIVA');
    // Un cliente que devuelve un number inseguro no puede prestar autoridad a otra cuenta.
    if (typeof data.id !== 'string' && !Number.isSafeInteger(data.id))
      throw new InternalServerErrorException('Identidad inexacta.');
    return data as ViveroUsuario;
  }

  async ambitos(usuario: ViveroUsuario): Promise<string[] | null> {
    if (!AccesoViveroPolicy.rolInterno(usuario.rol))
      throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
    const { data, error } = (await this.supabaseService
      .getAdminClient()
      .rpc('m2_ambitos', { p_actor_id: usuario.id })) as {
      data: unknown;
      error: unknown;
    };
    const ambitos = leerAmbitosVivero(data);
    if (error || !ambitos)
      throw new InternalServerErrorException(
        'No se pudo verificar el acceso por vivero.',
      );
    if (ambitos.global && usuario.rol === 'ADMIN') return null;
    return ambitos.viveros;
  }

  async assertVivero(
    usuario: ViveroUsuario,
    vivero: number | string | null | undefined,
  ): Promise<void> {
    const ambitos = await this.ambitos(usuario);
    if (ambitos === null) return;
    const exacto = vivero == null ? '' : String(vivero);
    if (
      (typeof vivero === 'number' && !Number.isSafeInteger(vivero)) ||
      !AccesoViveroPolicy.autorizado(usuario.rol, exacto, ambitos)
    )
      throw new ForbiddenException(
        'CAPACIDAD_INSUFICIENTE: no tiene acceso a este vivero.',
      );
  }

  async assertLote(
    usuario: ViveroUsuario,
    loteId: number | string,
  ): Promise<string> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('lote_vivero')
      .select('vivero_id::text')
      .eq('id', loteId)
      .maybeSingle();
    if (error)
      throw new InternalServerErrorException('No se pudo verificar el lote.');
    if (!data) throw new NotFoundException('Lote no encontrado.');
    await this.assertVivero(usuario, data.vivero_id);
    return String(data.vivero_id);
  }

  async assertEvento(
    usuario: ViveroUsuario,
    eventoId: number | string,
  ): Promise<void> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('evento_lote_vivero')
      .select('lote_id::text')
      .eq('id', eventoId)
      .maybeSingle();
    if (error)
      throw new InternalServerErrorException('No se pudo verificar el evento.');
    if (!data) throw new NotFoundException('Evento no encontrado.');
    await this.assertLote(usuario, data.lote_id);
  }
}
