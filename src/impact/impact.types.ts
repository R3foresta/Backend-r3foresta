export type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

export type ImpactOrganization = {
  id: number;
  name: string;
  logo: string | null;
  description: string | null;
};

export type ImpactMetrics = {
  treesTarget: number;
  treesPlantedInitial: number;
  treesReplanted: number;
  treesAliveReported: number;
  progressPct: number | null;
  survivalPct: number | null;
  hectares: number;
};

export type ImpactLocation = {
  id: number;
  name: string;
  subcampaignsCount: number;
};

export type ImpactEvidence = {
  id: number;
  plantingRecordId: number;
  campaignId: number;
  subcampaignId: number;
  publicTraceabilityCode: string | null;
  title: string | null;
  imageUrl: string;
  takenAt: string | null;
  isPrimary: boolean;
  species: ImpactSpecies[];
};

export type ImpactPlantingPoint = {
  id: number;
  campaignId: number;
  subcampaignId: number;
  latitude: number;
  longitude: number;
  plantedAt: string;
  treesPlanted: number;
  replacement: boolean;
  withinArea: boolean;
  distanceToAreaMeters: number | null;
  evidenceCount: number;
};

export type ImpactArea = {
  campaignId: number;
  subcampaignId: number;
  name: string;
  locationName: string | null;
  hectares: number;
  polygon: GeoJsonGeometry | null;
};

export type ImpactCampaignCard = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  subcampaignsCount: number;
  plantingRecordsCount: number;
  evidenceCount: number;
  impact: ImpactMetrics;
  locations: ImpactLocation[];
  evidencePreview: ImpactEvidence[];
};

export type ImpactSpecies = {
  id: number;
  commonName: string | null;
  scientificName: string | null;
  quantity: number;
};

export type ImpactSpeciesMixItem = {
  speciesId: number;
  commonName: string | null;
  scientificName: string | null;
  taxonomyId: string | null;
  ecologicalCategory: string | null;
  origin: 'NATIVE' | 'INTRODUCED' | 'URBAN_TOLERANT' | 'UNKNOWN';
  quantity: number;
  quantityStage: 'PLANTED';
};

export type ImpactMonitoringTimelinePoint = {
  date: string;
  campaignId: number;
  monitoringRecordId: number;
  treesMonitored: number;
  treesAlive: number;
  deathsNew: number;
  deathsAccumulated: number;
  replacementsNew: number;
  replacementsAccumulated: number;
  source: 'PLANTING_INITIAL' | 'PLANTING_REPLACEMENT' | 'MORTALITY_REPORT';
};

export type ImpactPlantingRecord = {
  id: number;
  subcampaignId: number;
  plantedAt: string;
  latitude: number;
  longitude: number;
  treesPlanted: number;
  replacement: boolean;
  withinArea: boolean;
  distanceToAreaMeters: number | null;
  species: ImpactSpecies[];
  evidence: ImpactEvidence[];
};

export type ImpactSubcampaign = {
  id: number;
  campaignId: number;
  name: string;
  description: string | null;
  status: string;
  maintenancePhase: string;
  location: { id: number; name: string | null };
  hectares: number;
  impact: ImpactMetrics;
  polygon: GeoJsonGeometry | null;
  plantingRecordsCount: number;
  evidenceCount: number;
};
