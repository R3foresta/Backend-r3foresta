import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UbicacionesReadService } from '../common/ubicaciones/ubicaciones-read.service';

@Injectable()
export class ViverosService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly ubicacionesReadService: UbicacionesReadService,
  ) {}

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
        ubicacion_id
      `,
      )
      .order('nombre', { ascending: true });

    if (error) {
      console.error('❌ Error al obtener viveros:', error);
      throw new InternalServerErrorException('Error al obtener viveros');
    }

    const viveros = data || [];
    const ubicacionIds = viveros
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((vivero: any) => vivero.ubicacion_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((id: any) => Number.isInteger(id) && id > 0);
    const ubicaciones = await this.ubicacionesReadService.getUbicacionesByIds(
      ubicacionIds,
    );

    const dataMapped = viveros.map((vivero: any) => ({
      id: vivero.id,
      codigo: vivero.codigo,
      nombre: vivero.nombre,
      ubicacion: ubicaciones.get(vivero.ubicacion_id) || null,
    }));

    return {
      success: true,
      data: dataMapped,
    };
  }
}
