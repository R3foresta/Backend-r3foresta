import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CrearOrganizacionDto } from './dto/crear-organizacion.dto';
import { EditarOrganizacionDto } from './dto/editar-organizacion.dto';
import { TipoOrganizacion } from './enums/tipo-organizacion.enum';
import { OrganizacionesAuthService } from './organizaciones-auth.service';
import { OrganizacionesLogoService } from './organizaciones-logo.service';

export type ListarOrganizacionesFiltros = {
  activo?: boolean;
  tipo?: TipoOrganizacion;
};

type OrganizacionRow = {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  'id, nombre, tipo, activo, logo_url, created_at, updated_at';

@Injectable()
export class OrganizacionesService {
  private readonly logger = new Logger(OrganizacionesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: OrganizacionesAuthService,
    private readonly logoService: OrganizacionesLogoService,
  ) {}

  async crear(
    dto: CrearOrganizacionDto,
    authId: string,
    logo?: Express.Multer.File,
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: inserted, error: insertError } = await supabase
      .from('organizacion')
      .insert({
        nombre: dto.nombre,
        tipo: dto.tipo,
        activo: dto.activo ?? true,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) {
      if (this.isUniqueViolation(insertError)) {
        throw new UnprocessableEntityException(
          `Ya existe una organizacion con el nombre "${dto.nombre}".`,
        );
      }
      this.logger.error('Error al crear organizacion', insertError);
      throw new InternalServerErrorException(
        insertError.message || 'No se pudo crear la organizacion.',
      );
    }

    let organizacion = inserted as OrganizacionRow;

    if (logo) {
      try {
        const logoUrl = await this.logoService.subir(
          Number(organizacion.id),
          logo,
        );

        const { data: updated, error: updateError } = await supabase
          .from('organizacion')
          .update({
            logo_url: logoUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizacion.id)
          .select(SELECT_COLUMNS)
          .single();

        if (updateError) {
          this.logger.error(
            `Error al persistir logo_url tras crear organizacion ${organizacion.id}`,
            updateError,
          );
          await this.logoService.eliminarPorUrl(logoUrl);
          throw new InternalServerErrorException(
            'No se pudo persistir el logo de la organizacion.',
          );
        }

        organizacion = updated as OrganizacionRow;
      } catch (err) {
        // Rollback: la org no debe quedar a medio crear si fallo el logo.
        await supabase.from('organizacion').delete().eq('id', organizacion.id);
        throw err;
      }
    }

    return {
      success: true,
      message: 'Organizacion creada exitosamente.',
      data: organizacion,
    };
  }

  async listar(filtros: ListarOrganizacionesFiltros) {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('organizacion')
      .select(SELECT_COLUMNS)
      .order('nombre', { ascending: true });

    if (filtros.activo !== undefined) {
      query = query.eq('activo', filtros.activo);
    }
    if (filtros.tipo) {
      query = query.eq('tipo', filtros.tipo);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.error('Error al listar organizaciones', error);
      throw new InternalServerErrorException('Error al listar organizaciones');
    }

    return { success: true, data: (data ?? []) as OrganizacionRow[] };
  }

  async obtenerPorId(id: number) {
    const data = await this.cargar(id);
    return { success: true, data };
  }

  async editar(id: number, dto: EditarOrganizacionDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const actual = await this.cargar(id);

    const patch: Record<string, unknown> = {};
    if (dto.nombre !== undefined) patch.nombre = dto.nombre;
    if (dto.tipo !== undefined) patch.tipo = dto.tipo;
    if (dto.activo !== undefined) patch.activo = dto.activo;

    if (Object.keys(patch).length === 0) {
      return { success: true, data: actual };
    }

    patch.updated_at = new Date().toISOString();

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('organizacion')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      if (this.isUniqueViolation(error)) {
        throw new UnprocessableEntityException(
          `Ya existe una organizacion con el nombre "${dto.nombre}".`,
        );
      }
      this.logger.error(`Error al editar organizacion ${id}`, error);
      throw new InternalServerErrorException(
        error.message || 'No se pudo editar la organizacion.',
      );
    }

    return { success: true, data: data as OrganizacionRow };
  }

  async subirLogo(id: number, file: Express.Multer.File, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const actual = await this.cargar(id);
    const nuevaUrl = await this.logoService.subir(id, file);

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('organizacion')
      .update({
        logo_url: nuevaUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      this.logger.error(`Error al persistir logo_url para org ${id}`, error);
      await this.logoService.eliminarPorUrl(nuevaUrl);
      throw new InternalServerErrorException(
        'No se pudo persistir el logo de la organizacion.',
      );
    }

    if (actual.logo_url && actual.logo_url !== nuevaUrl) {
      await this.logoService.eliminarPorUrl(actual.logo_url);
    }

    return { success: true, data: data as OrganizacionRow };
  }

  async borrarLogo(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const actual = await this.cargar(id);
    if (!actual.logo_url) {
      return { success: true, data: actual };
    }

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('organizacion')
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      this.logger.error(`Error al limpiar logo_url para org ${id}`, error);
      throw new InternalServerErrorException(
        'No se pudo borrar el logo de la organizacion.',
      );
    }

    await this.logoService.eliminarPorUrl(actual.logo_url);

    return { success: true, data: data as OrganizacionRow };
  }

  async borrar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const actual = await this.cargar(id);

    const supabase = this.supabaseService.getClient();
    const { count, error: countError } = await supabase
      .from('campania_organizacion')
      .select('id', { count: 'exact', head: true })
      .eq('organizacion_id', id);

    if (countError) {
      this.logger.error(
        `Error al verificar referencias en campania_organizacion para org ${id}`,
        countError,
      );
      throw new InternalServerErrorException(
        'Error al verificar referencias de la organizacion',
      );
    }

    const referencias = count ?? 0;
    if (referencias > 0) {
      const { data, error: updateError } = await supabase
        .from('organizacion')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SELECT_COLUMNS)
        .single();

      if (updateError) {
        this.logger.error(
          `Error al archivar organizacion ${id} con referencias activas`,
          updateError,
        );
        throw new InternalServerErrorException(
          updateError.message || 'No se pudo archivar la organizacion.',
        );
      }

      return {
        success: true,
        data: {
          message:
            'Organizacion archivada correctamente porque tiene campañas asociadas.',
          id,
          metodo: 'soft_delete',
          referencias,
          organizacion: data as OrganizacionRow,
        },
      };
    }

    const { error: deleteError } = await supabase
      .from('organizacion')
      .delete()
      .eq('id', id);

    if (deleteError) {
      if (deleteError.code === '23503') {
        throw new UnprocessableEntityException(
          'No se puede borrar: la organizacion tiene referencias activas.',
        );
      }
      this.logger.error(`Error al borrar organizacion ${id}`, deleteError);
      throw new InternalServerErrorException(
        deleteError.message || 'No se pudo borrar la organizacion.',
      );
    }

    if (actual.logo_url) {
      await this.logoService.eliminarPorUrl(actual.logo_url);
    }

    return {
      success: true,
      data: {
        message: 'Organizacion eliminada correctamente.',
        id,
        metodo: 'hard_delete',
      },
    };
  }

  private async cargar(id: number): Promise<OrganizacionRow> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('organizacion')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error al cargar organizacion ${id}`, error);
      throw new InternalServerErrorException('Error al cargar organizacion');
    }
    if (!data) {
      throw new NotFoundException(`Organizacion con id ${id} no encontrada`);
    }
    return data as OrganizacionRow;
  }

  private isUniqueViolation(error: { code?: string } | null): boolean {
    return error?.code === '23505';
  }
}
