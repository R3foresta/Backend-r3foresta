import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AgregarMiembroEquipoDto } from '../api/dto/agregar-miembro-equipo.dto';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { RolEnSubcampania } from '../domain/enums/rol-en-subcampania.enum';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

@Injectable()
export class SubcampaniasEquipoService {
  private readonly logger = new Logger(SubcampaniasEquipoService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async listar(subcampaniaId: number) {
    const supabase = this.supabaseService.getClient();

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
        'id, usuario_id, rol, agregado_at, usuario!subcampania_equipo_usuario_fk(id, nombre)',
      )
      .eq('subcampania_id', subcampaniaId)
      .order('agregado_at', { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const miembros = (data ?? []).map((e: any) => ({
      id: Number(e.id),
      usuario_id: Number(e.usuario_id),
      rol: e.rol,
      agregado_at: e.agregado_at,
      nombre_usuario: e.usuario?.nombre ?? null,
    }));

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

    const idsEnPayload = miembros.map((m) => m.usuario_id);
    if (new Set(idsEnPayload).size !== idsEnPayload.length) {
      throw new UnprocessableEntityException(
        'No se pueden enviar usuarios duplicados en la misma solicitud.',
      );
    }

    const coordinadoresEnPayload = miembros.filter(
      (m) => m.rol === RolEnSubcampania.COORDINADOR,
    );
    if (coordinadoresEnPayload.length > 1) {
      throw new UnprocessableEntityException(
        'Solo se permite un COORDINADOR por subcampaña.',
      );
    }

    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

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

    if (coordinadoresEnPayload.length === 1) {
      const { data: coordExistente } = await supabase
        .from('subcampania_equipo')
        .select('id')
        .eq('subcampania_id', subcampaniaId)
        .eq('rol', RolEnSubcampania.COORDINADOR)
        .maybeSingle();

      if (coordExistente) {
        throw new UnprocessableEntityException(
          'Ya existe un coordinador en esta subcampaña.',
        );
      }
    }

    const filas = miembros.map((m) => ({
      subcampania_id: subcampaniaId,
      usuario_id: m.usuario_id,
      rol: m.rol,
      agregado_by: usuario.id,
    }));

    const { data, error } = await supabase
      .from('subcampania_equipo')
      .insert(filas)
      .select('id, usuario_id, rol, agregado_at');

    if (error) {
      this.logger.error('Error al agregar miembros:', error);
      if (error.code === '23505') {
        const msg = String((error as any).message ?? '').toLowerCase();
        if (msg.includes('coordinador')) {
          throw new UnprocessableEntityException(
            'Ya existe un coordinador en esta subcampaña.',
          );
        }
        throw new UnprocessableEntityException(
          'Uno o más usuarios ya pertenecen al equipo de esta subcampaña.',
        );
      }
      if (error.code === '23503') {
        throw new BadRequestException(
          'Uno o más usuarios referenciados no existen.',
        );
      }
      throw new BadRequestException(
        error.message || 'No se pudieron agregar los miembros.',
      );
    }

    return {
      success: true,
      data: {
        message: 'Miembros agregados correctamente.',
        miembros: (data as any[]) ?? [],
      },
    };
  }

  async quitar(subcampaniaId: number, usuarioId: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: subcampania, error: subError } = await supabase
      .from('subcampania')
      .select('id, estado')
      .eq('id', subcampaniaId)
      .is('deleted_at', null)
      .single();

    if (subError || !subcampania) {
      throw new NotFoundException(
        `Subcampaña con id ${subcampaniaId} no encontrada`,
      );
    }

    const { data: miembro, error: miembroError } = await supabase
      .from('subcampania_equipo')
      .select('id, rol')
      .eq('subcampania_id', subcampaniaId)
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    if (miembroError) {
      throw new BadRequestException(miembroError.message);
    }

    if (!miembro) {
      throw new NotFoundException(
        `El usuario ${usuarioId} no pertenece al equipo de la subcampaña ${subcampaniaId}.`,
      );
    }

    const estadoActual = (subcampania as any).estado as EstadoSubcampania;
    if (
      (miembro as any).rol === RolEnSubcampania.COORDINADOR &&
      estadoActual === EstadoSubcampania.ACTIVA
    ) {
      throw new UnprocessableEntityException(
        'No se puede quitar al coordinador mientras la subcampaña está activa.',
      );
    }

    const { error } = await supabase
      .from('subcampania_equipo')
      .delete()
      .eq('subcampania_id', subcampaniaId)
      .eq('usuario_id', usuarioId);

    if (error) {
      this.logger.error('Error al quitar miembro:', error);
      throw new BadRequestException(
        error.message || 'No se pudo quitar el miembro.',
      );
    }

    return {
      success: true,
      data: { message: 'Miembro quitado correctamente.' },
    };
  }
}
