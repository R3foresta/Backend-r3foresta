import {
  Injectable,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePlantaDto } from './dto/create-planta.dto';

@Injectable()
export class PlantasService {
  constructor(private readonly supabaseService: SupabaseService) {}

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

    // Verificar duplicado por nombre científico
    const { data: existing } = await supabase
      .from('planta')
      .select('id')
      .ilike('nombre_cientifico', createPlantaDto.nombre_cientifico)
      .single();

    if (existing) {
      throw new ConflictException(
        `Ya existe una planta con nombre científico "${createPlantaDto.nombre_cientifico}"`,
      );
    }

    // Insertar nueva planta
    const { data, error } = await supabase
      .from('planta')
      .insert([
        {
          especie: createPlantaDto.especie,
          nombre_cientifico: createPlantaDto.nombre_cientifico,
          variedad: 'Común', // Valor por defecto
          tipo_planta: createPlantaDto.tipo_planta,
          tipo_planta_otro: createPlantaDto.tipo_planta_otro || null,
          fuente: createPlantaDto.fuente,
          nombres_comunes: createPlantaDto.nombres_comunes,
          nombre_comun_principal: createPlantaDto.nombre_comun_principal || null,
          imagen_url: createPlantaDto.imagen_url || null,
          reino: createPlantaDto.reino || null,
          division: createPlantaDto.division || null,
          clase: createPlantaDto.clase || null,
          orden: createPlantaDto.orden || null,
          familia: createPlantaDto.familia || null,
          genero: createPlantaDto.genero || null,
          origen_geografico: createPlantaDto.origen_geografico || null,
          habitat_descripcion: createPlantaDto.habitat_descripcion || null,
          descripcion_morfologica: createPlantaDto.descripcion_morfologica || null,
          usos_industriales: createPlantaDto.usos_industriales || null,
          usos_medicinales: createPlantaDto.usos_medicinales || null,
          usos_ornamentales: createPlantaDto.usos_ornamentales || null,
          advertencia_toxicidad: createPlantaDto.advertencia_toxicidad || null,
          notas_manejo_recoleccion: createPlantaDto.notas_manejo_recoleccion || null,
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
