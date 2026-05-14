import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePlantaDto } from './dto/create-planta.dto';
import { CreateTipoPlantaDto } from './dto/create-tipo-planta.dto';
import { ListPlantasQueryDto } from './dto/list-plantas-query.dto';
import { UpdatePlantaDto } from './dto/update-planta.dto';

const BUCKET_FOTOS_PLANTAS = 'fotos_plantas';
const EXTENSIONES_VALIDAS = ['png', 'jpg', 'jpeg', 'webp'];

@Injectable()
export class PlantasService {
  private readonly logger = new Logger(PlantasService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async listar(query: ListPlantasQueryDto) {
    const supabase = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const incluirInactivas = query.incluir_inactivas ?? false;
    const search = (query.q ?? '').trim();

    let dbQuery = supabase
      .from('planta')
      .select('*', { count: 'exact' })
      .order('especie', { ascending: true });

    if (!incluirInactivas) {
      dbQuery = dbQuery.eq('activo', true);
    }

    if (query.tipo_planta_id) {
      dbQuery = dbQuery.eq('tipo_planta_id', query.tipo_planta_id);
    }

    if (search) {
      dbQuery = dbQuery.or(
        `especie.ilike.%${search}%,nombre_cientifico.ilike.%${search}%,nombre_comun_principal.ilike.%${search}%,nombres_comunes.ilike.%${search}%`,
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await dbQuery.range(from, to);

    if (error) {
      this.logger.error('Error al listar plantas', error);
      throw new InternalServerErrorException('Error al listar plantas');
    }

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async obtenerPorId(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('planta')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error al obtener planta ${id}`, error);
      throw new InternalServerErrorException('Error al obtener planta');
    }

    if (!data) {
      throw new NotFoundException(`Planta con ID ${id} no encontrada`);
    }

    return { success: true, data };
  }

  async listarTiposPlanta() {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('tipo_planta')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      this.logger.error('Error al listar tipos de planta', error);
      throw new InternalServerErrorException('Error al listar tipos de planta');
    }

    return { success: true, data: data || [] };
  }

  async crearTipoPlanta(dto: CreateTipoPlantaDto) {
    const supabase = this.supabaseService.getClient();

    const { data: existente } = await supabase
      .from('tipo_planta')
      .select('id, nombre')
      .ilike('nombre', dto.nombre)
      .maybeSingle();

    if (existente) {
      throw new ConflictException(
        `Ya existe un tipo de planta con el nombre "${existente.nombre}"`,
      );
    }

    const { data, error } = await supabase
      .from('tipo_planta')
      .insert([{ nombre: dto.nombre }])
      .select()
      .single();

    if (error) {
      this.logger.error('Error al crear tipo de planta', error);
      throw new InternalServerErrorException('Error al crear tipo de planta');
    }

    return {
      success: true,
      message: 'Tipo de planta creado exitosamente',
      data,
    };
  }

  async crear(dto: CreatePlantaDto, imagen?: Express.Multer.File) {
    const supabase = this.supabaseService.getClient();

    await this.assertTipoPlantaExiste(dto.tipo_planta_id);
    await this.assertNoDuplicado(dto.nombre_cientifico, dto.variedad);

    let imagenUrl: string | null = null;
    if (imagen) {
      imagenUrl = await this.subirImagen(imagen, dto.nombre_cientifico);
    }

    const { data, error } = await supabase
      .from('planta')
      .insert([
        {
          especie: dto.especie,
          nombre_cientifico: dto.nombre_cientifico,
          variedad: dto.variedad,
          tipo_planta_id: dto.tipo_planta_id,
          nombre_comun_principal: dto.nombre_comun_principal ?? null,
          nombres_comunes: dto.nombres_comunes ?? null,
          imagen_url: imagenUrl,
          notas: dto.notas ?? null,
        },
      ])
      .select()
      .single();

    if (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una planta con ese nombre cientifico y variedad',
        );
      }
      this.logger.error('Error al crear planta', error);
      throw new InternalServerErrorException('Error al crear planta');
    }

    return {
      success: true,
      message: 'Planta creada exitosamente',
      data,
    };
  }

  async actualizar(
    id: number,
    dto: UpdatePlantaDto,
    imagen?: Express.Multer.File,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data: actual } = await supabase
      .from('planta')
      .select('id, nombre_cientifico, variedad')
      .eq('id', id)
      .maybeSingle();

    if (!actual) {
      throw new NotFoundException(`Planta con ID ${id} no encontrada`);
    }

    if (dto.tipo_planta_id !== undefined) {
      await this.assertTipoPlantaExiste(dto.tipo_planta_id);
    }

    const nuevoCientifico = dto.nombre_cientifico ?? actual.nombre_cientifico;
    const nuevaVariedad = dto.variedad ?? actual.variedad;
    const cambiaIdentidad =
      dto.nombre_cientifico !== undefined || dto.variedad !== undefined;

    if (cambiaIdentidad) {
      await this.assertNoDuplicado(nuevoCientifico, nuevaVariedad, id);
    }

    const updatePayload: Record<string, unknown> = {};

    if (dto.especie !== undefined) updatePayload.especie = dto.especie;
    if (dto.nombre_cientifico !== undefined)
      updatePayload.nombre_cientifico = dto.nombre_cientifico;
    if (dto.variedad !== undefined) updatePayload.variedad = dto.variedad;
    if (dto.tipo_planta_id !== undefined)
      updatePayload.tipo_planta_id = dto.tipo_planta_id;
    if (dto.nombre_comun_principal !== undefined)
      updatePayload.nombre_comun_principal = dto.nombre_comun_principal;
    if (dto.nombres_comunes !== undefined)
      updatePayload.nombres_comunes = dto.nombres_comunes;
    if (dto.notas !== undefined) updatePayload.notas = dto.notas;
    if (dto.activo !== undefined) updatePayload.activo = dto.activo;

    if (imagen) {
      updatePayload.imagen_url = await this.subirImagen(
        imagen,
        nuevoCientifico,
      );
    }

    if (Object.keys(updatePayload).length === 0) {
      return this.obtenerPorId(id);
    }

    const { error } = await supabase
      .from('planta')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una planta con ese nombre cientifico y variedad',
        );
      }
      this.logger.error(`Error al actualizar planta ${id}`, error);
      throw new InternalServerErrorException('Error al actualizar planta');
    }

    return this.obtenerPorId(id);
  }

  async desactivar(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data: actual } = await supabase
      .from('planta')
      .select('id, activo')
      .eq('id', id)
      .maybeSingle();

    if (!actual) {
      throw new NotFoundException(`Planta con ID ${id} no encontrada`);
    }

    if (actual.activo === false) {
      return this.obtenerPorId(id);
    }

    const { error } = await supabase
      .from('planta')
      .update({ activo: false })
      .eq('id', id);

    if (error) {
      this.logger.error(`Error al desactivar planta ${id}`, error);
      throw new InternalServerErrorException('Error al desactivar planta');
    }

    return this.obtenerPorId(id);
  }

  private async assertTipoPlantaExiste(tipoPlantaId: number) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('tipo_planta')
      .select('id')
      .eq('id', tipoPlantaId)
      .maybeSingle();

    if (error) {
      this.logger.error('Error al validar tipo_planta', error);
      throw new InternalServerErrorException('Error al validar tipo de planta');
    }

    if (!data) {
      throw new NotFoundException(
        `No existe un tipo de planta con ID ${tipoPlantaId}. Use GET /api/plantas/tipos-planta para ver los disponibles.`,
      );
    }
  }

  private async assertNoDuplicado(
    nombreCientifico: string,
    variedad: string,
    excludeId?: number,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('planta')
      .select('id')
      .ilike('nombre_cientifico', nombreCientifico)
      .ilike('variedad', variedad);

    if (error) {
      this.logger.error('Error al validar duplicado de planta', error);
      throw new InternalServerErrorException('Error al validar planta');
    }

    const colision = (data || []).find(
      (row) => !excludeId || Number(row.id) !== excludeId,
    );

    if (colision) {
      throw new ConflictException(
        `Ya existe una planta con nombre cientifico "${nombreCientifico}" y variedad "${variedad}"`,
      );
    }
  }

  private async subirImagen(
    file: Express.Multer.File,
    nombreCientifico: string,
  ): Promise<string> {
    const extension = this.resolveExtension(file);
    const supabase = this.supabaseService.getClient();

    const slug = nombreCientifico
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    const filePath = `${slug || 'planta'}_${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET_FOTOS_PLANTAS)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      this.logger.error('Error al subir imagen a Storage', error);
      throw new InternalServerErrorException(
        'Error al subir imagen de planta al storage',
      );
    }

    const { data: publicUrl } = supabase.storage
      .from(BUCKET_FOTOS_PLANTAS)
      .getPublicUrl(filePath);

    return publicUrl.publicUrl;
  }

  private resolveExtension(file: Express.Multer.File): string {
    const mimePart = (file.mimetype || '').split('/')[1]?.toLowerCase();
    if (mimePart && EXTENSIONES_VALIDAS.includes(mimePart)) {
      return mimePart;
    }
    const nameParts = (file.originalname || '').split('.');
    const fromName = nameParts.length > 1 ? nameParts.pop()?.toLowerCase() : '';
    if (fromName && EXTENSIONES_VALIDAS.includes(fromName)) {
      return fromName;
    }
    throw new BadRequestException(
      `Extension de imagen no soportada. Permitidas: ${EXTENSIONES_VALIDAS.join(', ')}`,
    );
  }

  private isUniqueViolation(error: { code?: string } | null): boolean {
    return error?.code === '23505';
  }
}
