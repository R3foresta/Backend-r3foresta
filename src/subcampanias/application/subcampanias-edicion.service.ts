import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EditarSubcampaniaDto } from '../api/dto/editar-subcampania.dto';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import {
  EdicionPorEstadoPolicy,
  EdicionPorEstadoPolicyError,
} from '../domain/policies/edicion-por-estado.policy';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

@Injectable()
export class SubcampaniasEdicionService {
  private readonly logger = new Logger(SubcampaniasEdicionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async editar(id: number, dto: EditarSubcampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: actual, error: fetchError } = await supabase
      .from('subcampania')
      .select('id, estado')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !actual) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }

    if (
      dto.fecha_estimada_inicio &&
      dto.fecha_estimada_fin &&
      new Date(dto.fecha_estimada_fin) < new Date(dto.fecha_estimada_inicio)
    ) {
      throw new BadRequestException(
        'fecha_estimada_fin no puede ser anterior a fecha_estimada_inicio.',
      );
    }

    const estadoActual = (actual as any).estado as EstadoSubcampania;

    const camposProvistos = Object.keys(dto).filter(
      (k) => (dto as any)[k] !== undefined,
    );

    try {
      EdicionPorEstadoPolicy.assertCamposPermitidos(
        estadoActual,
        camposProvistos,
      );
    } catch (err) {
      if (err instanceof EdicionPorEstadoPolicyError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    const patch: Record<string, any> = {
      updated_by: usuario.id,
      updated_at: new Date().toISOString(),
    };

    for (const campo of camposProvistos) {
      patch[campo] = (dto as any)[campo];
    }

    const { data, error } = await supabase
      .from('subcampania')
      .update(patch)
      .eq('id', id)
      .select(
        'id, nombre, descripcion, tipo, estado, zona_id, meta_total_arboles, fecha_estimada_inicio, fecha_estimada_fin, tolerancia_gps_metros, observaciones_cierre, updated_at',
      )
      .single();

    if (error) {
      this.logger.error('Error al editar subcampania:', error);
      if (error.code === '23505') {
        throw new UnprocessableEntityException(
          'Ya existe una subcampaña con ese código o nombre.',
        );
      }
      throw new BadRequestException(
        error.message || 'No se pudo editar la subcampaña.',
      );
    }

    return { success: true, data };
  }

  async borrar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: actual, error: fetchError } = await supabase
      .from('subcampania')
      .select('id, estado')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !actual) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }

    if ((actual as any).estado !== EstadoSubcampania.BORRADOR) {
      throw new UnprocessableEntityException(
        'Solo se pueden eliminar subcampañas en estado BORRADOR.',
      );
    }

    const { error } = await supabase
      .from('subcampania')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: usuario.id,
      })
      .eq('id', id);

    if (error) {
      this.logger.error('Error al borrar subcampania:', error);
      throw new BadRequestException(
        error.message || 'No se pudo eliminar la subcampaña.',
      );
    }

    return {
      success: true,
      data: { message: 'Subcampaña eliminada correctamente.', id },
    };
  }
}
