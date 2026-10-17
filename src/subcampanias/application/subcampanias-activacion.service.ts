import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from './subcampanias-auth.service';
import {
  lifecycleObject,
  throwLifecycleRpcError,
} from './subcampanias-rpc-error';

@Injectable()
export class SubcampaniasActivacionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async activar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_subcampania_activar', { p_id: id, p_actor_id: usuario.id });
    if (error) throwLifecycleRpcError(error);
    // La RPC congela snapshots, cambia estado y registra historia juntos.
    return {
      success: true,
      data: {
        message: 'Subcampaña activada correctamente.',
        ...lifecycleObject(data),
      },
    };
  }
}
