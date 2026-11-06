import { ViveroAuthService } from '../lotes-vivero/application/vivero-auth.service';
import type { VerifiedActor } from '../auth/verified-actor.guard';
import { RecoleccionAuthService } from '../recolecciones/application/recoleccion-auth.service';
import { guardarRecoleccion } from '../recolecciones/application/recoleccion-rpc';
import {
  BadRequestException,
  Injectable,
  HttpException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEvidenciaRecoleccionDto } from './dto/create-evidencia-recoleccion.dto';
import { ListEvidenciasTrazabilidadDto } from './dto/list-evidencias-trazabilidad.dto';

type TipoEntidadEvidencia = {
  id: number;
  codigo: string;
  descripcion: string | null;
};

type EvidenciaRow = {
  id: number;
  tipo_entidad_id: number;
  entidad_id: number | string;
  codigo_trazabilidad: string | null;
  bucket: string;
  ruta_archivo: string;
  storage_object_id: string | null;
  tipo_archivo: string;
  mime_type: string;
  tamano_bytes: number | null;
  hash_sha256: string | null;
  titulo: string | null;
  descripcion: string | null;
  metadata: Record<string, unknown> | null;
  es_principal: boolean;
  orden: number;
  tomado_en: string | null;
  creado_en: string;
  actualizado_en: string;
  eliminado_en: string | null;
  creado_por_usuario_id: number;
  actualizado_por_usuario_id: number | null;
  eliminado_por_usuario_id: number | null;
  tipo_entidad?:
    | {
        id: number;
        codigo: string;
        descripcion: string | null;
      }
    | Array<{
        id: number;
        codigo: string;
        descripcion: string | null;
      }>
    | null;
  creado_por?:
    | {
        id: number;
        nombre: string;
      }
    | Array<{
        id: number;
        nombre: string;
      }>
    | null;
  actualizado_por?:
    | {
        id: number;
        nombre: string;
      }
    | Array<{
        id: number;
        nombre: string;
      }>
    | null;
  eliminado_por?:
    | {
        id: number;
        nombre: string;
      }
    | Array<{
        id: number;
        nombre: string;
      }>
    | null;
};

const RESERVED_EVIDENCE_METADATA_KEYS = new Set([
  'origen',
  'nombre_original',
  'mime_type_recibido',
  'mime_type_resuelto',
  'formato_original',
  'hash_algoritmo',
  'archivo_original_preservado',
]);

@Injectable()
export class EvidenciasTrazabilidadService {
  private readonly logger = new Logger(EvidenciasTrazabilidadService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly evidenceFileService: EvidenceFileService,
    private readonly recoleccionAuth: RecoleccionAuthService,
    private readonly viveroAuth: ViveroAuthService,
  ) {}

  async createForRecoleccion(
    recoleccionId: number | string,
    payload: CreateEvidenciaRecoleccionDto,
    authId: string,
    files?: any[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'Se requiere al menos 1 foto para registrar evidencia',
      );
    }

    if (files.length > 5) {
      throw new BadRequestException('Máximo 5 fotos permitidas por solicitud');
    }

    const preparedFiles =
      this.evidenceFileService.prepareOriginalEvidenceFiles(files);

    const supabase = this.supabaseService.getAdminClient();
    const metadataPayload = this.parseMetadata(payload.metadata);
    const bucketFotos = 'recoleccion_fotos';

    const usuario = await this.recoleccionAuth.getUserByAuthId(authId);
    const userId = usuario.id;

    const { data: recoleccionData, error: recoleccionError } = await supabase
      .from('recoleccion')
      .select(
        'id, codigo_trazabilidad, usuario_id::text, estado_registro, revision_captura',
      )
      .is('eliminado_en', null)
      .eq('id', recoleccionId)
      .single();

    if (recoleccionError || !recoleccionData) {
      throw new NotFoundException(
        `Recolección con id ${recoleccionId} no encontrada`,
      );
    }

    await this.recoleccionAuth.assertOwnerOrAdmin(
      recoleccionData,
      userId,
      usuario.rol,
    );
    if (
      !['BORRADOR', 'RECHAZADO'].includes(
        String(recoleccionData.estado_registro),
      )
    ) {
      throw new BadRequestException(
        'Solo se agregan fotos a BORRADOR o RECHAZADO.',
      );
    }

