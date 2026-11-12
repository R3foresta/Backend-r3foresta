import {
  BadRequestException,
  Injectable,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { guardarRecoleccion } from './recoleccion-rpc';
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
    files: RecoleccionFotoInput[] = [],
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    await this.authService.assertOwnerOrAdmin(
      { usuario_id: recoleccion.usuario_id as number },
      usuario.id,
      usuario.rol,
    );

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

    this.evidenciasService.validarDraftFotos(files);

    const updatePayload: Record<string, unknown> = {};

    if (dto.fecha !== undefined) {
      const fecha = FechaRecoleccionPolicy.normalizeIsoDateString(
        dto.fecha,
        'fecha',
      );
      // Reenviar la fecha conservada no vuelve a abrir la ventana de captura.
      // Un cambio real sí exige una nueva fecha dentro de los 45 días.
      updatePayload.fecha =
        fecha === recoleccion.fecha
          ? fecha
          : FechaRecoleccionPolicy.assertFechaRecoleccionPermitida(fecha);
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

    let uploadedPaths: string[] = [];
    let nuevaUbicacionId: number | null = null;
    let escrituraEnviada = false;
    let confirmada = false;

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
        dto.planta_id !== undefined || nuevaUbicacionId !== null;

      if (shouldRefreshSnapshots) {
        const snapshotPayload = await this.snapshotsService.resolve({
          plantaId: dto.planta_id ?? recoleccion.planta_id,
          usuarioId: recoleccion.usuario_id,
          ubicacionId: nuevaUbicacionId ?? recoleccion.ubicacion_id,
        });

        if (dto.planta_id !== undefined) {
          updatePayload.nombre_cientifico_snapshot =
            snapshotPayload.nombre_cientifico_snapshot;
          updatePayload.nombre_comercial_snapshot =
            snapshotPayload.nombre_comercial_snapshot;
          updatePayload.variedad_snapshot = snapshotPayload.variedad_snapshot;
        }
        if (nuevaUbicacionId !== null)
          updatePayload.nombre_comunidad_snapshot =
            snapshotPayload.nombre_comunidad_snapshot;
      }

      const fotos = files.length
        ? await this.evidenciasService.uploadFotosCreacion(files)
        : [];
      uploadedPaths = fotos.map((foto) => foto.ruta_archivo);
      escrituraEnviada = true;
      await guardarRecoleccion(
        supabase,
        usuario.id,
        'EDITAR',
        id,
        recoleccion.revision_captura,
        updatePayload,
        fotos.map((foto) => ({
          ...foto,
          metadata: { ...foto.metadata, origen: 'UPDATE_DRAFT' },
        })),
      );
      confirmada = true;
    } catch (error) {
      // Un rechazo SQL conocido revierte la RPC completa. Una respuesta perdida
      // conserva recursos: podría haber quedado confirmada la ficha y sus fotos.
      const rechazo =
        error instanceof HttpException &&
        [400, 403, 404, 409].includes(error.getStatus());
      if (!confirmada && (!escrituraEnviada || rechazo)) {
        if (nuevaUbicacionId !== null)
          await this.removeUbicacionSinVinculo(nuevaUbicacionId);
        await this.evidenciasService.removeStoragePaths(uploadedPaths);
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
