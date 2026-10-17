import { ConflictException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

/** Alias inicial retirado: el contexto autorizado y LIFO se sirve por v1. */
@Injectable()
export class SubcampaniasPlantacionContextService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async obtener(_subcampaniaId: number, _authId: string): Promise<never> {
    throw new ConflictException({
      error: {
        codigo: 'CLIENTE_INCOMPATIBLE',
        mensaje: 'Use GET /api/v1/subcampanias/:id/contexto-registro.',
      },
    });
  }
}
