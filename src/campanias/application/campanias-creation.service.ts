import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
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
import { CampaniasAuthService } from './campanias-auth.service';
import { CampaniasCodigosService } from './campanias-codigos.service';

@Injectable()
export class CampaniasCreationService {
  private readonly logger = new Logger(CampaniasCreationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: CampaniasAuthService,
    private readonly codigosService: CampaniasCodigosService,
  ) {}

  async crear(dto: CrearCampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

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

    const anio = new Date().getFullYear();
    const codigo = await this.codigosService.generarCodigo(anio);

    const supabase = this.supabaseService.getClient();

    const { data: campania, error } = await supabase
      .from('campania')
      .insert({
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        tipo: dto.tipo,
        codigo_trazabilidad: codigo,
        fecha_estimada_inicio: dto.fecha_estimada_inicio ?? null,
        fecha_estimada_fin: dto.fecha_estimada_fin ?? null,
        created_by: usuario.id,
        updated_by: usuario.id,
      })
      .select(
        'id, nombre, tipo, codigo_trazabilidad, descripcion, fecha_estimada_inicio, fecha_estimada_fin, created_at',
      )
      .single();

    if (error) {
      this.logger.error('Error al crear campania:', error);
      if (error.code === '23505') {
        throw new UnprocessableEntityException(
          'Ya existe una campaña con ese nombre.',
        );
      }
      throw new BadRequestException(
        error.message || 'No se pudo crear la campaña.',
      );
    }

    const campId = (campania as any).id as number;

    if (dto.organizacion_ids && dto.organizacion_ids.length > 0) {
      const { error: orgError } = await supabase
        .from('campania_organizacion')
        .insert(
          dto.organizacion_ids.map((orgId) => ({
            campania_id: campId,
            organizacion_id: orgId,
            created_by: usuario.id,
          })),
        );

      if (orgError) {
        this.logger.error(
          'Error al asociar organizaciones al crear:',
          orgError,
        );
      }
    }

    return {
      success: true,
      data: {
        message: 'Campaña creada correctamente.',
        ...(campania as any),
      },
    };
  }
}
