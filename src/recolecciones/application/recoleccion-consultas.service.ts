import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';
import { FiltersRecoleccionDto } from '../api/dto/filters-recoleccion.dto';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';
import { RecoleccionAuthService } from './recoleccion-auth.service';
import { RecoleccionElegibilidadService } from './recoleccion-elegibilidad.service';
import { RecoleccionEvidenciasService } from './recoleccion-evidencias.service';
import { RecoleccionUbicacionService } from './recoleccion-ubicacion.service';
import { mapRecoleccionToCanonicalResponse } from './mappers/recoleccion-response.mapper';

type StockPlantRow = {
  id: number;
  especie: string;
  nombre_cientifico: string | null;
  variedad: string | null;
  nombre_comun_principal: string | null;
  imagen_url: string | null;
};

type StockRecoleccionRow = {
  planta_id: number | null;
  unidad_canonica: string | null;
  saldo_actual: number | null;
  estado_registro: string | null;
};

@Injectable()
export class RecoleccionConsultasService {
  private readonly logger = new Logger(RecoleccionConsultasService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
    private readonly ubicacionService: RecoleccionUbicacionService,
    private readonly evidenciasService: RecoleccionEvidenciasService,
    private readonly elegibilidadService: RecoleccionElegibilidadService,
  ) {}

