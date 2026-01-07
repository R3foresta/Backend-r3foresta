import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class MetodosRecoleccionService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /api/metodos-recoleccion
   * Lista todos los métodos de recolección
   */
  async findAll() {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('metodo_recoleccion')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('❌ Error al obtener métodos:', error);
      throw new InternalServerErrorException(
        'Error al obtener métodos de recolección',
      );
    }

    return {
      success: true,
      data: data || [],
    };
  }
}
