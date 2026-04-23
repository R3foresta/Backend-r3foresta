import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type RecoleccionSnapshotPayload = {
  nombre_cientifico_snapshot: string;
  nombre_comercial_snapshot: string;
  variedad_snapshot: string;
  nombre_comunidad_snapshot: string;
  nombre_recolector_snapshot: string;
};

export const RECOLECCION_SNAPSHOT_DEFAULTS = {
  VARIEDAD: 'comun',
  COMUNIDAD: 'SIN ESPECIFICAR',
} as const;

@Injectable()
export class RecoleccionSnapshotsService {
  private readonly logger = new Logger(RecoleccionSnapshotsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async resolve(params: {
    plantaId: number;
    usuarioId: number;
    ubicacionId: number;
  }): Promise<RecoleccionSnapshotPayload> {
    const [plantaSnapshot, nombreRecolector, nombreComunidad] =
      await Promise.all([
        this.getPlantaSnapshotData(params.plantaId),
        this.getUsuarioDisplayNameById(params.usuarioId),
        this.getNombreComunidadByUbicacionId(params.ubicacionId),
      ]);

    return {
      nombre_cientifico_snapshot: plantaSnapshot.nombre_cientifico_snapshot,
      nombre_comercial_snapshot: plantaSnapshot.nombre_comercial_snapshot,
      variedad_snapshot: plantaSnapshot.variedad_snapshot,
      nombre_comunidad_snapshot: nombreComunidad,
      nombre_recolector_snapshot: nombreRecolector,
    };
  }

  private async getPlantaSnapshotData(plantaId: number): Promise<{
    nombre_cientifico_snapshot: string;
    nombre_comercial_snapshot: string;
    variedad_snapshot: string;
  }> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('planta')
      .select('nombre_cientifico, nombre_comun_principal, especie, variedad')
      .eq('id', plantaId)
      .single();

    if (error || !data) {
      this.logger.error(
        `❌ Error al resolver snapshot de planta para recolección (planta_id=${plantaId}):`,
        error,
      );
      throw new NotFoundException('Planta no encontrada');
    }

    const nombreCientifico = this.toRequiredTrimmedString(
      data.nombre_cientifico,
      `La planta ${plantaId} no tiene nombre_cientifico válido`,
    );
    const nombreComercial =
      this.toTrimmedString(data.nombre_comun_principal) ??
      this.toTrimmedString(data.especie);

    if (!nombreComercial) {
      throw new BadRequestException(
        `La planta ${plantaId} no tiene nombre comercial válido ni especie de respaldo`,
      );
    }

    return {
      nombre_cientifico_snapshot: nombreCientifico,
      nombre_comercial_snapshot: nombreComercial,
      variedad_snapshot:
        this.toTrimmedString(data.variedad) ??
        RECOLECCION_SNAPSHOT_DEFAULTS.VARIEDAD,
    };
  }

  private async getUsuarioDisplayNameById(usuarioId: number): Promise<string> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('usuario')
      .select('nombre, apellido, username')
      .eq('id', usuarioId)
      .single();

    if (error || !data) {
      this.logger.error(
        `❌ Error al resolver snapshot de recolector (usuario_id=${usuarioId}):`,
        error,
      );
      throw new NotFoundException('Usuario no encontrado');
    }

    const nombre = this.toTrimmedString(data.nombre);
    const apellido = this.toTrimmedString(data.apellido);
    const username = this.toTrimmedString(data.username);

    const fullName = [nombre, apellido].filter(Boolean).join(' ').trim();
    const displayName = fullName || username || nombre;
    if (!displayName) {
      throw new BadRequestException(
        `El usuario ${usuarioId} no tiene nombre válido para snapshot`,
      );
    }

    return displayName;
  }

  private async getNombreComunidadByUbicacionId(
    ubicacionId: number,
  ): Promise<string> {
    const supabase = this.supabaseService.getClient();

    const { data: ubicacionData, error: ubicacionError } = await supabase
      .from('ubicacion')
      .select('division_id')
      .eq('id', ubicacionId)
      .single();

    if (ubicacionError || !ubicacionData) {
      this.logger.error(
        `❌ Error al resolver ubicación para snapshot de comunidad (ubicacion_id=${ubicacionId}):`,
        ubicacionError,
      );
      throw new NotFoundException('Ubicación no encontrada');
    }

    const divisionId = ubicacionData.division_id;
    if (!Number.isInteger(divisionId) || divisionId <= 0) {
      return RECOLECCION_SNAPSHOT_DEFAULTS.COMUNIDAD;
    }

    const { data: divisionData, error: divisionError } = await supabase
      .from('division_administrativa')
      .select('nombre')
      .eq('id', divisionId)
      .single();

    if (divisionError || !divisionData) {
      this.logger.error(
        `❌ Error al resolver división administrativa para snapshot de comunidad (division_id=${divisionId}):`,
        divisionError,
      );
      throw new NotFoundException('División administrativa no encontrada');
    }

    return (
      this.toTrimmedString(divisionData.nombre) ??
      RECOLECCION_SNAPSHOT_DEFAULTS.COMUNIDAD
    );
  }

  private toTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toRequiredTrimmedString(value: unknown, errorMessage: string): string {
    const trimmed = this.toTrimmedString(value);
    if (!trimmed) {
      throw new BadRequestException(errorMessage);
    }
    return trimmed;
  }
}
