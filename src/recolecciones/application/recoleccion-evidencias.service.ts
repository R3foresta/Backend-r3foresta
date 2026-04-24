import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  EvidenciaCompletitudPolicy,
  type RecoleccionFotoInput,
} from '../domain/policies/evidencia-completitud.policy';

export type FotoSubidaRecoleccion = {
  ruta_archivo: string;
  storage_object_id: string | null;
  mime_type: string;
  tamano_bytes: number;
  formato: string;
  hash_sha256: string | null;
};

@Injectable()
export class RecoleccionEvidenciasService {
  private readonly logger = new Logger(RecoleccionEvidenciasService.name);
  readonly bucketFotos = 'recoleccion_fotos';
  readonly tipoEntidadEvidenciaId = 1;

  constructor(private readonly supabaseService: SupabaseService) {}

  validarFotosCreacion(files: RecoleccionFotoInput[]): void {
    EvidenciaCompletitudPolicy.validarFotos(files, {
      minCount: 2,
      maxCount: 5,
      requireBuffer: true,
    });
  }

  validarDraftFotos(files: RecoleccionFotoInput[]): void {
    EvidenciaCompletitudPolicy.validarFotos(files, {
      maxCount: 5,
      requireBuffer: files.length > 0,
    });
  }

  async assertTipoEntidadActiva(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('tipos_entidad_evidencia')
      .select('id, activo')
      .eq('id', this.tipoEntidadEvidenciaId)
      .single();

    if (error || !data || !data.activo) {
      throw new NotFoundException(
        `No existe tipo_entidad_evidencia activo con id=${this.tipoEntidadEvidenciaId}`,
      );
    }
  }

  async uploadFotosCreacion(files: RecoleccionFotoInput[]) {
    const supabase = this.supabaseService.getClient();
    const fotosSubidas: FotoSubidaRecoleccion[] = [];

    for (const file of files) {
      const nombreArchivo = `${Date.now()}_${file.originalname}`;
      const rutaStorage = nombreArchivo;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(this.bucketFotos)
        .upload(rutaStorage, file.buffer!, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        this.logger.error('❌ Error al subir foto:', uploadError);
        throw new InternalServerErrorException('Error al subir foto');
      }

      const mimeType = String(file.mimetype ?? '');
      const formato = mimeType.split('/')[1].toUpperCase();
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

    return fotosSubidas;
  }

  async insertEvidenciasCreacion(params: {
    recoleccionId: number;
    codigoTrazabilidad: string | null;
    userId: number;
    fotosSubidas: FotoSubidaRecoleccion[];
  }): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const evidenciasInsert = params.fotosSubidas.map((foto, index) => ({
      tipo_entidad_id: this.tipoEntidadEvidenciaId,
      entidad_id: params.recoleccionId,
      codigo_trazabilidad: params.codigoTrazabilidad,
      bucket: this.bucketFotos,
      ruta_archivo: supabase.storage
        .from(this.bucketFotos)
        .getPublicUrl(foto.ruta_archivo).data.publicUrl,
      storage_object_id: foto.storage_object_id,
      tipo_archivo: 'FOTO',
      mime_type: foto.mime_type,
      tamano_bytes: foto.tamano_bytes,
      hash_sha256: foto.hash_sha256,
      titulo: `Foto ${index + 1}`,
      metadata: {
        origen: 'CREATE_RECOLECCION',
        formato: foto.formato,
      },
      es_principal: index === 0,
      orden: index,
      creado_por_usuario_id: params.userId,
    }));

    const { error } = await supabase
      .from('evidencias_trazabilidad')
      .insert(evidenciasInsert);

    if (error) {
      this.logger.error(
        '❌ Error al guardar evidencias de trazabilidad:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al guardar evidencias de trazabilidad',
      );
    }
  }

