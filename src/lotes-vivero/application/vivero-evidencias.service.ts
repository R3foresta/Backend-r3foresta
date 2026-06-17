import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EvidenceFileService,
  type PreparedEvidenceFile,
} from '../../common/files/evidence-file.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import { ViveroAuthService } from './vivero-auth.service';

export type ViveroEvidenceFileInput = {
  mimetype?: string;
  size?: number;
  originalname?: string;
  buffer?: Buffer;
};

type FotoSubidaVivero = {
  ruta_archivo: string;
  storage_object_id: string | null;
  mime_type: string;
  tamano_bytes: number;
  hash_sha256: string | null;
  metadata: PreparedEvidenceFile['metadata'];
};

export type CrearPendienteViveroOptions = {
  eventoTipo?: TipoEventoVivero;
};

@Injectable()
export class ViveroEvidenciasService {
  private readonly logger = new Logger(ViveroEvidenciasService.name);
  // TODO(vivero-mvp): revisar política de buckets de storage.
  //   Las migraciones 003 y 004 crean buckets dedicados (`recoleccion_fotos`, `vivero`,
  //   `fotos_plantas`). Hoy las fotos de eventos de vivero se suben al bucket
  //   `recoleccion_fotos`, namespaceadas por path `vivero/eventos/pendientes/...`.
  //   Esto mezcla almacenamiento entre módulos y dificulta políticas RLS por bucket.
  //   Sensible: cambiar este valor también requiere migrar las rutas existentes y
  //   actualizar `getPublicUrl` en TODOS los servicios que leen evidencias de vivero
  //   (vivero-embolsado, vivero-adaptabilidad, vivero-merma, vivero-timeline).
  private readonly bucketEvidencias = 'recoleccion_fotos';

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly evidenceFileService: EvidenceFileService,
  ) {}

  async crearPendienteParaEvento(
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[] = [],
    options: CrearPendienteViveroOptions = {},
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);
    this.validarFotos(files);
    const preparedFiles =
      this.evidenceFileService.prepareOriginalEvidenceFiles(files);

    const supabase = this.supabaseService.getClient();
    const tipoEntidadId = await this.resolveTipoEntidadEventoViveroId();
    const metadataPayload = this.parseMetadata(dto.metadata);
    const evento =
      dto.evento_tipo ?? options.eventoTipo ?? TipoEventoVivero.INICIO;
    const fotosSubidas: FotoSubidaVivero[] = [];
    const timestampBase = Date.now();

    try {
      for (const [index, prepared] of preparedFiles.entries()) {
        const file = files[index];
        const safeOriginalName = String(
          file.originalname || `evidencia_${index + 1}`,
        )
          .trim()
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const rutaStorage = [
          'vivero',
          'eventos',
          'pendientes',
          String(usuario.id),
          `${timestampBase}_${index}_${safeOriginalName}`,
        ].join('/');

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(this.bucketEvidencias)
          .upload(rutaStorage, prepared.originalBuffer, {
            contentType: prepared.storageContentType,
            upsert: false,
          });

        if (uploadError) {
          this.logger.error(
            'Error al subir evidencia pendiente de vivero:',
            uploadError,
          );
          throw new InternalServerErrorException(
            'Error al subir evidencia pendiente de vivero',
          );
        }

        const storageObjectId =
          typeof uploadData?.id === 'string' ? uploadData.id : null;

        fotosSubidas.push({
          ruta_archivo: rutaStorage,
          storage_object_id: storageObjectId,
          mime_type: prepared.storageContentType,
          tamano_bytes: prepared.tamanoBytes,
          hash_sha256: prepared.hashSha256,
          metadata: prepared.metadata,
        });
      }

      const tituloBase = dto.titulo?.trim() || null;
      const descripcion = dto.descripcion?.trim() || null;
      const evidenciasInsert = fotosSubidas.map((foto, index) => {
        const titulo = tituloBase
          ? fotosSubidas.length > 1
            ? `${tituloBase} ${index + 1}`
            : tituloBase
          : `Evidencia vivero ${index + 1}`;

        return {
          tipo_entidad_id: tipoEntidadId,
          entidad_id: 0,
          codigo_trazabilidad: null,
          bucket: this.bucketEvidencias,
          ruta_archivo: foto.ruta_archivo,
          storage_object_id: foto.storage_object_id,
          tipo_archivo: 'FOTO',
          mime_type: foto.mime_type,
          tamano_bytes: foto.tamano_bytes,
          hash_sha256: foto.hash_sha256,
          titulo,
          descripcion,
          metadata: {
            ...(metadataPayload || {}),
            origen: 'VIVERO_EVIDENCIA_PENDIENTE',
            evento,
            estado: 'PENDIENTE_VINCULACION',
            ...foto.metadata,
          },
          // Las pendientes comparten entidad_id=0; la principalidad aplica al vincularlas.
          es_principal: false,
          orden: index,
          tomado_en: dto.tomado_en ?? null,
          creado_por_usuario_id: usuario.id,
        };
      });

      const { data, error } = await supabase
        .from('evidencias_trazabilidad')
        .insert(evidenciasInsert)
        .select(
          `
          id,
          tipo_entidad_id,
          entidad_id,
          codigo_trazabilidad,
          bucket,
          ruta_archivo,
          storage_object_id,
          tipo_archivo,
          mime_type,
          tamano_bytes,
          hash_sha256,
          titulo,
          descripcion,
          metadata,
          es_principal,
          orden,
          tomado_en,
          creado_en,
          creado_por_usuario_id
        `,
        );

      if (error) {
        this.logger.error(
          'Error al registrar evidencias pendientes de vivero:',
          error,
        );
        throw new InternalServerErrorException(
          'Error al registrar evidencias pendientes de vivero',
        );
      }

      const evidencias = (data || []).map((evidencia: any) => {
        const { data: publicUrlData } = supabase.storage
          .from(evidencia.bucket)
          .getPublicUrl(evidencia.ruta_archivo);

        return {
          ...evidencia,
          public_url: publicUrlData.publicUrl,
        };
      });

      return {
        success: true,
        data: evidencias,
        evidencia_ids: evidencias.map((evidencia: any) => Number(evidencia.id)),
      };
    } catch (error) {
      if (fotosSubidas.length > 0) {
        await supabase.storage
          .from(this.bucketEvidencias)
          .remove(fotosSubidas.map((foto) => foto.ruta_archivo));
      }

      throw error;
    }
  }

  private async resolveTipoEntidadEventoViveroId(): Promise<number> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tipos_entidad_evidencia')
      .select('id, activo')
      .ilike('codigo', 'EVENTO_LOTE_VIVERO')
      .maybeSingle();

    if (error) {
      this.logger.error(
        'Error al resolver tipo_entidad_evidencia EVENTO_LOTE_VIVERO:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al resolver tipo de entidad de evidencia de vivero',
      );
    }

    if (!data || !data.activo) {
      throw new NotFoundException(
        'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO. Aplica la migracion 018.',
      );
    }

    return Number(data.id);
  }

  private validarFotos(files: ViveroEvidenceFileInput[]): void {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'Se requiere al menos 1 foto para registrar evidencia de vivero',
      );
    }

    if (files.length > 5) {
      throw new BadRequestException('Maximo 5 fotos permitidas');
    }

  }

  private parseMetadata(metadata?: string): Record<string, unknown> | null {
    if (!metadata || !metadata.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(metadata) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('metadata debe ser un objeto JSON');
      }

      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        'metadata debe ser un JSON valido serializado como texto',
      );
    }
  }
}
