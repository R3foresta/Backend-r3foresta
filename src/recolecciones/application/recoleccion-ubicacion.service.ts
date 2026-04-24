import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUbicacionDto } from '../api/dto/create-ubicacion.dto';
import { UbicacionesReadService } from '../../common/ubicaciones/ubicaciones-read.service';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class RecoleccionUbicacionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly ubicacionesReadService: UbicacionesReadService,
  ) {}

  async validateAndNormalizeUbicacionPayload(ubicacion: CreateUbicacionDto) {
    const supabase = this.supabaseService.getClient();
    let paisId = ubicacion.pais_id ?? null;

    if (ubicacion.division_id) {
      const { data: divisionData, error: divisionError } = await supabase
        .from('division_administrativa')
        .select('id, pais_id')
        .eq('id', ubicacion.division_id)
        .single();

      if (divisionError || !divisionData) {
        throw new NotFoundException('División administrativa no encontrada');
      }

      const divisionPaisId = Number(divisionData.pais_id);

      if (paisId && paisId !== divisionPaisId) {
        throw new BadRequestException(
          'division_id no pertenece al pais_id enviado',
        );
      }

      paisId = divisionPaisId;
    }

    if (paisId) {
      const { data: paisData, error: paisError } = await supabase
        .from('pais')
        .select('id')
        .eq('id', paisId)
        .single();

      if (paisError || !paisData) {
        throw new NotFoundException('País no encontrado');
      }
    }

    return {
      pais_id: paisId,
      division_id: ubicacion.division_id ?? null,
      nombre: ubicacion.nombre?.trim() || null,
      referencia: ubicacion.referencia?.trim() || null,
      latitud: ubicacion.latitud,
      longitud: ubicacion.longitud,
      precision_m: ubicacion.precision_m ?? null,
      fuente: ubicacion.fuente ?? null,
    };
  }

  async enrichSingleRecoleccion(recoleccion: any) {
    const mapped = await this.enrichRecoleccionesWithUbicaciones([recoleccion]);
    return mapped[0];
  }

  async enrichRecoleccionesWithUbicaciones(recolecciones: any[]) {
    const ubicacionIds = recolecciones.flatMap((recoleccion: any) => {
      const ids: number[] = [];
      if (
        Number.isInteger(recoleccion.ubicacion_id) &&
        recoleccion.ubicacion_id > 0
      ) {
        ids.push(recoleccion.ubicacion_id);
      }
      if (
        Number.isInteger(recoleccion.vivero?.ubicacion_id) &&
        recoleccion.vivero.ubicacion_id > 0
      ) {
        ids.push(recoleccion.vivero.ubicacion_id);
      }
      return ids;
    });

    const ubicaciones =
      await this.ubicacionesReadService.getUbicacionesByIds(ubicacionIds);

    return recolecciones.map((recoleccion: any) => ({
      ...recoleccion,
      ubicacion_id: recoleccion.ubicacion_id,
      ubicacion: ubicaciones.get(recoleccion.ubicacion_id) || null,
      vivero: recoleccion.vivero
        ? {
            ...recoleccion.vivero,
            ubicacion: ubicaciones.get(recoleccion.vivero.ubicacion_id) || null,
          }
        : null,
    }));
  }
}
