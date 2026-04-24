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
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

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
    if (dto.tipo_material !== undefined) updatePayload.tipo_material = dto.tipo_material;
    if (dto.observaciones !== undefined) updatePayload.observaciones = dto.observaciones;
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

      updatePayload.cantidad_inicial_canonica = canonicalInput.cantidad_canonica;
      updatePayload.unidad_canonica = canonicalInput.unidad_canonica;
    }

    if (estadoActual === EstadoRegistro.RECHAZADO) {
      updatePayload.estado_registro = EstadoRegistro.BORRADOR;
      this.logger.log(
        `📝 Recolección ${id}: RECHAZADO → BORRADOR (edición de borrador)`,
      );
    }

    const shouldRefreshSnapshots =
      dto.planta_id !== undefined || estadoActual === EstadoRegistro.RECHAZADO;

    if (shouldRefreshSnapshots) {
      const snapshotPayload = await this.snapshotsService.resolve({
        plantaId: dto.planta_id ?? recoleccion.planta_id,
        usuarioId: recoleccion.usuario_id,
        ubicacionId: recoleccion.ubicacion_id,
      });

      Object.assign(updatePayload, snapshotPayload);
    }

    if (Object.keys(updatePayload).length === 0 && files.length === 0) {
      throw new BadRequestException('No se enviaron campos para actualizar.');
    }

    const rollbackPayload = Object.keys(updatePayload).reduce(
      (accumulator, key) => {
        accumulator[key] = (recoleccion as Record<string, unknown>)[key];
        return accumulator;
      },
      {} as Record<string, unknown>,
    );

    let recoleccionActualizada = false;
    let insertedEvidenceIds: number[] = [];
    let uploadedPaths: string[] = [];

    try {
      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from('recoleccion')
          .update(updatePayload)
          .eq('id', id);

        if (updateError) {
          this.logger.error('❌ Error al actualizar borrador:', updateError);
          throw new InternalServerErrorException('Error al actualizar borrador');
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
}
