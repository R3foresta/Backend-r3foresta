import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FiltersLoteFaseViveroDto } from './dto/filters-lote-fase-vivero.dto';

@Injectable()
export class LotesFaseViveroService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /api/lotes-fase-vivero
   * Lista lotes en fase vivero con filtros opcionales
   */
  async findAll(filters: FiltersLoteFaseViveroDto) {
    const supabase = this.supabaseService.getClient();

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('lote_fase_vivero')
      .select(
        `
        *,
        planta:planta_id (id, especie, nombre_cientifico, variedad),
        vivero:vivero_id (
          id,
          codigo,
          nombre,
          ubicacion:ubicacion_id (departamento, comunidad)
        ),
        responsable:responsable_id (id, nombre, username)
      `,
        { count: 'exact' },
      )
      .order('fecha_inicio', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters.vivero_id) {
      query = query.eq('vivero_id', filters.vivero_id);
    }

    if (filters.planta_id) {
      query = query.eq('planta_id', filters.planta_id);
    }

    if (filters.responsable_id) {
      query = query.eq('responsable_id', filters.responsable_id);
    }

    if (filters.search) {
      query = query.ilike('codigo_trazabilidad', `%${filters.search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error al obtener lotes de fase vivero:', error);
      throw new InternalServerErrorException(
        'Error al obtener lotes de fase vivero',
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * GET /api/lotes-fase-vivero/:id
   * Obtiene un lote en fase vivero por ID
   */
  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('lote_fase_vivero')
      .select(
        `
        *,
        planta:planta_id (id, especie, nombre_cientifico, variedad),
        vivero:vivero_id (
          id,
          codigo,
          nombre,
          ubicacion:ubicacion_id (departamento, comunidad)
        ),
        responsable:responsable_id (id, nombre, username)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Lote de fase vivero no encontrado');
    }

    return {
      success: true,
      data,
    };
  }
}
