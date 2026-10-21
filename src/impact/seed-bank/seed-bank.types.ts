export type SeedUnit = 'G' | 'UNIDAD';
export type SeedCollection = {
  id: number;
  codigo_trazabilidad: string;
  tipo_material: 'SEMILLA';
  fecha: string;
  cantidad_inicial_canonica: number;
  unidad_canonica: SeedUnit;
  saldo_actual: number | null;
  estado_registro:
    | 'BORRADOR'
    | 'PENDIENTE_VALIDACION'
    | 'VALIDADO'
    | 'RECHAZADO';
  planta: {
    id: number;
    nombre_comun_principal: string | null;
    nombre_cientifico: string | null;
  };
  ubicacion: {
    id: number;
    nombre: string | null;
    division: string | null;
    pais: string | null;
    latitud: number | null;
    longitud: number | null;
  } | null;
  blockchain: {
    explorer_url: string | null;
    token_id: string | null;
    transaction_hash: string | null;
    network: string | null;
    minted_at: string | null;
  } | null;
};
export type SeedPage = {
  items: SeedCollection[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type SeedOverview = {
  summary: {
    collectionsCount: number;
    speciesCount: number;
    locationsCount: number;
    mintedCollectionsCount: number;
    lastCollectionAt: string | null;
    totalsByUnit: {
      unit: SeedUnit;
      collected: number;
      available: number | null;
    }[];
  };
  filters: {
    species: {
      id: number;
      commonName: string | null;
      scientificName: string | null;
    }[];
    locations: { id: number; name: string }[];
  };
  generatedAt: string;
};
export type SeedDetail = SeedCollection & {
  metodo: string | null;
  observaciones_publicas: null;
  fotos: { id: number; url: string; descripcion: null }[];
  generatedAt: string;
};
export type SeedRow = Record<string, unknown>;
