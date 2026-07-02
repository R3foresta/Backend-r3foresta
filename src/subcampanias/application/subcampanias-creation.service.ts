import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearSubcampaniaDto } from '../api/dto/crear-subcampania.dto';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { SubcampaniasAuthService } from './subcampanias-auth.service';
import { SubcampaniasCodigosService } from './subcampanias-codigos.service';
import {
  SubcampaniasHistorialService,
  TipoHistorialSubcampania,
} from './subcampanias-historial.service';

@Injectable()
export class SubcampaniasCreationService {
  private readonly logger = new Logger(SubcampaniasCreationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
    private readonly codigosService: SubcampaniasCodigosService,
    private readonly historialService: SubcampaniasHistorialService,
  ) {}

  async crear(dto: CrearSubcampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    if (
      dto.fecha_estimada_inicio &&
      dto.fecha_estimada_fin &&
      new Date(dto.fecha_estimada_fin) < new Date(dto.fecha_estimada_inicio)
    ) {
      throw new BadRequestException(
        'fecha_estimada_fin no puede ser anterior a fecha_estimada_inicio.',
      );
    }

    const supabase = this.supabaseService.getClient();

    const { data: campania, error: campError } = await supabase
      .from('campania')
      .select('id, tipo')
      .eq('id', dto.campania_id)
      .is('deleted_at', null)
      .single();

    if (campError || !campania) {
      throw new NotFoundException(
        `Campaña con id ${dto.campania_id} no encontrada`,
      );
    }

    const tipoHeredado = (campania as any).tipo as string;

    const codigo = await this.codigosService.generarCodigo(dto.campania_id);

    const { data: subcampania, error } = await supabase
      .from('subcampania')
      .insert({
        campania_id: dto.campania_id,
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        tipo: tipoHeredado,
        zona_id: dto.zona_id,
        meta_total_arboles: dto.meta_total_arboles,
        fecha_estimada_inicio: dto.fecha_estimada_inicio ?? null,
        fecha_estimada_fin: dto.fecha_estimada_fin ?? null,
        tolerancia_gps_metros: dto.tolerancia_gps_metros ?? 50,
        codigo_trazabilidad: codigo,
        created_by: usuario.id,
        updated_by: usuario.id,
      })
      .select(
        'id, campania_id, nombre, tipo, estado, zona_id, meta_total_arboles, codigo_trazabilidad, descripcion, fecha_estimada_inicio, fecha_estimada_fin, tolerancia_gps_metros, created_at',
      )
      .single();

    if (error) {
      this.logger.error('Error al crear subcampania:', error);
      if (error.code === '23505') {
        throw new UnprocessableEntityException(
          'Ya existe una subcampaña con ese código de trazabilidad.',
        );
      }
      throw new BadRequestException(
        error.message || 'No se pudo crear la subcampaña.',
      );
    }

    const subcampaniaCreada = subcampania as Record<string, unknown>;
    const subcampaniaId = Number(subcampaniaCreada.id);

    await this.historialService.registrar({
      subcampaniaId,
      tipo: TipoHistorialSubcampania.BORRADOR_CREADO,
      actorUserId: usuario.id,
      estadoDestino: EstadoSubcampania.BORRADOR,
      metadata: {
        codigo_trazabilidad: codigo,
        campania_id: dto.campania_id,
        zona_id: dto.zona_id,
        meta_total_arboles: dto.meta_total_arboles,
      },
    });

    return {
      success: true,
      data: {
        message: 'Subcampaña creada correctamente.',
        ...subcampaniaCreada,
      },
    };
  }
}
