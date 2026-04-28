import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
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
  formato: string;
  hash_sha256: string | null;
};

@Injectable()
export class ViveroEvidenciasService {
  private readonly logger = new Logger(ViveroEvidenciasService.name);
  private readonly bucketEvidencias = 'recoleccion_fotos';

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
  ) {}

  async crearPendienteParaEvento(
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[] = [],
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);
    this.validarFotos(files);

    const supabase = this.supabaseService.getClient();
    const tipoEntidadId = await this.resolveTipoEntidadEventoViveroId();
    const metadataPayload = this.parseMetadata(dto.metadata);
    const fotosSubidas: FotoSubidaVivero[] = [];
    const timestampBase = Date.now();

    try {
      for (const [index, file] of files.entries()) {
        const safeOriginalName = String(file.originalname || `evidencia_${index + 1}`)
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
          .upload(rutaStorage, file.buffer!, {
            contentType: String(file.mimetype ?? ''),
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

        const mimeType = String(file.mimetype ?? '');
        const formato = mimeType.split('/')[1]!.toUpperCase();
        const storageObjectId =
          typeof uploadData?.id === 'string' ? uploadData.id : null;
        const hashSha256 = file.buffer
          ? createHash('sha256').update(file.buffer).digest('hex')
          : null;

        fotosSubidas.push({
          ruta_archivo: rutaStorage,
          storage_object_id: storageObjectId,
          mime_type: mimeType,
          tamano_bytes: Number(file.size ?? 0),
          formato,
          hash_sha256: hashSha256,
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
            origen: 'VIVERO_EVENTO_PENDIENTE',
            estado: 'PENDIENTE_VINCULACION',
            formato: foto.formato,
          },
          es_principal: dto.es_principal === true ? index === 0 : index === 0,
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

    for (const file of files) {
      if (!Buffer.isBuffer(file.buffer)) {
        throw new BadRequestException(
          'No se pudieron procesar las fotos enviadas. Verifica multipart/form-data.',
        );
      }

      const mimeType = String(file.mimetype ?? '').trim().toLowerCase();
      const formato = mimeType.split('/')[1]?.toUpperCase();
      if (!formato || !['JPG', 'JPEG', 'PNG'].includes(formato)) {
        throw new BadRequestException(
          `Formato ${formato || 'DESCONOCIDO'} no permitido. Solo JPG, JPEG, PNG`,
        );
      }

      if (Number(file.size ?? 0) > 5242880) {
        throw new BadRequestException(
          `Archivo ${file.originalname || 'sin_nombre'} supera 5MB`,
        );
      }
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
