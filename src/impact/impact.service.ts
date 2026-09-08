import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  GeoJsonGeometry,
  ImpactArea,
  ImpactCampaignCard,
  ImpactEvidence,
  ImpactLocation,
  ImpactMetrics,
  ImpactOrganization,
  ImpactPlantingPoint,
  ImpactPlantingRecord,
  ImpactSpecies,
  ImpactSubcampaign,
} from './impact.types';

type OrganizationRow = {
  id: number | string;
  nombre: string;
  logo_url: string | null;
};

type CampaignRow = {
  id: number | string;
  nombre: string;
  tipo: string;
  descripcion: string | null;
  fecha_estimada_inicio: string | null;
  fecha_estimada_fin: string | null;
  updated_at: string;
};

type CampaignStateRow = {
  campania_id: number | string;
  estado_derivado: string;
};

type CampaignAssociationRow = {
  campania_id: number | string;
};

type LocationRow = {
  id: number | string;
  nombre: string;
};

type EvidenceTypeRow = {
  id: number | string;
};

type SubcampaignRow = {
  id: number | string;
  campania_id: number | string;
  nombre: string;
  descripcion: string | null;
  estado: string;
  fase_mantenimiento: string;
  zona_id: number | string;
  nombre_zona_snapshot: string | null;
  area_hectareas: number | string | null;
  meta_total_arboles: number | string | null;
  total_plantado_inicial: number | string | null;
  total_repuesto: number | string | null;
  saldo_vivo_actual: number | string | null;
  updated_at: string;
};

type PlantingRow = {
  id: number | string;
  subcampania_id: number | string;
  fecha_plantacion: string;
  latitud: number | string;
  longitud: number | string;
  cantidad_total_plantada: number | string;
  es_reposicion: boolean;
  gps_dentro_poligono: boolean;
  gps_distancia_a_poligono_m: number | string | null;
  created_at: string;
};

type PlantEmbed = {
  id: number | string;
  especie: string | null;
  nombre_cientifico: string | null;
  nombre_comun_principal: string | null;
};

type PlantingDetailRow = {
  registro_plantacion_id: number | string;
  planta_id: number | string;
  cantidad: number | string;
  nombre_cientifico_snapshot: string | null;
  nombre_comercial_snapshot: string | null;
  planta: PlantEmbed | PlantEmbed[] | null;
};

type EvidenceRow = {
  id: number | string;
  entidad_id: number | string;
  bucket: string;
  ruta_archivo: string;
  titulo: string | null;
  es_principal: boolean;
  tomado_en: string | null;
  creado_en: string;
};

type ImpactDataset = {
  organization: ImpactOrganization;
  campaigns: CampaignRow[];
  statusByCampaign: Map<number, string>;
  subcampaigns: SubcampaignRow[];
  currentLocationNameById: Map<number, string>;
  polygonBySubcampaign: Map<number, GeoJsonGeometry | null>;
  plantings: PlantingRow[];
  detailsByPlanting: Map<number, ImpactSpecies[]>;
  evidenceByPlanting: Map<number, ImpactEvidence[]>;
};

const PAGE_SIZE = 1000;

