import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AgregarMiembroEquipoDto } from '../api/dto/agregar-miembro-equipo.dto';
import { RolEnSubcampania } from '../domain/enums/rol-en-subcampania.enum';
import { SubcampaniasAuthService } from './subcampanias-auth.service';
import {
  lifecycleObject,
  throwLifecycleRpcError,
} from './subcampanias-rpc-error';

@Injectable()
export class SubcampaniasEquipoService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async listar(subcampaniaId: number) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: subcampania, error: subError } = await supabase
      .from('subcampania')
      .select('id')
      .eq('id', subcampaniaId)
      .is('deleted_at', null)
      .single();

    if (subError || !subcampania) {
      throw new NotFoundException(
        `Subcampaña con id ${subcampaniaId} no encontrada`,
      );
    }

    const { data, error } = await supabase
      .from('subcampania_equipo')
      .select(
        'id, usuario_id, rol, agregado_at, usuario!subcampania_equipo_usuario_fk(id, nombre, foto_perfil_url)',
      )
      .eq('subcampania_id', subcampaniaId)
      .order('agregado_at', { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const miembros = (data ?? []).map((e: any) => this.mapMiembroEquipo(e));

    return { success: true, data: miembros };
  }

  async agregarMiembros(
    subcampaniaId: number,
    miembros: AgregarMiembroEquipoDto[],
    authId: string,
  ) {
    if (!Array.isArray(miembros) || miembros.length === 0) {
      throw new BadRequestException('Debe enviar al menos un miembro.');
    }
    if (new Set(miembros.map((m) => m.usuario_id)).size !== miembros.length) {
      throw new UnprocessableEntityException(
        'No se pueden enviar usuarios duplicados en la misma solicitud.',
      );
    }
    if (
      miembros.filter((m) => m.rol === RolEnSubcampania.COORDINADOR).length > 1
    ) {
      throw new UnprocessableEntityException(
        'Solo se permite un COORDINADOR por subcampaña.',
      );
    }
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_equipo_agregar', {
        p_id: subcampaniaId,
        p_actor_id: usuario.id,
        p_miembros: miembros.map((m) => ({ ...m })),
      });
    if (error) throwLifecycleRpcError(error);
    if (!Array.isArray(data))
      throw new InternalServerErrorException(
        'La operación no devolvió el equipo.',
      );
    return {
      success: true,
      data: { message: 'Miembros agregados correctamente.', miembros: data },
    };
  }

  async quitar(subcampaniaId: number, usuarioId: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_equipo_quitar', {
        p_id: subcampaniaId,
        p_actor_id: usuario.id,
        p_usuario_id: usuarioId,
      });
    if (error) throwLifecycleRpcError(error);
    return { success: true, data: lifecycleObject(data) };
  }

  private mapMiembroEquipo(e: any) {
    const usuario = Array.isArray(e.usuario) ? e.usuario[0] : e.usuario;

    return {
      id: Number(e.id),
      usuario_id: Number(e.usuario_id),
      rol: e.rol,
      agregado_at: e.agregado_at ?? null,
      nombre_usuario: usuario?.nombre ?? null,
      foto_perfil_url: usuario?.foto_perfil_url ?? null,
    };
  }
}
