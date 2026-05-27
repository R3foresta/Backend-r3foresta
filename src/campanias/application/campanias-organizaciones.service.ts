import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AsociarOrganizacionesDto } from '../api/dto/asociar-organizaciones.dto';
import { CampaniasAuthService } from './campanias-auth.service';

@Injectable()
export class CampaniasOrganizacionesService {
  private readonly logger = new Logger(CampaniasOrganizacionesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: CampaniasAuthService,
  ) {}

  async asociar(
    campaniaId: number,
    dto: AsociarOrganizacionesDto,
    authId: string,
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: campania, error: campError } = await supabase
      .from('campania')
      .select('id')
      .eq('id', campaniaId)
      .is('deleted_at', null)
      .single();

    if (campError || !campania) {
      throw new NotFoundException(`Campaña con id ${campaniaId} no encontrada`);
    }

    const { error } = await supabase.from('campania_organizacion').insert(
      dto.organizacion_ids.map((orgId) => ({
        campania_id: campaniaId,
        organizacion_id: orgId,
        created_by: usuario.id,
      })),
    );

    if (error) {
      this.logger.error('Error al asociar organizaciones:', error);
      if (error.code === '23505') {
        throw new UnprocessableEntityException(
          'Una o más organizaciones ya están asociadas a esta campaña.',
        );
      }
      throw new BadRequestException(
        error.message || 'No se pudo asociar la organización.',
      );
    }

    return {
      success: true,
      data: { message: 'Organizaciones asociadas correctamente.' },
    };
  }

  async desasociar(campaniaId: number, orgId: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { count, error: checkError } = await supabase
      .from('campania_organizacion')
      .select('*', { count: 'exact', head: true })
      .eq('campania_id', campaniaId)
      .eq('organizacion_id', orgId);

    if (checkError) {
      this.logger.error(
        'Error al verificar relacion campania-organizacion:',
        checkError,
      );
      throw new BadRequestException(checkError.message);
    }

    if (!count || count === 0) {
      throw new NotFoundException(
        `La organización ${orgId} no está asociada a la campaña ${campaniaId}.`,
      );
    }

    const { error } = await supabase
      .from('campania_organizacion')
      .delete()
      .eq('campania_id', campaniaId)
      .eq('organizacion_id', orgId);

    if (error) {
      this.logger.error('Error al desasociar organizacion:', error);
      throw new BadRequestException(
        error.message || 'No se pudo desasociar la organización.',
      );
    }

    return {
      success: true,
      data: { message: 'Organización desasociada correctamente.' },
    };
  }
}