@Injectable()
export class ImpactService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listOrganizations() {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('organizacion')
      .select('id, nombre, logo_url')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(
        'No se pudieron consultar las organizaciones de impacto.',
      );
    }

    return {
      success: true,
      data: ((data ?? []) as OrganizationRow[]).map((row) =>
        this.mapOrganization(row),
      ),
    };
  }

  async getOrganizationDashboard(organizationId: number) {
    const dataset = await this.loadDataset(organizationId);
    const campaigns = dataset.campaigns.map((campaign) =>
      this.mapCampaignCard(campaign, dataset),
    );
    const allSubcampaigns = dataset.subcampaigns;
    const allPlantings = dataset.plantings;
    const allEvidence = Array.from(dataset.evidenceByPlanting.values()).flat();

    const summaryMetrics = this.calculateMetrics(allSubcampaigns);
    const locationIds = new Set(
      allSubcampaigns.map((row) => Number(row.zona_id)),
    );
    const lastActivityAt = this.latestTimestamp([
      ...dataset.campaigns.map((row) => row.updated_at),
      ...allSubcampaigns.map((row) => row.updated_at),
      ...allPlantings.map((row) => row.created_at),
    ]);

    return {
      success: true,
      data: {
        organization: dataset.organization,
        attribution: {
          label: 'Impacto asociado',
          method: 'CAMPAIGN_ASSOCIATION',
          quantified: false,
          note: 'Los resultados corresponden a campañas asociadas a la organización; no representan una asignación financiera exclusiva.',
        },
        summary: {
          campaignsCount: campaigns.length,
          subcampaignsCount: allSubcampaigns.length,
          ...summaryMetrics,
          locationsCount: locationIds.size,
          plantingRecordsCount: allPlantings.length,
          evidenceCount: allEvidence.length,
          lastActivityAt,
        },
        campaigns,
        map: {
          plantingPoints: this.mapPlantingPoints(dataset),
          areas: this.mapAreas(dataset),
        },
        evidencePreview: this.sortEvidence(allEvidence).slice(0, 12),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async getCampaignDetail(organizationId: number, campaignId: number) {
    const dataset = await this.loadDataset(organizationId, campaignId, true);
    const campaign = dataset.campaigns[0];
    if (!campaign) {
      throw new NotFoundException(
        `La campaña ${campaignId} no está asociada a la organización ${organizationId}.`,
      );
    }

    const subcampaigns = dataset.subcampaigns.map((subcampaign) =>
      this.mapSubcampaign(subcampaign, dataset),
    );
    const plantingRecords = dataset.plantings.map((planting) =>
      this.mapPlantingRecord(planting, dataset),
    );
    const evidence = this.sortEvidence(
      Array.from(dataset.evidenceByPlanting.values()).flat(),
    );

    return {
      success: true,
      data: {
        organization: dataset.organization,
        campaign: this.mapCampaignCard(campaign, dataset),
        subcampaigns,
        plantingRecords,
        map: {
          plantingPoints: this.mapPlantingPoints(dataset),
          areas: this.mapAreas(dataset),
        },
        evidence,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private async loadDataset(
    organizationId: number,
    campaignId?: number,
    includePlantingDetails = false,
  ): Promise<ImpactDataset> {
    const organization = await this.requireOrganization(organizationId);
    const campaigns = await this.loadCampaigns(organizationId, campaignId);
    if (campaignId !== undefined && campaigns.length === 0) {
      throw new NotFoundException(
        `La campaña ${campaignId} no está asociada a la organización ${organizationId}.`,
      );
    }

    const campaignIds = campaigns.map((row) => Number(row.id));
    if (campaignIds.length === 0) {
      return {
        organization,
        campaigns: [],
        statusByCampaign: new Map(),
        subcampaigns: [],
        currentLocationNameById: new Map(),
        polygonBySubcampaign: new Map(),
        plantings: [],
        detailsByPlanting: new Map(),
        evidenceByPlanting: new Map(),
      };
    }

    const supabase = this.supabaseService.getClient();
    const [statesResult, subcampaignResult] = await Promise.all([
      supabase
        .from('campania_estado')
        .select('campania_id, estado_derivado')
        .in('campania_id', campaignIds),
      supabase
        .from('subcampania')
        .select(
          'id, campania_id, nombre, descripcion, estado, fase_mantenimiento, zona_id, nombre_zona_snapshot, area_hectareas, meta_total_arboles, total_plantado_inicial, total_repuesto, saldo_vivo_actual, updated_at',
        )
        .in('campania_id', campaignIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    ]);

    if (statesResult.error || subcampaignResult.error) {
      throw new InternalServerErrorException(
        'No se pudo construir el impacto de la organización.',
      );
    }

    const statusByCampaign = new Map<number, string>();
    for (const row of (statesResult.data ?? []) as CampaignStateRow[]) {
      statusByCampaign.set(
        Number(row.campania_id),
        String(row.estado_derivado),
      );
    }

    const subcampaigns = (subcampaignResult.data ?? []) as SubcampaignRow[];
    const subcampaignIds = subcampaigns.map((row) => Number(row.id));
    const [currentLocationNameById, polygonBySubcampaign] = await Promise.all([
      this.loadCurrentLocationNames(subcampaigns),
      this.loadPolygons(subcampaignIds),
    ]);
    const plantings = await this.loadPlantings(subcampaignIds);
    const plantingIds = plantings.map((row) => Number(row.id));
    const [detailsByPlanting, evidenceByPlanting] = await Promise.all([
      includePlantingDetails
        ? this.loadPlantingDetails(plantingIds)
        : Promise.resolve(new Map<number, ImpactSpecies[]>()),
      this.loadEvidence(plantings, subcampaigns),
    ]);

    return {
      organization,
      campaigns,
      statusByCampaign,
      subcampaigns,
      currentLocationNameById,
      polygonBySubcampaign,
      plantings,
      detailsByPlanting,
      evidenceByPlanting,
    };
  }

  private async requireOrganization(
    organizationId: number,
  ): Promise<ImpactOrganization> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('organizacion')
      .select('id, nombre, logo_url')
      .eq('id', organizationId)
      .eq('activo', true)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        'No se pudo consultar la organización.',
      );
    }
    if (!data) {
      throw new NotFoundException(
        `Organización con id ${organizationId} no encontrada.`,
      );
    }
    return this.mapOrganization(data as OrganizationRow);
  }

  private async loadCampaigns(
    organizationId: number,
    campaignId?: number,
  ): Promise<CampaignRow[]> {
    const supabase = this.supabaseService.getClient();
    let associationQuery = supabase
      .from('campania_organizacion')
      .select('campania_id')
      .eq('organizacion_id', organizationId);
    if (campaignId !== undefined) {
      associationQuery = associationQuery.eq('campania_id', campaignId);
    }
    const { data: associations, error: associationError } =
      await associationQuery;

    if (associationError) {
      throw new InternalServerErrorException(
        'No se pudieron consultar las campañas de la organización.',
      );
    }

    const campaignIds = ((associations ?? []) as CampaignAssociationRow[]).map(
      (row) => Number(row.campania_id),
    );
    if (campaignIds.length === 0) return [];

    const { data, error } = await supabase
      .from('campania')
      .select(
        'id, nombre, tipo, descripcion, fecha_estimada_inicio, fecha_estimada_fin, updated_at',
      )
      .in('id', campaignIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        'No se pudieron consultar las campañas de la organización.',
      );
    }
    return (data ?? []) as CampaignRow[];
  }

  private async loadPolygons(
    subcampaignIds: number[],
  ): Promise<Map<number, GeoJsonGeometry | null>> {
    const supabase = this.supabaseService.getClient();
    const entries = await Promise.all(
      subcampaignIds.map(async (subcampaignId) => {
        const rpcResult = (await supabase.rpc(
          'fn_subcampania_poligono_geojson',
          { p_id: subcampaignId },
        )) as { data: unknown; error: unknown };
        return [
          subcampaignId,
          rpcResult.error
            ? null
            : ((rpcResult.data ?? null) as GeoJsonGeometry | null),
        ] as const;
      }),
    );
    return new Map(entries);
  }

  private async loadCurrentLocationNames(
    subcampaigns: SubcampaignRow[],
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    const missingIds = Array.from(
      new Set(
        subcampaigns
          .filter((row) => !row.nombre_zona_snapshot)
          .map((row) => Number(row.zona_id)),
      ),
    );
    if (missingIds.length === 0) return result;

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('division_administrativa')
      .select('id, nombre')
      .in('id', missingIds);
    if (error) {
      throw new InternalServerErrorException(
        'No se pudieron consultar los nombres de ubicación.',
      );
    }
    for (const row of (data ?? []) as LocationRow[]) {
      result.set(Number(row.id), String(row.nombre));
    }
    return result;
  }

  private async loadPlantings(
    subcampaignIds: number[],
  ): Promise<PlantingRow[]> {
    if (subcampaignIds.length === 0) return [];

    return this.fetchAll<PlantingRow>(async (from, to) => {
      const supabase = this.supabaseService.getClient();
      return supabase
        .from('registro_plantacion')
        .select(
          'id, subcampania_id, fecha_plantacion, latitud, longitud, cantidad_total_plantada, es_reposicion, gps_dentro_poligono, gps_distancia_a_poligono_m, created_at',
        )
        .in('subcampania_id', subcampaignIds)
        .order('fecha_plantacion', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
    }, 'No se pudieron consultar los registros de plantación.');
  }

  private async loadPlantingDetails(
    plantingIds: number[],
  ): Promise<Map<number, ImpactSpecies[]>> {
    const result = new Map<number, ImpactSpecies[]>();
    if (plantingIds.length === 0) return result;

    const supabase = this.supabaseService.getClient();
    const data = await this.fetchAll<PlantingDetailRow>(
      async (from, to) =>
        supabase
          .from('registro_plantacion_detalle')
          .select(
            'registro_plantacion_id, planta_id, cantidad, nombre_cientifico_snapshot, nombre_comercial_snapshot, planta:planta_id(id, especie, nombre_cientifico, nombre_comun_principal)',
          )
          .in('registro_plantacion_id', plantingIds)
          .order('id', { ascending: true })
          .range(from, to),
      'No se pudo consultar el detalle de las plantaciones.',
    );

    for (const row of data) {
      const plantingId = Number(row.registro_plantacion_id);
      const plant = this.unwrapRelation(row.planta);
      const species: ImpactSpecies = {
        id: Number(row.planta_id),
        commonName:
          row.nombre_comercial_snapshot ??
          plant?.nombre_comun_principal ??
          plant?.especie ??
          null,
        scientificName:
          row.nombre_cientifico_snapshot ?? plant?.nombre_cientifico ?? null,
        quantity: Number(row.cantidad ?? 0),
      };
      if (!result.has(plantingId)) result.set(plantingId, []);
      const plantingSpecies = result.get(plantingId)!;
      const existingSpecies = plantingSpecies.find(
        (item) => item.id === species.id,
      );
      if (existingSpecies) {
        existingSpecies.quantity += species.quantity;
        existingSpecies.commonName ??= species.commonName;
        existingSpecies.scientificName ??= species.scientificName;
      } else {
        plantingSpecies.push(species);
      }
    }
    return result;
  }

  private async loadEvidence(
    plantings: PlantingRow[],
    subcampaigns: SubcampaignRow[],
  ): Promise<Map<number, ImpactEvidence[]>> {
    const result = new Map<number, ImpactEvidence[]>();
    if (plantings.length === 0) return result;

    const supabase = this.supabaseService.getClient();
    const { data: typeRow, error: typeError } = await supabase
      .from('tipos_entidad_evidencia')
      .select('id')
      .ilike('codigo', 'REGISTRO_PLANTACION')
      .eq('activo', true)
      .maybeSingle();

    if (typeError) {
      throw new InternalServerErrorException(
        'No se pudo resolver el tipo de evidencia de plantación.',
      );
    }
    if (!typeRow) return result;
    const evidenceType = typeRow as EvidenceTypeRow;

    const plantingIds = plantings.map((row) => Number(row.id));
    const evidenceRows = await this.fetchAll<EvidenceRow>(
      async (from, to) =>
        supabase
          .from('evidencias_trazabilidad')
          .select(
            'id, entidad_id, bucket, ruta_archivo, titulo, es_principal, tomado_en, creado_en',
          )
          .eq('tipo_entidad_id', Number(evidenceType.id))
          .in('entidad_id', plantingIds)
          .is('eliminado_en', null)
          .order('es_principal', { ascending: false })
          .order('orden', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      'No se pudieron consultar las evidencias de plantación.',
    );

    const subcampaignById = new Map(
      subcampaigns.map((row) => [Number(row.id), row]),
    );
    const plantingById = new Map(plantings.map((row) => [Number(row.id), row]));

    for (const row of evidenceRows) {
      const plantingId = Number(row.entidad_id);
      const planting = plantingById.get(plantingId);
      if (!planting) continue;
      const subcampaign = subcampaignById.get(Number(planting.subcampania_id));
      if (!subcampaign) continue;

      const { data: publicUrl } = supabase.storage
        .from(row.bucket)
        .getPublicUrl(row.ruta_archivo);
      const evidence: ImpactEvidence = {
        id: Number(row.id),
        plantingRecordId: plantingId,
        campaignId: Number(subcampaign.campania_id),
        subcampaignId: Number(subcampaign.id),
        title: row.titulo ?? null,
        imageUrl: publicUrl.publicUrl,
        takenAt: row.tomado_en ?? row.creado_en,
        isPrimary: Boolean(row.es_principal),
      };
      if (!result.has(plantingId)) result.set(plantingId, []);
      result.get(plantingId)!.push(evidence);
    }
    return result;
  }

  private mapCampaignCard(
    campaign: CampaignRow,
    dataset: ImpactDataset,
  ): ImpactCampaignCard {
    const campaignId = Number(campaign.id);
    const subcampaigns = dataset.subcampaigns.filter(
      (row) => Number(row.campania_id) === campaignId,
    );
    const subcampaignIds = new Set(subcampaigns.map((row) => Number(row.id)));
    const plantings = dataset.plantings.filter((row) =>
      subcampaignIds.has(Number(row.subcampania_id)),
    );
    const evidence = this.sortEvidence(
      plantings.flatMap(
        (row) => dataset.evidenceByPlanting.get(Number(row.id)) ?? [],
      ),
    );

    return {
      id: campaignId,
      name: campaign.nombre,
      type: campaign.tipo,
      description: campaign.descripcion ?? null,
      status: dataset.statusByCampaign.get(campaignId) ?? 'BORRADOR',
      plannedStartDate: campaign.fecha_estimada_inicio ?? null,
      plannedEndDate: campaign.fecha_estimada_fin ?? null,
      subcampaignsCount: subcampaigns.length,
      plantingRecordsCount: plantings.length,
      evidenceCount: evidence.length,
      impact: this.calculateMetrics(subcampaigns),
      locations: this.mapLocations(subcampaigns, dataset),
      evidencePreview: evidence.slice(0, 3),
    };
  }

  private mapSubcampaign(
    row: SubcampaignRow,
    dataset: ImpactDataset,
  ): ImpactSubcampaign {
    const id = Number(row.id);
    const plantings = dataset.plantings.filter(
      (planting) => Number(planting.subcampania_id) === id,
    );
    const evidenceCount = plantings.reduce(
      (total, planting) =>
        total +
        (dataset.evidenceByPlanting.get(Number(planting.id))?.length ?? 0),
      0,
    );

    return {
      id,
      campaignId: Number(row.campania_id),
      name: row.nombre,
      description: row.descripcion ?? null,
      status: row.estado,
      maintenancePhase: row.fase_mantenimiento,
      location: {
        id: Number(row.zona_id),
        name: this.resolveLocationName(row, dataset),
      },
      hectares: this.round(Number(row.area_hectareas ?? 0), 4),
      impact: this.calculateMetrics([row]),
      polygon: dataset.polygonBySubcampaign.get(id) ?? null,
      plantingRecordsCount: plantings.length,
      evidenceCount,
    };
  }

  private mapPlantingRecord(
    row: PlantingRow,
    dataset: ImpactDataset,
  ): ImpactPlantingRecord {
    const id = Number(row.id);
    return {
      id,
      subcampaignId: Number(row.subcampania_id),
      plantedAt: row.fecha_plantacion,
      latitude: Number(row.latitud),
      longitude: Number(row.longitud),
      treesPlanted: Number(row.cantidad_total_plantada ?? 0),
      replacement: Boolean(row.es_reposicion),
      withinArea: Boolean(row.gps_dentro_poligono),
      distanceToAreaMeters:
        row.gps_distancia_a_poligono_m === null
          ? null
          : Number(row.gps_distancia_a_poligono_m),
      species: dataset.detailsByPlanting.get(id) ?? [],
      evidence: dataset.evidenceByPlanting.get(id) ?? [],
    };
  }

  private mapPlantingPoints(dataset: ImpactDataset): ImpactPlantingPoint[] {
    const subcampaignById = new Map(
      dataset.subcampaigns.map((row) => [Number(row.id), row]),
    );
    return dataset.plantings.flatMap((row) => {
      const latitude = Number(row.latitud);
      const longitude = Number(row.longitud);
      const subcampaign = subcampaignById.get(Number(row.subcampania_id));
      if (
        !subcampaign ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return [];
      }
      return [
        {
          id: Number(row.id),
          campaignId: Number(subcampaign.campania_id),
          subcampaignId: Number(row.subcampania_id),
          latitude,
          longitude,
          plantedAt: row.fecha_plantacion,
          treesPlanted: Number(row.cantidad_total_plantada ?? 0),
          replacement: Boolean(row.es_reposicion),
          withinArea: Boolean(row.gps_dentro_poligono),
          distanceToAreaMeters:
            row.gps_distancia_a_poligono_m === null
              ? null
              : Number(row.gps_distancia_a_poligono_m),
          evidenceCount:
            dataset.evidenceByPlanting.get(Number(row.id))?.length ?? 0,
        },
      ];
    });
  }

  private mapAreas(dataset: ImpactDataset): ImpactArea[] {
    return dataset.subcampaigns.map((row) => ({
      campaignId: Number(row.campania_id),
      subcampaignId: Number(row.id),
      name: row.nombre,
      locationName: this.resolveLocationName(row, dataset),
      hectares: this.round(Number(row.area_hectareas ?? 0), 4),
      polygon: dataset.polygonBySubcampaign.get(Number(row.id)) ?? null,
    }));
  }

  private mapLocations(
    rows: SubcampaignRow[],
    dataset: ImpactDataset,
  ): ImpactLocation[] {
    const locations = new Map<number, ImpactLocation>();
    for (const row of rows) {
      const id = Number(row.zona_id);
      const current = locations.get(id);
      if (current) {
        current.subcampaignsCount += 1;
      } else {
        locations.set(id, {
          id,
          name: this.resolveLocationName(row, dataset) ?? `Ubicación ${id}`,
          subcampaignsCount: 1,
        });
      }
    }
    return Array.from(locations.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private calculateMetrics(rows: SubcampaignRow[]): ImpactMetrics {
    let treesTarget = 0;
    let treesPlantedInitial = 0;
    let treesReplanted = 0;
    let treesAliveReported = 0;
    let hectares = 0;

    for (const row of rows) {
      treesTarget += Number(row.meta_total_arboles ?? 0);
      treesPlantedInitial += Number(row.total_plantado_inicial ?? 0);
      treesReplanted += Number(row.total_repuesto ?? 0);
      treesAliveReported += Number(row.saldo_vivo_actual ?? 0);
      hectares += Number(row.area_hectareas ?? 0);
    }

    return {
      treesTarget,
      treesPlantedInitial,
      treesReplanted,
      treesAliveReported,
      progressPct: this.percentage(treesPlantedInitial, treesTarget),
      survivalPct: this.percentage(
        treesAliveReported,
        treesPlantedInitial + treesReplanted,
      ),
      hectares: this.round(hectares, 4),
    };
  }

  private percentage(numerator: number, denominator: number): number | null {
    if (denominator <= 0) return null;
    return this.round(
      Math.min(100, Math.max(0, (numerator / denominator) * 100)),
      2,
    );
  }

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private mapOrganization(row: OrganizationRow): ImpactOrganization {
    return {
      id: Number(row.id),
      name: row.nombre,
      logo: row.logo_url ?? null,
      description: null,
    };
  }

  private resolveLocationName(
    row: SubcampaignRow,
    dataset: ImpactDataset,
  ): string | null {
    return (
      row.nombre_zona_snapshot ??
      dataset.currentLocationNameById.get(Number(row.zona_id)) ??
      null
    );
  }

  private sortEvidence(rows: ImpactEvidence[]): ImpactEvidence[] {
    return [...rows].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return String(b.takenAt ?? '').localeCompare(String(a.takenAt ?? ''));
    });
  }

  private latestTimestamp(values: Array<string | null | undefined>) {
    const timestamps = values.filter((value): value is string =>
      Boolean(value),
    );
    if (timestamps.length === 0) return null;
    return timestamps.sort((a, b) => b.localeCompare(a))[0];
  }

  private unwrapRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private async fetchAll<T>(
    loader: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
    errorMessage: string,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await loader(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new InternalServerErrorException(errorMessage);
      }
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }
}