    const { data: tipoEntidadData, error: tipoEntidadError } = await supabase
      .from('tipos_entidad_evidencia')
      .select('id, activo')
      .ilike('codigo', 'RECOLECCION')
      .maybeSingle();

    if (tipoEntidadError) {
      this.logger.error(
        '❌ Error al resolver tipo_entidad_evidencia RECOLECCION:',
        tipoEntidadError,
      );
      throw new InternalServerErrorException(
        'Error al resolver tipo de entidad de evidencia',
      );
    }

    if (!tipoEntidadData || !tipoEntidadData.activo) {
      throw new NotFoundException(
        'No existe un tipo_entidad_evidencia activo para RECOLECCION',
      );
    }

    const tipoEntidadId = Number(tipoEntidadData.id);

    const { data: existentes, error: existentesError } = await supabase
      .from('evidencias_trazabilidad')
      .select('id, orden, es_principal')
      .eq('tipo_entidad_id', tipoEntidadId)
      .eq('entidad_id', recoleccionId)
      .is('eliminado_en', null)
      .order('orden', { ascending: false });

    if (existentesError) {
      this.logger.error(
        '❌ Error al consultar evidencias existentes:',
        existentesError,
      );
      throw new InternalServerErrorException(
        'Error al consultar evidencias existentes',
      );
    }

    const maxOrden = Math.max(
      -1,
      ...(existentes || []).map((item) => Number(item.orden ?? -1)),
    );
    const yaTienePrincipal = (existentes || []).some((item) =>
      Boolean(item.es_principal),
    );

    const fotosSubidas: Array<{
      ruta_archivo: string;
      storage_object_id: string | null;
      mime_type: string;
      tamano_bytes: number;
      hash_sha256: string;
      metadata: Record<string, unknown>;
    }> = [];
    let puedeCompensarSubidas = true;
    let escrituraConfirmada = false;

    try {
      for (const [index, prepared] of preparedFiles.entries()) {
        const file = files[index];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const sanitizedOriginalName = String(file.originalname || 'evidencia')
          .replace(/\s+/g, '_')
          .replace(/[^\w.-]/g, '');
        const nombreArchivo = `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}_${sanitizedOriginalName}`;
        const rutaStorage = nombreArchivo;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketFotos)
          .upload(rutaStorage, prepared.originalBuffer, {
            contentType: prepared.storageContentType,
            upsert: false,
          });

        if (uploadError) {
          this.logger.error(
            '❌ Error al subir evidencia a storage:',
            uploadError,
          );
          throw new InternalServerErrorException('Error al subir evidencias');
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

      const tituloBase = payload.titulo?.trim() || null;
      const descripcion = payload.descripcion?.trim() || null;
      const clientMetadata = this.filterReservedMetadata(metadataPayload);
      const forzarPrincipal = payload.es_principal === true;

      const evidenciasInsert = fotosSubidas.map((foto, index) => {
        const orden = maxOrden + index + 1;
        const esPrincipal = forzarPrincipal
          ? index === 0
          : !yaTienePrincipal && index === 0;

        const titulo = tituloBase
          ? fotosSubidas.length > 1
            ? `${tituloBase} ${index + 1}`
            : tituloBase
          : `Foto ${orden + 1}`;

        return {
          tipo_entidad_id: tipoEntidadId,
          entidad_id: recoleccionId,
          codigo_trazabilidad: recoleccionData.codigo_trazabilidad,
          bucket: bucketFotos,
          ruta_archivo: foto.ruta_archivo,
          storage_object_id: foto.storage_object_id,
          tipo_archivo: 'FOTO',
          mime_type: foto.mime_type,
          tamano_bytes: foto.tamano_bytes,
          hash_sha256: foto.hash_sha256,
          titulo,
          descripcion,
          metadata: {
            ...clientMetadata,
            origen: 'POST_EVIDENCIAS_RECOLECCION',
            ...foto.metadata,
          },
          es_principal: esPrincipal,
          orden,
          tomado_en: payload.tomado_en ?? null,
          creado_por_usuario_id: userId,
        };
      });

      puedeCompensarSubidas = false;
      const guardado = await guardarRecoleccion(
        supabase,
        userId,
        'FOTOS',
        recoleccionId,
        recoleccionData.revision_captura,
        {},
        evidenciasInsert,
      );
      escrituraConfirmada = true;
      const { data: inserted, error: lecturaError } = await supabase
        .from('evidencias_trazabilidad')
        .select('*')
        .in('id', guardado.evidencia_ids);
      if (lecturaError)
        throw new InternalServerErrorException(
          'Fotos guardadas; no se pudo recuperar su detalle.',
        );

      return {
        success: true,
        data: (inserted || []).map((row) =>
          this.mapEvidencia(row as EvidenciaRow),
        ),
      };
    } catch (error) {
      const rechazo =
        error instanceof HttpException &&
        [400, 403, 404, 409].includes(error.getStatus());
      if (
        !escrituraConfirmada &&
        (puedeCompensarSubidas || rechazo) &&
        fotosSubidas.length > 0
      ) {
        await supabase.storage
          .from(bucketFotos)
          .remove(fotosSubidas.map((foto) => foto.ruta_archivo));
      }

      throw error;
    }
  }

