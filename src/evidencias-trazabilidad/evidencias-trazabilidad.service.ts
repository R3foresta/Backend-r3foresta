import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListEvidenciasTrazabilidadDto } from './dto/list-evidencias-trazabilidad.dto';

type TipoEntidadEvidencia = {
  id: number;
  codigo: string;
  descripcion: string | null;
};

type EvidenciaRow = {
  id: number;
  tipo_entidad_id: number;
  entidad_id: number;
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

@Injectable()
export class EvidenciasTrazabilidadService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(filters: ListEvidenciasTrazabilidadDto) {
    const supabase = this.supabaseService.getClient();

    const tipoEntidadId = await this.resolveTipoEntidadId(
      filters.tipo_entidad_id,
      filters.tipo_entidad_codigo,
    );

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    let query = supabase
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
      .order('es_principal', { ascending: false })
      .order('orden', { ascending: true })
      .order('creado_en', { ascending: false });

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
      query = query.eq('tipo_archivo', filters.tipo_archivo.trim().toUpperCase());
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

    const evidencias = (data || []).map((row) =>
      this.mapEvidencia(row as EvidenciaRow),
    );
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

  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

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

    if (error || !data) {
      throw new NotFoundException('Evidencia de trazabilidad no encontrada');
    }

    return {
      success: true,
      data: this.mapEvidencia(data as EvidenciaRow),
    };
  }

  async findByEntidad(
    tipoEntidadCodigo: string,
    entidadId: number,
    includeDeleted = false,
  ) {
    const baseFilters = new ListEvidenciasTrazabilidadDto();
    baseFilters.tipo_entidad_codigo = tipoEntidadCodigo;
    baseFilters.entidad_id = entidadId;
    baseFilters.incluir_eliminadas = includeDeleted;
    baseFilters.limit = 100;
    baseFilters.page = 1;

    return this.list(baseFilters);
  }

  async findByRecoleccion(recoleccionId: number, includeDeleted = false) {
    return this.findByEntidad('RECOLECCION', recoleccionId, includeDeleted);
  }

  private async resolveTipoEntidadId(
    tipoEntidadId?: number,
    tipoEntidadCodigo?: string,
  ): Promise<number | undefined> {
    const supabase = this.supabaseService.getClient();

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
    const supabase = this.supabaseService.getClient();
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

  private normalizeRelation<T>(value?: T | T[] | null): T | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }
}
