import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CancelarSubcampaniaDto } from '../api/dto/cancelar-subcampania.dto';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

@Injectable()
export class SubcampaniasCancelacionService {
  private readonly logger = new Logger(SubcampaniasCancelacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async cancelar(id: number, dto: CancelarSubcampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const motivo = dto.motivo?.trim();
    if (!motivo) {
      throw new BadRequestException('motivo es obligatorio.');
    }

    // La RPC acepta el id interno del actor, por lo que solo se invoca con
    // service_role despues de resolver y autorizar x-auth-id en backend.
    const supabase = this.supabaseService.getAdminClient();
    const rpc = (await supabase.rpc('fn_subcampania_cancelar', {
      p_id: id,
      p_actor_user_id: usuario.id,
      p_motivo: motivo,
    })) as unknown as SupabaseResult<
      Record<string, unknown> | Record<string, unknown>[]
    >;

    if (rpc.error) {
      this.logger.error('Error al cancelar subcampania:', rpc.error);
      const message = rpc.error.message ?? 'No se pudo cancelar la subcampaña.';

      if (this.esErrorNoEncontrado(rpc.error)) {
        throw new NotFoundException(message);
      }
      if (this.esConflictoDePlantacion(message)) {
        throw new ConflictException(message);
      }
      if (this.esErrorDeValidacion(rpc.error)) {
        throw new ConflictException(message);
      }
      if (this.esRpcAusente(rpc.error)) {
        throw new InternalServerErrorException(
          'La migración fn_subcampania_cancelar no está aplicada.',
        );
      }
      if (rpc.error.code === '42501') {
        throw new InternalServerErrorException(
          'La cancelación requiere SUPABASE_SERVICE_ROLE_KEY.',
        );
      }
      throw new BadRequestException(message);
    }

    const row = this.normalizarRpcRow(rpc.data);

    return {
      success: true,
      data: {
        message: 'Subcampaña cancelada correctamente.',
        id: Number(row.id ?? id),
        estado: row.estado ?? 'CANCELADA',
        deleted_at: row.deleted_at ?? null,
        deleted_by: row.deleted_by ?? usuario.id,
        motivo,
      },
    };
  }

  private normalizarRpcRow(data: unknown): Record<string, unknown> {
    if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
    return (data ?? {}) as Record<string, unknown>;
  }

  private esErrorNoEncontrado(error: SupabaseErrorLike): boolean {
    return (
      error.code === 'P0002' ||
      error.message?.includes('no encontrada') === true
    );
  }

  private esConflictoDePlantacion(message: string): boolean {
    return message.includes('total_plantado_inicial');
  }

  private esErrorDeValidacion(error: SupabaseErrorLike): boolean {
    return error.code === 'P0001';
  }

  private esRpcAusente(error: SupabaseErrorLike): boolean {
    return (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('fn_subcampania_cancelar') === true
    );
  }
}
