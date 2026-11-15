import {
  BadRequestException,
  HttpException,
  ForbiddenException,
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
import { compatibleId, exactId } from '../../common/dto/bigint-id';
import { randomUUID } from 'crypto';

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
  loteId?: number | string;
  solicitudId?: string;
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
    const evento =
      options.eventoTipo ?? dto.evento_tipo ?? TipoEventoVivero.INICIO;
    const incorporacion = evento === TipoEventoVivero.INCORPORACION;
    // Autoridad actual de DB antes de preparar archivos o consultar/subir Storage.
    // La RPC vuelve a verificarla bajo el lock de cuenta frente a rol/baja.
    if (incorporacion && usuario.rol !== 'ADMIN')
      throw new ForbiddenException('CAPACIDAD_INSUFICIENTE: incorporación exclusiva ADMIN global');
    const viveroId = options.loteId
      ? await this.authService.assertLote(usuario, options.loteId)
      : dto.vivero_id;
    if (!viveroId)
      throw new BadRequestException(
        'vivero_id es obligatorio para la carga previa a INICIO.',
      );
    await this.authService.assertVivero(usuario, viveroId);
    const solicitudId = options.solicitudId?.toLowerCase();
    if (incorporacion && (!options.solicitudId || options.loteId))
      throw new BadRequestException('INCORPORACION requiere solicitud previa sin lote.');
    if (evento !== TipoEventoVivero.INICIO && !incorporacion && !options.loteId)
      throw new BadRequestException('Para un evento use la ruta del lote.');
    this.validarFotos(files);
    const preparedFiles =
      this.evidenceFileService.prepareOriginalEvidenceFiles(files);

    const supabase = this.supabaseService.getAdminClient();
    const bucket = incorporacion ? 'vivero_incorporaciones' : this.bucketEvidencias;
    if (incorporacion) {
      const { data: config, error: bucketError } = await supabase.storage.getBucket(bucket);
      if (bucketError || config?.id !== bucket || config.public !== false)
        throw new InternalServerErrorException('El bucket privado de incorporaciones no está configurado.');
    }
    const tipoEntidadId = await this.resolveTipoEntidadEventoViveroId();
    const metadataPayload = this.parseMetadata(dto.metadata);
    const fotosSubidas: FotoSubidaVivero[] = [];
    let resultadoIncierto = false;
    const timestampBase = Date.now();

    try {
      for (const [index, prepared] of preparedFiles.entries()) {
        const file = files[index];
        const safeOriginalName = String(
          file.originalname || `evidencia_${index + 1}`,
        )
          .trim()
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const rutaStorage = incorporacion
          ? `vivero/incorporaciones/${usuario.id}/${solicitudId}/${randomUUID()}_${safeOriginalName}`
          : [
          'vivero',
          'eventos',
          'pendientes',
          String(usuario.id),
          `${timestampBase}_${index}_${safeOriginalName}`,
        ].join('/');

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
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
          bucket,
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

      // Una excepción de transporte también puede llegar después del commit.
      resultadoIncierto = true;
      const { data: ids, error: persistError } = await supabase.rpc(
        incorporacion ? 'm2_incorporacion_evidencias_preparar' : 'm2_evidencias_preparar',
        incorporacion ? {
          p_actor_id: usuario.id, p_vivero_id: viveroId,
          p_solicitud_id: solicitudId, p_fotos: evidenciasInsert,
        } : {
          p_actor_id: usuario.id,
          p_vivero_id: viveroId,
          p_lote_id: options.loteId ?? null,
          p_evento: evento,
          p_fotos: evidenciasInsert,
        },
      );
      if (persistError) {
        if (['42501', 'PT403'].includes(persistError.code)) {
          resultadoIncierto = false;
          throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
        }
        if (['22023', 'P0001', 'P0002', '23503', '23505', '23514'].includes(persistError.code)) {
          resultadoIncierto = false;
          throw new BadRequestException(persistError.message);
        }
        resultadoIncierto = true;
        throw new HttpException(
          'RESULTADO_NO_DETERMINADO: conserve las referencias de la carga.',
          503,
        );
      }
      resultadoIncierto = true; // El commit puede existir aunque falle la lectura posterior.
      if (!Array.isArray(ids) || ids.length !== fotosSubidas.length)
        throw new HttpException('RESULTADO_NO_DETERMINADO', 503);
      const { data, error } = await supabase
        .from('evidencias_trazabilidad')
        .select('id::text,entidad_id::text,creado_por_usuario_id::text,tipo_entidad_id,codigo_trazabilidad,storage_object_id,bucket,ruta_archivo,tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_en')
        .in('id', ids);
      if (error || !data)
        throw new HttpException('RESULTADO_NO_DETERMINADO', 503);
      const evidencias = await Promise.all((data || []).map(async (evidencia: any) => {
        if (incorporacion) {
          const { data: signed, error: signError } = await supabase.storage
            .from(bucket).createSignedUrl(evidencia.ruta_archivo, 300);
          if (signError || !signed?.signedUrl) throw new HttpException('RESULTADO_NO_DETERMINADO', 503);
          return { ...evidencia, id: exactId(evidencia.id), signed_url: signed.signedUrl, url_expira_en_segundos: 300 };
        }
        const { data: publicUrlData } = supabase.storage
          .from(evidencia.bucket)
          .getPublicUrl(evidencia.ruta_archivo);

        return {
          ...evidencia,
          id: compatibleId(evidencia.id),
          public_url: publicUrlData.publicUrl,
        };
      }));

      return {
        success: true,
        data: evidencias,
        evidencia_ids: evidencias.map((evidencia: any) => incorporacion ? exactId(evidencia.id) : compatibleId(evidencia.id)),
      };
    } catch (error) {
      if (!resultadoIncierto && fotosSubidas.length > 0) {
        await supabase.storage
          .from(bucket)
          .remove(fotosSubidas.map((foto) => foto.ruta_archivo));
      }
      if (resultadoIncierto && !(error instanceof HttpException))
        throw new HttpException('RESULTADO_NO_DETERMINADO: conserve solicitud, intención y referencias de la carga.', 503);
      throw error;
    }
  }

  private async resolveTipoEntidadEventoViveroId(): Promise<number> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
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

  async recuperarPendientesIncorporacion(actorId: string, viveroId: string, solicitudId: string) {
    const supabase = this.supabaseService.getAdminClient();
    let resultado;
    try {
      resultado = await supabase.rpc('m2_incorporacion_evidencias_leer', {
        p_actor_id: actorId, p_vivero_id: viveroId, p_solicitud_id: solicitudId,
      });
    } catch { throw new HttpException('RESULTADO_NO_DETERMINADO', 503); }
    if (['42501', 'PT403'].includes(resultado.error?.code ?? '')) throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
    if (resultado.error || !Array.isArray(resultado.data)) throw new HttpException('RESULTADO_NO_DETERMINADO', 503);
    const evidencias = await Promise.all(resultado.data.map(async (ev: any) => {
      if (ev.bucket !== 'vivero_incorporaciones') throw new HttpException('CONTEXTO_INCOMPATIBLE', 503);
      const { data, error } = await supabase.storage.from(ev.bucket).createSignedUrl(ev.ruta_archivo, 300);
      if (error || !data?.signedUrl) throw new HttpException('RESULTADO_NO_DETERMINADO', 503);
      return { ...ev, id: exactId(ev.id), signed_url: data.signedUrl, url_expira_en_segundos: 300 };
    }));
    return { success: true, data: evidencias, evidencia_ids: evidencias.map((e) => e.id) };
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
