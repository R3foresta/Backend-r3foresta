import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { UpdateDraftDto } from '../api/dto/update-draft.dto';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';
import {
  CantidadUnidadPolicy,
  type TipoMaterialRecoleccionCanonico,
} from '../domain/policies/cantidad-unidad.policy';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';
import { RecoleccionAuthService } from './recoleccion-auth.service';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';
import { RecoleccionEvidenciasService } from './recoleccion-evidencias.service';
import { RecoleccionSnapshotsService } from './recoleccion-snapshots.service';
import { RecoleccionUbicacionService } from './recoleccion-ubicacion.service';
import type { RecoleccionFotoInput } from '../domain/policies/evidencia-completitud.policy';

@Injectable()
export class RecoleccionDraftService {
  private readonly logger = new Logger(RecoleccionDraftService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
    private readonly consultasService: RecoleccionConsultasService,
    private readonly evidenciasService: RecoleccionEvidenciasService,
    private readonly snapshotsService: RecoleccionSnapshotsService,
    private readonly ubicacionService: RecoleccionUbicacionService,
  ) {}

  async updateDraft(
    id: number,
    dto: UpdateDraftDto,
    authId: string,
    userRole: string,
    files: RecoleccionFotoInput[] = [],
  ) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    const estadoActual = String(
      recoleccion.estado_registro ?? '',
    ).toUpperCase();

    if (
      estadoActual !== EstadoRegistro.BORRADOR &&
      estadoActual !== EstadoRegistro.RECHAZADO
    ) {
      throw new BadRequestException(
        `No se puede editar una recolección en estado ${estadoActual}. Solo se puede editar en BORRADOR o RECHAZADO.`,
      );
    }

    this.authService.assertOwnerOrAdmin(
      { usuario_id: recoleccion.usuario_id as number },
      usuario.id,
      usuario.rol,
    );
    this.evidenciasService.validarDraftFotos(files);

    const updatePayload: Record<string, unknown> = {};

    if (dto.fecha !== undefined) {
      updatePayload.fecha =
        FechaRecoleccionPolicy.assertFechaRecoleccionPermitida(dto.fecha);
    }
    if (dto.tipo_material !== undefined)
      updatePayload.tipo_material = dto.tipo_material;
    if (dto.observaciones !== undefined)
      updatePayload.observaciones = dto.observaciones;
    if (dto.vivero_id !== undefined) updatePayload.vivero_id = dto.vivero_id;
    if (dto.metodo_id !== undefined) updatePayload.metodo_id = dto.metodo_id;
    if (dto.planta_id !== undefined) updatePayload.planta_id = dto.planta_id;

    if (
      dto.cantidad_inicial_canonica !== undefined ||
      dto.unidad_canonica !== undefined ||
      dto.tipo_material !== undefined
    ) {
      if (
        dto.unidad_canonica !== undefined &&
        dto.cantidad_inicial_canonica === undefined
      ) {
        throw new BadRequestException(
          'Si cambias unidad_canonica también debes enviar cantidad_inicial_canonica para evitar conversiones ambiguas.',
        );
      }

      const tipoMaterialObjetivo = String(
        dto.tipo_material ?? recoleccion.tipo_material ?? '',
      ).toUpperCase() as TipoMaterialRecoleccionCanonico;
      const cantidadObjetivo = Number(
        dto.cantidad_inicial_canonica ?? recoleccion.cantidad_inicial_canonica,
      );
      const unidadCanonicaObjetivo = CantidadUnidadPolicy.normalizarUnidadInput(
        String(dto.unidad_canonica ?? recoleccion.unidad_canonica),
      );

      const canonicalInput = CantidadUnidadPolicy.normalizarYValidar(
        cantidadObjetivo,
        unidadCanonicaObjetivo,
        tipoMaterialObjetivo,
      );

      updatePayload.cantidad_inicial_canonica =
        canonicalInput.cantidad_canonica;
      updatePayload.unidad_canonica = canonicalInput.unidad_canonica;
    }

    if (estadoActual === EstadoRegistro.RECHAZADO) {
      updatePayload.estado_registro = EstadoRegistro.BORRADOR;
      this.logger.log(
        `📝 Recolección ${id}: RECHAZADO → BORRADOR (edición de borrador)`,
      );
    }

    const nuevaUbicacionPayload = dto.ubicacion
      ? await this.resolveCambioUbicacion(
          dto.ubicacion,
          recoleccion.ubicacion_id,
        )
      : null;

    if (
      Object.keys(updatePayload).length === 0 &&
      files.length === 0 &&
      !nuevaUbicacionPayload
    ) {
      throw new BadRequestException('No se enviaron campos para actualizar.');
    }

