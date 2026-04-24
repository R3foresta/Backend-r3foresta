import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EvidenciaCompletitudPolicy } from '../domain/policies/evidencia-completitud.policy';
import { RecoleccionEvidenciasService } from './recoleccion-evidencias.service';

@Injectable()
export class RecoleccionCompletitudService {
  private readonly logger = new Logger(RecoleccionCompletitudService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly evidenciasService: RecoleccionEvidenciasService,
  ) {}

  async assertRecoleccionCompletaParaValidacion(
    recoleccion: Record<string, any>,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const recoleccionId = Number(recoleccion.id);
    const ubicacionId = Number(recoleccion.ubicacion_id);

    const { data: ubicacion, error: ubicacionError } = await supabase
      .from('ubicacion')
      .select('latitud, longitud')
      .eq('id', ubicacionId)
      .single();

    if (ubicacionError || !ubicacion) {
      throw new NotFoundException('Ubicación no encontrada');
    }

    const { count: fotosCount, error: evidenciasError } = await supabase
      .from('evidencias_trazabilidad')
      .select('id', { count: 'exact', head: true })
      .eq('tipo_entidad_id', this.evidenciasService.tipoEntidadEvidenciaId)
      .eq('entidad_id', recoleccionId)
      .is('eliminado_en', null);

    if (evidenciasError) {
      this.logger.error(
        '❌ Error al contar evidencias para validación:',
        evidenciasError,
      );
      throw new InternalServerErrorException(
        'Error al validar evidencias de la recolección',
      );
    }

    EvidenciaCompletitudPolicy.assertCompletaParaValidacion({
      fecha: recoleccion.fecha,
      tipo_material: recoleccion.tipo_material,
      planta_id: recoleccion.planta_id,
      metodo_id: recoleccion.metodo_id,
      vivero_id: recoleccion.vivero_id,
      cantidad_inicial_canonica: recoleccion.cantidad_inicial_canonica,
      unidad_canonica: recoleccion.unidad_canonica,
      latitud: ubicacion.latitud,
      longitud: ubicacion.longitud,
      fotos_count: fotosCount ?? 0,
    });
  }
}
