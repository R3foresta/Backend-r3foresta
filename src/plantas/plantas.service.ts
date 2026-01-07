import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
}