  async list(filters: ListEvidenciasTrazabilidadDto, actor: VerifiedActor) {
    const supabase = this.supabaseService.getAdminClient();

    const tipoEntidadId = await this.resolveTipoEntidadId(
      filters.tipo_entidad_id,
      filters.tipo_entidad_codigo,
    );

    const m1Tipo = await this.resolveTipoEntidadId(undefined, 'RECOLECCION');
    const eventoTipo = await this.resolveTipoEntidadId(
      undefined,
      'EVENTO_LOTE_VIVERO',
    );
    const loteTipo = await this.resolveTipoEntidadId(undefined, 'LOTE_VIVERO');
    const usuario = await this.recoleccionAuth.getUserByAuthId(actor.auth_id);
    const revisor = this.recoleccionAuth.isGlobalReviewer(usuario.rol);
    if (tipoEntidadId === m1Tipo && !revisor) {
      if (!filters.entidad_id)
        throw new ForbiddenException(
          'Para consultar fotos M1 indique la recolección propia.',
        );
      await this.assertM1Read(filters.entidad_id, actor);
    }
    if (tipoEntidadId && [eventoTipo, loteTipo].includes(tipoEntidadId)) {
      if (!filters.entidad_id) {
        if (!revisor)
          throw new ForbiddenException(
            'Indique el evento o lote autorizado para consultar fotos M2.',
          );
      } else {
        const user = await this.viveroAuth.getUserByAuthId(actor.auth_id);
        if (tipoEntidadId === eventoTipo)
          await this.viveroAuth.assertEvento(user, filters.entidad_id);
        else await this.viveroAuth.assertLote(user, filters.entidad_id);
      }
    }
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('evidencias_trazabilidad')
      .select(
        `
        id,
        tipo_entidad_id,
        entidad_id::text,
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
        actualizado_en,
        eliminado_en,
        creado_por_usuario_id,
        actualizado_por_usuario_id,
        eliminado_por_usuario_id,
        tipo_entidad:tipo_entidad_id (id, codigo, descripcion),
        creado_por:creado_por_usuario_id (id, nombre),
        actualizado_por:actualizado_por_usuario_id (id, nombre),
        eliminado_por:eliminado_por_usuario_id (id, nombre)
      `,
        { count: 'exact' },
      )
      // Las cargas v1 tienen su propia audiencia y proyección sanitizada.
      .neq('bucket', 'participacion_evidencias')
      .not('ruta_archivo', 'like', 'plantaciones/registros/pendientes/%')
      .gt('entidad_id', 0)
      .order('es_principal', { ascending: false })
      .order('orden', { ascending: true })
      .order('creado_en', { ascending: false });

    // La búsqueda genérica no concede lectura global M1; filtrar antes de contar/paginar.
    if (!revisor && tipoEntidadId !== m1Tipo)
      query = query.neq('tipo_entidad_id', m1Tipo);
    if (!revisor) {
      if (eventoTipo && tipoEntidadId !== eventoTipo)
        query = query.neq('tipo_entidad_id', eventoTipo);
      if (loteTipo && tipoEntidadId !== loteTipo)
        query = query.neq('tipo_entidad_id', loteTipo);
    }
    if (!filters.incluir_eliminadas) {
      query = query.is('eliminado_en', null);
    }

    if (tipoEntidadId !== undefined) {
      query = query.eq('tipo_entidad_id', tipoEntidadId);
    }

    if (filters.entidad_id !== undefined) {
      query = query.eq('entidad_id', filters.entidad_id);
    }

    if (filters.codigo_trazabilidad) {
      query = query.ilike(
        'codigo_trazabilidad',
        `%${filters.codigo_trazabilidad.trim()}%`,
      );
    }

    if (filters.tipo_archivo) {
      query = query.eq(
        'tipo_archivo',
        filters.tipo_archivo.trim().toUpperCase(),
      );
    }

    if (filters.es_principal !== undefined) {
      query = query.eq('es_principal', filters.es_principal);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error al listar evidencias_trazabilidad:', error);
      throw new InternalServerErrorException(
        'Error al listar evidencias de trazabilidad',
      );
    }

    const evidencias = (data || [])
      .filter((row) => {
        const evidence = row as EvidenciaRow;
        return (
          evidence.bucket !== 'participacion_evidencias' &&
          Boolean(evidence.entidad_id) &&
          !evidence.ruta_archivo?.startsWith(
            'plantaciones/registros/pendientes/',
          )
        );
      })
      .map((row) => this.mapEvidencia(row as EvidenciaRow));
    const total = count || 0;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      success: true,
      data: evidencias,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1 && totalPages > 0,
      },
    };
  }

  async findOne(id: number | string, actor: VerifiedActor) {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('evidencias_trazabilidad')
      .select(
        `
        id,
        tipo_entidad_id,
        entidad_id::text,
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
        actualizado_en,
        eliminado_en,
        creado_por_usuario_id,
        actualizado_por_usuario_id,
        eliminado_por_usuario_id,
        tipo_entidad:tipo_entidad_id (id, codigo, descripcion),
        creado_por:creado_por_usuario_id (id, nombre),
        actualizado_por:actualizado_por_usuario_id (id, nombre),
        eliminado_por:eliminado_por_usuario_id (id, nombre)
      `,
      )
      .eq('id', id)
      .single();

    if (
      error ||
      !data ||
      (data as EvidenciaRow).bucket === 'participacion_evidencias' ||
      (data as EvidenciaRow).ruta_archivo?.startsWith(
        'plantaciones/registros/pendientes/',
      ) ||
      BigInt((data as EvidenciaRow).entidad_id ?? 0) <= 0n
    ) {
      throw new NotFoundException('Evidencia de trazabilidad no encontrada');
    }

    const row = data as EvidenciaRow;
    const tipo = await this.resolveTipoEntidadId(undefined, 'RECOLECCION');
    if (row.tipo_entidad_id === tipo)
      await this.assertM1Read(row.entidad_id, actor);
    const relation = Array.isArray(row.tipo_entidad)
      ? row.tipo_entidad[0]
      : row.tipo_entidad;
    if (
      ['EVENTO_LOTE_VIVERO', 'LOTE_VIVERO'].includes(
        String(relation?.codigo).toUpperCase(),
      )
    ) {
      const user = await this.viveroAuth.getUserByAuthId(actor.auth_id);
      if (String(relation?.codigo).toUpperCase() === 'EVENTO_LOTE_VIVERO')
        await this.viveroAuth.assertEvento(user, row.entidad_id);
      else await this.viveroAuth.assertLote(user, row.entidad_id);
    }

    return {
      success: true,
      data: this.mapEvidencia(data as EvidenciaRow),
    };
  }

  async findByEntidad(
    tipoEntidadCodigo: string,
    entidadId: number | string,
    includeDeleted = false,
    actor: VerifiedActor,
  ) {
    const baseFilters = new ListEvidenciasTrazabilidadDto();
    baseFilters.tipo_entidad_codigo = tipoEntidadCodigo;
    baseFilters.entidad_id = entidadId;
    baseFilters.incluir_eliminadas = includeDeleted;
    baseFilters.limit = 100;
    baseFilters.page = 1;

    return this.list(baseFilters, actor);
  }

  async findByRecoleccion(
    recoleccionId: number | string,
    includeDeleted = false,
    actor: VerifiedActor,
  ) {
    await this.assertM1Read(recoleccionId, actor);
    return this.findByEntidad(
      'RECOLECCION',
      recoleccionId,
      includeDeleted,
      actor,
    );
  }

  private async assertM1Read(
    recoleccionId: number | string,
    actor: VerifiedActor,
  ) {
    const usuario = await this.recoleccionAuth.getUserByAuthId(actor.auth_id);
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('recoleccion')
      .select('id,usuario_id::text,vivero_id::text')
      .eq('id', recoleccionId)
      .is('eliminado_en', null)
      .maybeSingle();
    if (error || !data)
      throw new NotFoundException('Recolección no encontrada.');
    await this.recoleccionAuth.assertCanRead(data, usuario.id, usuario.rol);
  }

  private async resolveTipoEntidadId(
    tipoEntidadId?: number,
    tipoEntidadCodigo?: string,
  ): Promise<number | undefined> {
    const supabase = this.supabaseService.getAdminClient();

    let resolvedByCode: number | undefined;

    if (tipoEntidadCodigo) {
      const code = tipoEntidadCodigo.trim().toUpperCase();
      const { data, error } = await supabase
        .from('tipos_entidad_evidencia')
        .select('id, codigo, descripcion')
        .ilike('codigo', code)
        .maybeSingle();

      if (error) {
        console.error('❌ Error al resolver tipo_entidad_codigo:', error);
        throw new InternalServerErrorException(
          'Error al resolver tipo de entidad de evidencia',
        );
      }

      if (!data) {
        throw new NotFoundException(
          `No existe tipo_entidad_evidencia con código ${code}`,
        );
      }

      resolvedByCode = Number((data as TipoEntidadEvidencia).id);
    }

    if (tipoEntidadId !== undefined && resolvedByCode !== undefined) {
      if (Number(tipoEntidadId) !== Number(resolvedByCode)) {
        throw new BadRequestException(
          'tipo_entidad_id y tipo_entidad_codigo no corresponden al mismo registro',
        );
      }
    }

    if (tipoEntidadId !== undefined) {
      return Number(tipoEntidadId);
    }

    return resolvedByCode;
  }

  private mapEvidencia(row: EvidenciaRow) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: publicUrlData } = supabase.storage
      .from(row.bucket)
      .getPublicUrl(row.ruta_archivo);

    const tipoEntidad = this.normalizeRelation(row.tipo_entidad);
    const creadoPor = this.normalizeRelation(row.creado_por);
    const actualizadoPor = this.normalizeRelation(row.actualizado_por);
    const eliminadoPor = this.normalizeRelation(row.eliminado_por);

    return {
      id: row.id,
      tipo_entidad_id: row.tipo_entidad_id,
      entidad_id: row.entidad_id,
      codigo_trazabilidad: row.codigo_trazabilidad,
      bucket: row.bucket,
      ruta_archivo: row.ruta_archivo,
      storage_object_id: row.storage_object_id,
      tipo_archivo: row.tipo_archivo,
      mime_type: row.mime_type,
      tamano_bytes: row.tamano_bytes,
      hash_sha256: row.hash_sha256,
      titulo: row.titulo,
      descripcion: row.descripcion,
      metadata: row.metadata ?? {},
      es_principal: row.es_principal,
      orden: row.orden,
      tomado_en: row.tomado_en,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
      eliminado_en: row.eliminado_en,
      creado_por_usuario_id: row.creado_por_usuario_id,
      actualizado_por_usuario_id: row.actualizado_por_usuario_id,
      eliminado_por_usuario_id: row.eliminado_por_usuario_id,
      public_url: publicUrlData.publicUrl,
      tipo_entidad: tipoEntidad,
      creado_por: creadoPor,
      actualizado_por: actualizadoPor,
      eliminado_por: eliminadoPor,
    };
  }

  private parseMetadata(metadataRaw?: string): Record<string, unknown> | null {
    if (!metadataRaw || !metadataRaw.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(metadataRaw) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('metadata debe ser un objeto JSON');
      }

      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new BadRequestException(
        'metadata debe ser un JSON válido serializado en texto',
      );
    }
  }

  private filterReservedMetadata(
    metadata: Record<string, unknown> | null,
  ): Record<string, unknown> {
    if (!metadata) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(metadata).filter(
        ([key]) => !RESERVED_EVIDENCE_METADATA_KEYS.has(key),
      ),
    );
  }

  private normalizeRelation<T>(value?: T | T[] | null): T | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }
}