  async getRawRecoleccion(id: number) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('recoleccion')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Recolección con id ${id} no encontrada`);
    }

    return data;
  }

  async findPendingValidation(
    filters: FiltersRecoleccionDto,
    authId: string,
    userRole: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;
    const usuario = await this.authService.getUserByAuthId(authId);
    const esRolGlobal = this.authService.isGlobalReviewer(usuario.rol);

    let query = supabase
      .from('recoleccion')
      .select(this.getCanonicalRecoleccionSelect(), { count: 'exact' })
      .eq('estado_registro', EstadoRegistro.PENDIENTE_VALIDACION);

    if (!esRolGlobal) {
      query = query.eq('usuario_id', usuario.id);
    }

    query = this.applyCommonListFilters(query, filters);
    const searchTerm = filters.search ?? filters.q;
    const normalizedSearch = searchTerm?.trim();
    if (normalizedSearch) {
      const orConditions =
        await this.buildRecoleccionSearchOrConditions(normalizedSearch);
      query = query.or(orConditions.join(','));
    }
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('❌ Error al obtener recolecciones pendientes:', error);
      throw new InternalServerErrorException(
        'Error al obtener recolecciones pendientes de validación',
      );
    }

    return this.buildPaginatedResponse(
      data || [],
      count || 0,
      page,
      limit,
      filters,
    );
  }

  async findAll(authId: string, filters: FiltersRecoleccionDto) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('recoleccion')
      .select(this.getCanonicalRecoleccionSelect(), { count: 'exact' })
      .eq('usuario_id', usuario.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.fecha_inicio) {
      query = query.gte('fecha', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      query = query.lte('fecha', filters.fecha_fin);
    }

    if (filters.vivero_id) {
      query = query.eq('vivero_id', filters.vivero_id);
    }

    if (filters.tipo_material) {
      query = query.eq('tipo_material', filters.tipo_material);
    }

    const searchTerm = filters.search ?? filters.q;
    const normalizedSearch = searchTerm?.trim();
    if (normalizedSearch) {
      const orConditions =
        await this.buildRecoleccionSearchOrConditions(normalizedSearch);
      query = query.or(orConditions.join(','));
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('❌ Error al obtener recolecciones:', error);
      throw new InternalServerErrorException('Error al obtener recolecciones');
    }

    return this.buildPaginatedResponse(
      data || [],
      count || 0,
      page,
      limit,
      filters,
    );
  }

  async findStockSummary(authId: string) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdminRole(usuario.rol);

    const recoleccionesPromise = this.fetchStockRows(supabase);
    const [plantasResponse, recoleccionesResponse] = await Promise.all([
      supabase
        .from('planta')
        .select(
          'id, especie, nombre_cientifico, variedad, nombre_comun_principal, imagen_url',
        )
        .eq('activo', true)
        .order('especie', { ascending: true }),
      recoleccionesPromise,
    ]);

    const plantas = (plantasResponse.data ?? []) as unknown as StockPlantRow[];
    const recolecciones = recoleccionesResponse.data ?? [];
    const plantasError = plantasResponse.error;
    const recoleccionesError = recoleccionesResponse.error;

    if (plantasError) {
      this.logger.error(
        '❌ Error al obtener plantas activas para el resumen de stock:',
        plantasError,
      );
      throw new InternalServerErrorException(
        'Error al obtener plantas activas para el resumen de stock',
      );
    }

    if (recoleccionesError) {
      this.logger.error(
        '❌ Error al obtener saldos de recolecciones para el resumen de stock:',
        recoleccionesError,
      );
      throw new InternalServerErrorException(
        'Error al obtener saldos de recolecciones para el resumen de stock',
      );
    }

    const stockByPlant = new Map<
      number,
      {
        gramos_disponibles: number;
        unidades_disponibles: number;
        pendientes_validacion: number;
      }
    >();

    for (const row of recolecciones ?? []) {
      const plantaId = Number(row.planta_id);
      const saldo = Number(row.saldo_actual);
      const unidad = String(row.unidad_canonica ?? '').toUpperCase();
      const estadoRegistro = String(row.estado_registro ?? '').toUpperCase();

      if (!Number.isFinite(plantaId)) {
        continue;
      }

      const current = stockByPlant.get(plantaId) ?? {
        gramos_disponibles: 0,
        unidades_disponibles: 0,
        pendientes_validacion: 0,
      };

      if (estadoRegistro === EstadoRegistro.PENDIENTE_VALIDACION) {
        current.pendientes_validacion += 1;
      } else if (
        estadoRegistro === EstadoRegistro.VALIDADO &&
        Number.isFinite(saldo) &&
        saldo > 0
      ) {
        if (unidad === 'G') {
          current.gramos_disponibles += saldo;
        } else if (unidad === 'UNIDAD') {
          current.unidades_disponibles += saldo;
        }
      }

      stockByPlant.set(plantaId, current);
    }

    return {
      success: true,
      data: plantas.map((planta) => {
        const stock = stockByPlant.get(Number(planta.id));

        return {
          planta_id: Number(planta.id),
          especie: planta.especie,
          nombre_cientifico: planta.nombre_cientifico,
          variedad: planta.variedad,
          nombre_comun_principal: planta.nombre_comun_principal,
          imagen_url: planta.imagen_url,
          gramos_disponibles: stock?.gramos_disponibles ?? 0,
          unidades_disponibles: stock?.unidades_disponibles ?? 0,
          pendientes_validacion: stock?.pendientes_validacion ?? 0,
        };
      }),
      actualizado_en: new Date().toISOString(),
    };
  }

  private async fetchStockRows(
    supabase: SupabaseClient,
  ): Promise<{ data: StockRecoleccionRow[] | null; error: unknown }> {
    const pageSize = 1000;
    const rows: StockRecoleccionRow[] = [];
    let offset = 0;

    while (true) {
      const response = await supabase
        .from('recoleccion')
        .select('planta_id, unidad_canonica, saldo_actual, estado_registro')
        .eq('tipo_material', 'SEMILLA')
        .in('estado_registro', [
          EstadoRegistro.VALIDADO,
          EstadoRegistro.PENDIENTE_VALIDACION,
        ])
        .not('planta_id', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      const error = response.error;
      const page = (response.data ?? []) as unknown as StockRecoleccionRow[];

      if (error) {
        return { data: null, error };
      }

      rows.push(...page);

      if (page.length < pageSize) {
        return { data: rows, error: null };
      }

      offset += pageSize;
    }
  }

  async findByVivero(viveroId: number, filters: FiltersRecoleccionDto) {
    const supabase = this.supabaseService.getClient();
    const { data: vivero, error: viveroError } = await supabase
      .from('vivero')
      .select('id')
      .eq('id', viveroId)
      .single();

    if (viveroError || !vivero) {
      throw new NotFoundException('Vivero no encontrado');
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('recoleccion')
      .select(this.getCanonicalRecoleccionSelect(), { count: 'exact' })
      .eq('vivero_id', viveroId);

    query = this.applyCommonListFilters(query, filters);
    const searchTerm = filters.search ?? filters.q;
    const normalizedSearch = searchTerm?.trim();
    if (normalizedSearch) {
      const orConditions =
        await this.buildRecoleccionSearchOrConditions(normalizedSearch);
      query = query.or(orConditions.join(','));
    }
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('❌ Error al obtener recolecciones por vivero:', error);
      throw new InternalServerErrorException(
        'Error al obtener recolecciones por vivero',
      );
    }

    return this.buildPaginatedResponse(
      data || [],
      count || 0,
      page,
      limit,
      filters,
    );
  }

  async findOne(id: number, cantidadSolicitadaVivero?: number) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('recoleccion')
      .select(
        `
        ${this.getCanonicalRecoleccionSelect()}
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Recolección no encontrada');
    }

    const enrichedData =
      await this.ubicacionService.enrichSingleRecoleccion(data);
    const evidencias =
      await this.evidenciasService.getEvidenciasByRecoleccionId(id);
    const canonicalData = this.mapRecoleccionToCanonicalResponse(
      enrichedData,
      evidencias,
      cantidadSolicitadaVivero,
    );

    return {
      success: true,
      data: canonicalData,
    };
  }

  private async buildPaginatedResponse(
    rows: any[],
    count: number,
    page: number,
    limit: number,
    filters: FiltersRecoleccionDto,
  ) {
    const totalPages = Math.ceil(count / limit);
    const enrichedData =
      await this.ubicacionService.enrichRecoleccionesWithUbicaciones(rows);
    const evidenciasMap =
      await this.evidenciasService.getEvidenciasMapByRecoleccionIds(
        enrichedData.map((item: any) => Number(item.id)),
      );
    const finalData = enrichedData.map((item: any) =>
      this.mapRecoleccionToCanonicalResponse(
        item,
        evidenciasMap.get(Number(item.id)) || [],
        filters.cantidad_solicitada_vivero,
      ),
    );

    return {
      success: true,
      data: finalData,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  private applyCommonListFilters(query: any, filters: FiltersRecoleccionDto) {
    let nextQuery = query
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.fecha_inicio) {
      nextQuery = nextQuery.gte('fecha', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      nextQuery = nextQuery.lte('fecha', filters.fecha_fin);
    }

    if (filters.tipo_material) {
      nextQuery = nextQuery.eq('tipo_material', filters.tipo_material);
    }

    return nextQuery;
  }

  private mapRecoleccionToCanonicalResponse(
    recoleccion: any,
    evidencias: any[],
    cantidadSolicitadaVivero?: number,
  ) {
    const elegibilidadVivero =
      this.elegibilidadService.evaluarRecoleccionElegibleParaInicioVivero(
        {
          ...recoleccion,
          fotos_count: evidencias.length,
          latitud: recoleccion.ubicacion?.coordenadas?.lat ?? null,
          longitud: recoleccion.ubicacion?.coordenadas?.lon ?? null,
        },
        cantidadSolicitadaVivero,
      );

    return mapRecoleccionToCanonicalResponse(
      recoleccion,
      evidencias,
      elegibilidadVivero,
    );
  }

  getCanonicalRecoleccionSelect(): string {
    return `
      id,
      fecha,
      created_at,
      tipo_material,
      nombre_cientifico_snapshot,
      nombre_comercial_snapshot,
      variedad_snapshot,
      nombre_comunidad_snapshot,
      nombre_recolector_snapshot,
      especie_nueva,
      observaciones,
      usuario_id,
      ubicacion_id,
      vivero_id,
      metodo_id,
      planta_id,
      codigo_trazabilidad,
      blockchain_url,
      token_id,
      transaction_hash,
      estado_registro,
      motivo_rechazo,
      unidad_canonica,
      cantidad_inicial_canonica,
      saldo_actual,
      estado_operativo,
      usuario_validacion_id,
      fecha_validacion,
      usuario:usuario_id (id, nombre, apellido, username, correo),
      vivero:vivero_id (id, codigo, nombre, ubicacion_id),
      metodo:metodo_id (id, nombre, descripcion),
      planta:planta_id (
        id,
        especie,
        nombre_cientifico,
        variedad,
        nombre_comun_principal,
        nombres_comunes,
        imagen_url,
        notas,
        tipo_planta_id
      )
    `;
  }

  private async buildRecoleccionSearchOrConditions(
    searchTerm: string,
  ): Promise<string[]> {
    const normalizedSearch = searchTerm.trim();
    const orConditions = [
      `codigo_trazabilidad.ilike.%${normalizedSearch}%`,
      `observaciones.ilike.%${normalizedSearch}%`,
      `nombre_cientifico_snapshot.ilike.%${normalizedSearch}%`,
      `nombre_comercial_snapshot.ilike.%${normalizedSearch}%`,
      `variedad_snapshot.ilike.%${normalizedSearch}%`,
      `nombre_comunidad_snapshot.ilike.%${normalizedSearch}%`,
      `nombre_recolector_snapshot.ilike.%${normalizedSearch}%`,
    ];
    const plantIds = await this.findPlantIdsBySearchTerm(normalizedSearch);

    if (plantIds.length > 0) {
      orConditions.push(`planta_id.in.(${plantIds.join(',')})`);
    }

    return orConditions;
  }

  private async findPlantIdsBySearchTerm(
    searchTerm: string,
  ): Promise<number[]> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('planta')
      .select('id')
      .or(
        `nombre_cientifico.ilike.%${searchTerm}%,nombre_comun_principal.ilike.%${searchTerm}%,especie.ilike.%${searchTerm}%`,
      );

    if (error) {
      this.logger.error(
        '❌ Error al buscar plantas para filtro search:',
        error,
      );
      throw new InternalServerErrorException('Error al filtrar recolecciones');
    }

    return (data || [])
      .map((item: any) => Number(item.id))
      .filter((id) => Number.isInteger(id) && id > 0);
  }
}
