import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { throwSharedMutationFailure } from '../../common/db/pa-shared-rpc-error';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearCampaniaDto } from '../api/dto/crear-campania.dto';
import {
  FechasCampaniaPolicy,
  FechasCampaniaPolicyError,
} from '../domain/policies/fechas-campania.policy';
import {
  TipoCampaniaPolicy,
  TipoCampaniaPolicyError,
} from '../domain/policies/tipo-campania.policy';

type CampaniaCreada = {
  id: number;
  nombre: string;
  tipo: string;
  codigo_trazabilidad: string;
  descripcion: string | null;
  fecha_estimada_inicio: string | null;
  fecha_estimada_fin: string | null;
  created_at: string;
};

@Injectable()
export class CampaniasCreationService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // authId procede de InternalActorGuard. La RPC revalida actividad y ADMIN
  // bajo lock de cuenta antes de crear campaña, auditoría y organizaciones.
  async crear(dto: CrearCampaniaDto, authId: string) {
    try {
      TipoCampaniaPolicy.assertValido(dto.tipo);
      FechasCampaniaPolicy.assertCoherentes(
        dto.fecha_estimada_inicio,
        dto.fecha_estimada_fin,
      );
    } catch (err) {
      if (
        err instanceof TipoCampaniaPolicyError ||
        err instanceof FechasCampaniaPolicyError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const { data, error } = (await this.supabaseService
      .getAdminClient()
      .rpc('fn_crear_campania', {
        p_auth_id: authId,
        p_nombre: dto.nombre,
        p_tipo: dto.tipo,
        p_descripcion: dto.descripcion ?? null,
        p_fecha_estimada_inicio: dto.fecha_estimada_inicio ?? null,
        p_fecha_estimada_fin: dto.fecha_estimada_fin ?? null,
        p_organizacion_ids: dto.organizacion_ids ?? null,
      })) as { data: unknown; error: { code: string; message: string } | null };

    if (error) {
      throwSharedMutationFailure(error);
      if (error.code === 'PT404') throw new NotFoundException(error.message);
      if (error.code === 'PT422') {
        throw new UnprocessableEntityException(error.message);
      }
      if (error.code === 'PT400') throw new BadRequestException(error.message);
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new InternalServerErrorException(
          'La migración de creación atómica de campañas no está disponible.',
        );
      }
      // Los detalles SQL pueden contener datos de la solicitud; no se exponen
      // ni registran como parte de la respuesta de negocio.
      throw new BadRequestException('No se pudo crear la campaña.');
    }

    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      !('id' in data) ||
      typeof data.id !== 'number' ||
      !('codigo_trazabilidad' in data) ||
      typeof data.codigo_trazabilidad !== 'string'
    ) {
      throw new InternalServerErrorException(
        'La creación no devolvió una campaña válida.',
      );
    }

    return {
      success: true,
      data: {
        message: 'Campaña creada correctamente.',
        ...(data as CampaniaCreada),
      },
    };
  }
}
