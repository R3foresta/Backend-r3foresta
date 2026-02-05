import {
  Injectable,
  InternalServerErrorException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePlantaDto } from './dto/create-planta.dto';

@Injectable()
export class PlantasService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Convierte base64 a Buffer y extrae el tipo de archivo
   */
  private parseBase64Image(base64String: string): {
    buffer: Buffer;
    mimeType: string;
    extension: string;
  } {
    // Formato esperado: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
    const matches = base64String.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    
    if (!matches) {
      throw new BadRequestException(
        'Formato de imagen inválido. Debe ser base64 con formato: data:image/[tipo];base64,[datos]'
      );
    }

    const extension = matches[1]; // png, jpeg, jpg, webp, etc.
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const mimeType = `image/${extension}`;

    return { buffer, mimeType, extension };
  }

  /**
   * Sube una imagen al bucket de Supabase Storage
   */
  private async uploadImageToStorage(
    base64Image: string,
    fileName: string,
  ): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const { buffer, mimeType, extension } = this.parseBase64Image(base64Image);

    // Crear nombre único para el archivo
    const timestamp = Date.now();
    const uniqueFileName = `${fileName}_${timestamp}.${extension}`;
    const filePath = `${uniqueFileName}`;

    // Subir imagen al bucket
    const { data, error } = await supabase.storage
      .from('fotos_plantas')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('❌ Error al subir imagen a Storage:', error);
      throw new InternalServerErrorException('Error al subir imagen al storage');
    }

    // Obtener URL pública de la imagen
    const { data: publicUrlData } = supabase.storage
      .from('fotos_plantas')
      .getPublicUrl(filePath);

    console.log('✅ Imagen subida exitosamente:', publicUrlData.publicUrl);
    
    return publicUrlData.publicUrl;
  }

  /**
   * GET /api/plantas
   * Lista todas las plantas
   */
  async findAll(search?: string) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('planta')
      .select('*')
      .order('especie', { ascending: true });

    // Si hay búsqueda, filtrar por nombre científico o especie
    if (search) {
      query = query.or(
        `especie.ilike.%${search}%,nombre_cientifico.ilike.%${search}%`,
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error al obtener plantas:', error);
      throw new InternalServerErrorException('Error al obtener plantas');
    }

    return {
      success: true,
      data: data || [],
    };
  }

  /**
   * GET /api/plantas/search?q=caoba
   * Busca plantas por término
   */
  async search(term: string) {
    return this.findAll(term);
  }

  /**
   * POST /api/plantas
   * Crea una nueva planta en el catálogo
   */
  async create(createPlantaDto: CreatePlantaDto) {
    const supabase = this.supabaseService.getClient();

    // Verificar duplicado por nombre científico y variedad (case-insensitive)
    const { data: existing } = await supabase
      .from('planta')
      .select('id, nombre_cientifico, variedad')
      .ilike('nombre_cientifico', createPlantaDto.nombre_cientifico)
      .ilike('variedad', createPlantaDto.variedad)
      .maybeSingle();

    if (existing) {
      throw new ConflictException(
        `Ya existe una planta con nombre científico "${existing.nombre_cientifico}" y variedad "${existing.variedad}". No se pueden crear plantas duplicadas.`,
      );
    }

    // Procesar imagen si viene en base64
    let imagenUrl = createPlantaDto.imagen_url || null;
    
    if (createPlantaDto.imagen_url && createPlantaDto.imagen_url.startsWith('data:image/')) {
      // Es una imagen en base64, subirla a Supabase Storage
      const nombreArchivo = createPlantaDto.nombre_cientifico
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      
      imagenUrl = await this.uploadImageToStorage(
        createPlantaDto.imagen_url,
        nombreArchivo,
      );
      
      console.log('✅ URL de imagen guardada:', imagenUrl);
    }

    // Insertar nueva planta
    const { data, error } = await supabase
      .from('planta')
      .insert([
        {
          especie: createPlantaDto.especie,
          nombre_cientifico: createPlantaDto.nombre_cientifico,
          variedad: createPlantaDto.variedad,
          tipo_planta: createPlantaDto.tipo_planta || null,
          tipo_planta_otro: createPlantaDto.tipo_planta_otro || null,
          nombre_comun_principal: createPlantaDto.nombre_comun_principal || null,
          nombres_comunes: createPlantaDto.nombres_comunes || null,
          imagen_url: imagenUrl,
          notas: createPlantaDto.notas || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Error al crear planta:', error);
      throw new InternalServerErrorException('Error al crear planta');
    }

    return {
      success: true,
      message: 'Planta creada exitosamente',
      data,
    };
  }
}
