import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EditarCampaniaDto } from '../api/dto/editar-campania.dto';
import {
  FechasCampaniaPolicy,
  FechasCampaniaPolicyError,
} from '../domain/policies/fechas-campania.policy';
import {
  InmutabilidadTipoPolicy,
  InmutabilidadTipoPolicyError,
} from '../domain/policies/inmutabilidad-tipo.policy';
import {
  TipoCampaniaPolicy,
  TipoCampaniaPolicyError,
} from '../domain/policies/tipo-campania.policy';
import { CampaniasAuthService } from './campanias-auth.service';

@Injectable()
export class CampaniasEdicionService {
  private readonly logger = new Logger(CampaniasEdicionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: CampaniasAuthService,
  ) {}

  async editar(id: number, dto: EditarCampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: actual, error: fetchError } = await supabase
      .from('campania')
      .select('id, tipo')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !actual) {
      throw new NotFoundException(`Campaña con id ${id} no encontrada`);
    }

    if (dto.tipo !== undefined) {
      try {
        TipoCampaniaPolicy.assertValido(dto.tipo);
      } catch (err) {
        if (err instanceof TipoCampaniaPolicyError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }

      if (dto.tipo !== (actual as any).tipo) {
        const { count } = await supabase
          .from('subcampania')
          .select('*', { count: 'exact', head: true })
          .eq('campania_id', id)
          .is('deleted_at', null);

        try {
          InmutabilidadTipoPolicy.assertPuedeCambiar(
            dto.tipo,
            (actual as any).tipo,
            count ?? 0,
          );
        } catch (err) {
          if (err instanceof InmutabilidadTipoPolicyError) {
            throw new UnprocessableEntityException(err.message);
          }
          throw err;
        }
      }
    }

    try {
      FechasCampaniaPolicy.assertCoherentes(
        dto.fecha_estimada_inicio,
        dto.fecha_estimada_fin,
      );
    } catch (err) {
      if (err instanceof FechasCampaniaPolicyError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const patch: Record<string, any> = {
      updated_by: usuario.id,
      updated_at: new Date().toISOString(),
    };
    if (dto.nombre !== undefined) patch.nombre = dto.nombre;
    if (dto.descripcion !== undefined) patch.descripcion = dto.descripcion;
    if (dto.tipo !== undefined) patch.tipo = dto.tipo;
    if (dto.fecha_estimada_inicio !== undefined)
      patch.fecha_estimada_inicio = dto.fecha_estimada_inicio;
    if (dto.fecha_estimada_fin !== undefined)
      patch.fecha_estimada_fin = dto.fecha_estimada_fin;

    const { data, error } = await supabase
      .from('campania')
      .update(patch)
      .eq('id', id)
      .select(
        'id, nombre, tipo, descripcion, codigo_trazabilidad, fecha_estimada_inicio, fecha_estimada_fin, updated_at',
      )
      .single();

    if (error) {
      this.logger.error('Error al editar campania:', error);
      if (error.code === '23505') {
        throw new UnprocessableEntityException(
          'Ya existe una campaña con ese nombre.',
        );
      }
      throw new BadRequestException(
        error.message || 'No se pudo editar la campaña.',
      );
    }

    return { success: true, data };
  }

  async borrar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: actual, error: fetchError } = await supabase
      .from('campania')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !actual) {
      throw new NotFoundException(`Campaña con id ${id} no encontrada`);
    }

    const { count } = await supabase
      .from('subcampania')
      .select('*', { count: 'exact', head: true })
      .eq('campania_id', id)
      .is('deleted_at', null);

    if ((count ?? 0) > 0) {
      throw new UnprocessableEntityException(
        'No se puede eliminar una campaña con subcampañas activas.',
      );
    }

    const { error } = await supabase
      .from('campania')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: usuario.id,
      })
      .eq('id', id);

    if (error) {
      this.logger.error('Error al borrar campania:', error);
      throw new BadRequestException(
        error.message || 'No se pudo eliminar la campaña.',
      );
    }

    return {
      success: true,
      data: { message: 'Campaña eliminada correctamente.', id },
    };
  }
}
