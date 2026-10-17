import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EditarSubcampaniaDto } from '../api/dto/editar-subcampania.dto';
import { SubcampaniasAuthService } from './subcampanias-auth.service';
import {
  lifecycleObject,
  throwLifecycleRpcError,
} from './subcampanias-rpc-error';

@Injectable()
export class SubcampaniasEdicionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async editar(id: number, dto: EditarSubcampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    if (dto.meta_total_arboles !== undefined) {
      throw new UnprocessableEntityException(
        'meta_total_arboles se revisa junto con las especies mediante PUT /subcampanias/:id/plan.',
      );
    }
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_subcampania_editar', {
        p_id: id,
        p_actor_id: usuario.id,
        p_datos: Object.fromEntries(
          Object.entries(dto).filter(([, value]) => value !== undefined),
        ),
      });
    if (error) throwLifecycleRpcError(error);
    return { success: true, data: lifecycleObject(data) };
  }

  async borrar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_subcampania_borrar', { p_id: id, p_actor_id: usuario.id });
    if (error) throwLifecycleRpcError(error);
    return { success: true, data: lifecycleObject(data) };
  }
}
