import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { throwSharedMutationFailure } from '../../common/db/pa-shared-rpc-error';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearSubcampaniaDto } from '../api/dto/crear-subcampania.dto';
import { lifecycleObject } from './subcampanias-rpc-error';

@Injectable()
export class SubcampaniasCreationService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async crear(dto: CrearSubcampaniaDto, authId: string) {
    // authId procede del actor verificado por el guard. SQL resuelve el BIGINT
    // exacto y revalida cuenta/ADMIN bajo lock antes de las reglas del alta.
    const { data, error } = (await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_subcampania_crear', {
        p_auth_id: authId,
        p_payload: Object.fromEntries(
          Object.entries(dto).filter(([, value]) => value !== undefined),
        ),
      })) as {
      data: unknown;
      error: { code?: string; message?: string } | null;
    };
    if (error) this.throwRpcError(error);

    return {
      success: true,
      data: {
        message: 'Subcampaña creada correctamente.',
        ...lifecycleObject(data),
      },
    };
  }

  private throwRpcError(error: { code?: string; message?: string }): never {
    throwSharedMutationFailure(error);
    const message = error.message || 'No se pudo crear la subcampaña.';
    if (error.code === 'PT401') throw new UnauthorizedException(message);
    if (error.code === '42501') throw new ForbiddenException(message);
    if (error.code === 'P0002') throw new NotFoundException(message);
    if (error.code === '23505') {
      throw new UnprocessableEntityException(
        'Ya existe una subcampaña con ese código de trazabilidad.',
      );
    }
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new InternalServerErrorException(
        'La migración 112 de creación atómica no está disponible.',
      );
    }
    throw new BadRequestException(message);
  }
}