  async appendDraftFotosAsEvidencias(
    recoleccionId: number,
    codigoTrazabilidad: string,
    creadoPorUsuarioId: number,
    files: RecoleccionFotoInput[],
  ): Promise<{ insertedEvidenceIds: number[]; uploadedPaths: string[] }> {
    const supabase = this.supabaseService.getClient();

    const { count, error: countError } = await supabase
      .from('evidencias_trazabilidad')
      .select('id', { count: 'exact', head: true })
      .eq('tipo_entidad_id', this.tipoEntidadEvidenciaId)
      .eq('entidad_id', recoleccionId)
      .is('eliminado_en', null);

    if (countError) {
      this.logger.error(
        '❌ Error al contar evidencias previas del borrador:',
        countError,
      );
      throw new InternalServerErrorException(
        'Error al preparar el guardado de fotos del borrador',
      );
    }

    const uploadedPaths: string[] = [];
    const evidenciasInsert: Array<Record<string, unknown>> = [];
    const timestampBase = Date.now();
    const ordenInicial = Number(count || 0);

    for (const [index, file] of files.entries()) {
      const mimeType = String(file.mimetype ?? '').trim();
      const formato = mimeType.split('/')[1]!.toUpperCase();
      const safeOriginalName = String(file.originalname || `foto_${index + 1}`)
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const rutaStorage = `draft_${recoleccionId}_${timestampBase}_${index}_${safeOriginalName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(this.bucketFotos)
        .upload(rutaStorage, file.buffer!, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        this.logger.error('❌ Error al subir foto de borrador:', uploadError);
        throw new InternalServerErrorException(
          'Error al subir fotos del borrador',
        );
      }

      uploadedPaths.push(rutaStorage);

      const storageObjectId =
        typeof uploadData?.id === 'string' ? uploadData.id : null;
      const hashSha256 = createHash('sha256')
        .update(file.buffer!)
        .digest('hex');
      const orden = ordenInicial + index;

      evidenciasInsert.push({
        tipo_entidad_id: this.tipoEntidadEvidenciaId,
        entidad_id: recoleccionId,
        codigo_trazabilidad: codigoTrazabilidad,
        bucket: this.bucketFotos,
        ruta_archivo: supabase.storage
          .from(this.bucketFotos)
          .getPublicUrl(rutaStorage).data.publicUrl,
        storage_object_id: storageObjectId,
        tipo_archivo: 'FOTO',
        mime_type: mimeType,
        tamano_bytes: Number(file.size ?? 0),
        hash_sha256: hashSha256,
        titulo: `Foto ${orden + 1}`,
        metadata: {
          origen: 'UPDATE_DRAFT',
          formato,
        },
        es_principal: orden === 0,
        orden,
        creado_por_usuario_id: creadoPorUsuarioId,
      });
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('evidencias_trazabilidad')
      .insert(evidenciasInsert)
      .select('id');

    if (insertError) {
      this.logger.error(
        '❌ Error al registrar evidencias del borrador:',
        insertError,
      );
      throw new InternalServerErrorException(
        'Error al guardar fotos del borrador',
      );
    }

    const insertedEvidenceIds = (insertedData || [])
      .map((item: any) => Number(item.id))
      .filter((evidenceId) => Number.isInteger(evidenceId) && evidenceId > 0);

    return { insertedEvidenceIds, uploadedPaths };
  }

  async deleteEvidenceIds(insertedEvidenceIds: number[]): Promise<void> {
    if (insertedEvidenceIds.length === 0) {
      return;
    }

    await this.supabaseService
      .getClient()
      .from('evidencias_trazabilidad')
      .delete()
      .in('id', insertedEvidenceIds);
  }

  async deleteByRecoleccionId(recoleccionId: number): Promise<void> {
    await this.supabaseService
      .getClient()
      .from('evidencias_trazabilidad')
      .delete()
      .eq('tipo_entidad_id', this.tipoEntidadEvidenciaId)
      .eq('entidad_id', recoleccionId);
  }

  async removeStoragePaths(uploadedPaths: string[]): Promise<void> {
    if (uploadedPaths.length === 0) {
      return;
    }

    await this.supabaseService
      .getClient()
      .storage.from(this.bucketFotos)
      .remove(uploadedPaths);
  }

  async getEvidenciasByRecoleccionId(recoleccionId: number) {
    const evidenciasMap = await this.getEvidenciasMapByRecoleccionIds([
      recoleccionId,
    ]);
    return evidenciasMap.get(recoleccionId) || [];
  }

  async getEvidenciasMapByRecoleccionIds(recoleccionIds: number[]) {
    const supabase = this.supabaseService.getClient();
    const map = new Map<number, any[]>();
    const ids = Array.from(
      new Set(
        recoleccionIds.filter(
          (id) => Number.isInteger(id) && Number(id) > 0,
        ),
      ),
    );

    if (ids.length === 0) {
      return map;
    }

    const { data, error } = await supabase
      .from('evidencias_trazabilidad')
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
        actualizado_en
      `,
      )
      .eq('tipo_entidad_id', this.tipoEntidadEvidenciaId)
      .in('entidad_id', ids)
      .is('eliminado_en', null)
      .order('entidad_id', { ascending: true })
      .order('es_principal', { ascending: false })
      .order('orden', { ascending: true })
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      this.logger.error('❌ Error al obtener evidencias de recolecciones:', error);
      throw new InternalServerErrorException(
        'Error al obtener evidencias de recolecciones',
      );
    }

    for (const evidencia of data || []) {
      const recoleccionId = Number((evidencia as any).entidad_id);
      if (!map.has(recoleccionId)) {
        map.set(recoleccionId, []);
      }

      const rutaArchivo = String((evidencia as any).ruta_archivo ?? '');
      let publicUrl: string;
      if (rutaArchivo.startsWith('http')) {
        publicUrl = rutaArchivo;
      } else {
        const { data: publicUrlData } = supabase.storage
          .from((evidencia as any).bucket)
          .getPublicUrl(rutaArchivo);
        publicUrl = publicUrlData.publicUrl;
      }

      map.get(recoleccionId)!.push({
        ...(evidencia as any),
        public_url: publicUrl,
      });
    }

    return map;
  }
}
