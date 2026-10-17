import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CerrarSubcampaniaDto } from '../api/dto/cerrar-subcampania.dto';
import {
  CierrePolicy,
  CierrePolicyError,
} from '../domain/policies/cierre.policy';
import { SubcampaniasAuthService } from './subcampanias-auth.service';
import {
  lifecycleObject,
  throwLifecycleRpcError,
} from './subcampanias-rpc-error';

@Injectable()
export class SubcampaniasCierreService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async cerrar(id: number, dto: CerrarSubcampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    try {
      CierrePolicy.assertValido({
        estadoFinal: dto.estado_final,
        fechaCierreOperativo: dto.fecha_cierre_operativo,
        fechaFinMantenimiento: dto.fecha_fin_mantenimiento,
        motivoCierreParcial: dto.motivo_cierre_parcial,
      });
    } catch (error) {
      if (error instanceof CierrePolicyError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_subcampania_cerrar', {
        p_id: id,
        p_actor_id: usuario.id,
        p_datos: { ...dto },
      });
    if (error) throwLifecycleRpcError(error);
    return {
      success: true,
      data: {
        message: 'Subcampaña cerrada correctamente.',
        ...lifecycleObject(data),
      },
    };
  }
}
