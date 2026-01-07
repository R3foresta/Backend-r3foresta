import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ViverosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /api/viveros
   * Lista todos los viveros con su ubicación
   */
  async findAll() {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('vivero')
      .select(
        `
        id,
        codigo,
        nombre,
        ubicacion:ubicacion_id (
          departamento,
          comunidad
        )
      `,
      )
      .order('nombre', { ascending: true });

    if (error) {
      console.error('❌ Error al obtener viveros:', error);
      throw new InternalServerErrorException('Error al obtener viveros');
    }

    return {
      success: true,
      data: data || [],
    };
  }
}