    const rollbackPayload: Record<string, unknown> = {};
    let recoleccionActualizada = false;
    let insertedEvidenceIds: number[] = [];
    let uploadedPaths: string[] = [];
    let nuevaUbicacionId: number | null = null;
    let vinculoUbicacionIntentado = false;

    try {
      if (nuevaUbicacionPayload) {
        const { data, error } = await this.supabaseService
          .getAdminClient()
          .from('ubicacion')
          .insert(nuevaUbicacionPayload)
          .select('id')
          .single();

        if (error || !data) {
          throw new InternalServerErrorException(
            'Error al guardar la ubicación de la recolección',
          );
        }

        nuevaUbicacionId = Number(data.id);
        updatePayload.ubicacion_id = nuevaUbicacionId;
      }

      const shouldRefreshSnapshots =
        dto.planta_id !== undefined ||
        estadoActual === EstadoRegistro.RECHAZADO ||
        nuevaUbicacionId !== null;

      if (shouldRefreshSnapshots) {
        const snapshotPayload = await this.snapshotsService.resolve({
          plantaId: dto.planta_id ?? recoleccion.planta_id,
          usuarioId: recoleccion.usuario_id,
          ubicacionId: nuevaUbicacionId ?? recoleccion.ubicacion_id,
        });

        Object.assign(updatePayload, snapshotPayload);
      }

      for (const key of Object.keys(updatePayload)) {
        rollbackPayload[key] = (recoleccion as Record<string, unknown>)[key];
      }

      if (Object.keys(updatePayload).length > 0) {
        vinculoUbicacionIntentado = nuevaUbicacionId !== null;
        const { error: updateError } = await supabase
          .from('recoleccion')
          .update(updatePayload)
          .eq('id', id);

        if (updateError) {
          this.logger.error('❌ Error al actualizar borrador:', updateError);
          throw new InternalServerErrorException(
            'Error al actualizar borrador',
          );
        }

        recoleccionActualizada = true;
      }

      if (files.length > 0) {
        const appendResult =
          await this.evidenciasService.appendDraftFotosAsEvidencias(
            id,
            String(recoleccion.codigo_trazabilidad ?? ''),
            usuario.id,
            files,
          );

        insertedEvidenceIds = appendResult.insertedEvidenceIds;
        uploadedPaths = appendResult.uploadedPaths;
      }
    } catch (error) {
      // Antes de intentar el vínculo sabemos que esta llamada no la referenció.
      // Después, incluso un fallo de transporte puede ocultar un UPDATE confirmado.
      if (nuevaUbicacionId !== null && !vinculoUbicacionIntentado) {
        await this.removeUbicacionSinVinculo(nuevaUbicacionId);
      }
      await this.evidenciasService.deleteEvidenceIds(insertedEvidenceIds);
      await this.evidenciasService.removeStoragePaths(uploadedPaths);

      if (recoleccionActualizada && Object.keys(rollbackPayload).length > 0) {
        await supabase.from('recoleccion').update(rollbackPayload).eq('id', id);
      }

      throw error;
    }

    this.logger.log(
      `✅ Recolección ${id} actualizada como borrador${files.length > 0 ? ` y ${files.length} foto(s) agregada(s)` : ''}`,
    );
    return this.consultasService.findOne(id);
  }

  private async resolveCambioUbicacion(
    ubicacion: NonNullable<UpdateDraftDto['ubicacion']>,
    ubicacionId: number,
  ) {
    const payload =
      await this.ubicacionService.validateAndNormalizeUbicacionPayload(
        ubicacion,
      );
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('ubicacion')
      .select(
        'pais_id, division_id, nombre, referencia, latitud, longitud, precision_m, fuente',
      )
      .eq('id', ubicacionId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        'Error al consultar la ubicación de la recolección',
      );
    }

    const numericFields = new Set([
      'pais_id',
      'division_id',
      'latitud',
      'longitud',
      'precision_m',
    ]);
    const normalize = (key: string, value: unknown) => {
      if (value === null || value === undefined || value === '') return null;
      return numericFields.has(key)
        ? Number(value)
        : String(value).trim() || null;
    };
    const coincide =
      data &&
      Object.entries(payload).every(
        ([key, value]) => normalize(key, value) === normalize(key, data[key]),
      );

    return coincide ? null : payload;
  }

  private async removeUbicacionSinVinculo(ubicacionId: number): Promise<void> {
    try {
      const { error } = await this.supabaseService
        .getAdminClient()
        .from('ubicacion')
        .delete()
        .eq('id', ubicacionId);
      if (error)
        this.logger.error('No se pudo limpiar la ubicación sin vínculo');
    } catch {
      this.logger.error('No se pudo limpiar la ubicación sin vínculo');
    }
  }
}
