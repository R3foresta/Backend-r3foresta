import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CerrarSubcampaniaDto } from '../api/dto/cerrar-subcampania.dto';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { FaseMantenimiento } from '../domain/enums/fase-mantenimiento.enum';
import {
  CierrePolicy,
  CierrePolicyError,
} from '../domain/policies/cierre.policy';
import {
  TransicionEstadoPolicy,
  TransicionEstadoPolicyError,
} from '../domain/policies/transicion-estado.policy';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

@Injectable()
export class SubcampaniasCierreService {
  private readonly logger = new Logger(SubcampaniasCierreService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async cerrar(id: number, dto: CerrarSubcampaniaDto, authId: string) {
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

    const estadoActual = (actual as any).estado as EstadoSubcampania;
    const estadoDestino = dto.estado_final as unknown as EstadoSubcampania;

    try {
      TransicionEstadoPolicy.assertTransicionValida(
        estadoActual,
        estadoDestino,
      );
    } catch (err) {
      if (err instanceof TransicionEstadoPolicyError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    try {
      CierrePolicy.assertValido({
        estadoFinal: dto.estado_final,
        fechaCierreOperativo: dto.fecha_cierre_operativo,
        fechaFinMantenimiento: dto.fecha_fin_mantenimiento,
        motivoCierreParcial: dto.motivo_cierre_parcial ?? null,
      });
    } catch (err) {
      if (err instanceof CierrePolicyError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    const { data: updated, error } = await supabase
      .from('subcampania')
      .update({
        estado: estadoDestino,
        fase_mantenimiento: FaseMantenimiento.MANTENIMIENTO_ACTIVO,
        fecha_cierre_operativo: dto.fecha_cierre_operativo,
        fecha_fin_mantenimiento: dto.fecha_fin_mantenimiento,
        motivo_cierre_parcial:
          estadoDestino === EstadoSubcampania.FINALIZADA_PARCIAL
            ? dto.motivo_cierre_parcial
            : null,
        observaciones_cierre: dto.observaciones_cierre ?? null,
        updated_by: usuario.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, estado, fase_mantenimiento, fecha_cierre_operativo, fecha_fin_mantenimiento, motivo_cierre_parcial, observaciones_cierre, updated_at',
      )
      .single();

    if (error) {
      this.logger.error('Error al cerrar subcampania:', error);
      throw new BadRequestException(
        error.message || 'No se pudo cerrar la subcampaña.',
      );
    }

    return {
      success: true,
      data: {
        message: 'Subcampaña cerrada correctamente.',
        ...(updated as any),
      },
    };
  }
}
