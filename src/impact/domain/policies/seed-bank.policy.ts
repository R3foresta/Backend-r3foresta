import type { SeedBankQueryDto } from '../../seed-bank/seed-bank.dto';
import type {
  SeedCollection,
  SeedOverview,
  SeedPage,
  SeedRow,
  SeedUnit,
} from '../../seed-bank/seed-bank.types';
import { CantidadUnidadPolicy } from '../../../recolecciones/domain/policies/cantidad-unidad.policy';

export function seedDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= '0001-01-01' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function seedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function seedRelation(value: unknown): SeedRow {
  if (Array.isArray(value)) return seedRelation(value[0]);
  return value && typeof value === 'object' ? (value as SeedRow) : {};
}
function sourceError(): never {
  throw new Error('Proyección de semillas incompatible con la fuente.');
}
function sourceId(value: unknown): number {
  if (
    (typeof value !== 'number' &&
      (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  )
    sourceError();
  return Number(value);
}
function quantity(value: unknown): number {
  if (
    (typeof value !== 'number' &&
      (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value))) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0 ||
    Number(value) > Number.MAX_SAFE_INTEGER
  )
    sourceError();
  return Number(value);
}
function coordinate(value: unknown, bound: number): number | null {
  if (value === null || value === undefined) return null;
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
  )
    return null;
  const number = Number(value);
  return value !== '' && Number.isFinite(number) && Math.abs(number) <= bound
    ? number
    : null;
}

// La fuente de mint vigente genera este explorador. Otros hosts requieren cotejo;
// nunca tratar como acuñación una URL de metadatos, IPFS o una imagen.
export function seedExplorer(
  value: unknown,
  token: string | null,
  hash: string | null,
): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !['shannon-explorer.somnia.network', 'explorer.somnia.network'].includes(
        url.hostname,
      )
    )
      return null;
    const nft = url.pathname.match(
      /^\/token\/(0x[0-9a-fA-F]{40})\/instance\/([0-9]+)\/?$/,
    );
    const tx = url.pathname.match(/^\/tx\/(0x[0-9a-fA-F]{64})\/?$/);
    if (
      (nft && (token === null || nft[2] === token)) ||
      (tx && (hash === null || tx[1].toLowerCase() === hash.toLowerCase()))
    )
      return url.toString();
  } catch {
    /* URL no publicable. */
  }
  return null;
}

export function projectSeed(row: SeedRow, location?: SeedRow): SeedCollection {
  if (row.tipo_material !== 'SEMILLA') sourceError();
  const id = sourceId(row.id);
  const plantId = sourceId(row.planta_id);
  const code = seedText(row.codigo_trazabilidad);
  if (
    !code ||
    !seedDate(row.fecha) ||
    !['BORRADOR', 'PENDIENTE_VALIDACION', 'VALIDADO', 'RECHAZADO'].includes(
      String(row.estado_registro),
    )
  )
    sourceError();
  const rawQuantity = quantity(row.cantidad_inicial_canonica);
  const unit = CantidadUnidadPolicy.normalizarUnidadInput(row.unidad_canonica);
  const normalized =
    rawQuantity === 0
      ? {
          unidad_canonica: unit === 'KG' ? ('G' as const) : unit,
          cantidad_canonica: 0,
        }
      : CantidadUnidadPolicy.normalizarYValidar(rawQuantity, unit, 'SEMILLA');
  if (
    !Number.isFinite(normalized.cantidad_canonica) ||
    normalized.cantidad_canonica > Number.MAX_SAFE_INTEGER
  )
    sourceError();
  const balance =
    row.saldo_actual === null || row.saldo_actual === undefined
      ? null
      : quantity(row.saldo_actual) * (unit === 'KG' ? 1000 : 1);
  if (
    balance !== null &&
    (!Number.isFinite(balance) ||
      balance > Number.MAX_SAFE_INTEGER ||
      (normalized.unidad_canonica === 'UNIDAD' && !Number.isInteger(balance)))
  )
    sourceError();
  const plant = seedRelation(row.planta);
  const token = seedText(row.token_id);
  const hash = seedText(row.transaction_hash);
  const explorer = seedExplorer(row.blockchain_url, token, hash);
  const loc =
    location && row.ubicacion_id != null
      ? {
          id: sourceId(row.ubicacion_id),
          nombre: seedText(location.nombre),
          division: Array.isArray(location.division_ruta)
            ? location.division_ruta
                .map((item) => seedText(seedRelation(item).nombre))
                .filter(Boolean)
                .join(', ') || null
            : null,
          pais: seedText(location.pais_nombre),
          latitud: coordinate(location.latitud, 90),
          longitud: coordinate(location.longitud, 180),
        }
      : null;
  return {
    id,
    codigo_trazabilidad: code,
    tipo_material: 'SEMILLA',
    fecha: row.fecha,
    cantidad_inicial_canonica: normalized.cantidad_canonica,
    unidad_canonica: normalized.unidad_canonica,
    saldo_actual: balance,
    estado_registro: row.estado_registro as SeedCollection['estado_registro'],
    planta: {
      id: plantId,
      nombre_comun_principal:
        seedText(row.nombre_comercial_snapshot) ??
        seedText(plant.nombre_comun_principal) ??
        seedText(plant.especie),
      nombre_cientifico:
        seedText(row.nombre_cientifico_snapshot) ??
        seedText(plant.nombre_cientifico),
    },
    ubicacion: loc,
    blockchain:
      token || hash || explorer
        ? {
            explorer_url: explorer,
            token_id: token,
            transaction_hash: hash,
            network: null,
            minted_at: null,
          }
        : null,
  };
}

export function seedPage(
  rows: SeedCollection[],
  query: SeedBankQueryDto,
): SeedPage {
  const term = query.q
    ?.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es');
  const filtered = rows.filter(
    (row) =>
      (!query.speciesId || row.planta.id === query.speciesId) &&
      (!query.locationId || row.ubicacion?.id === query.locationId) &&
      (!query.from || row.fecha >= query.from) &&
      (!query.to || row.fecha <= query.to) &&
      (!query.blockchain ||
        Boolean(row.blockchain?.explorer_url) ===
          (query.blockchain === 'with-link')) &&
      (!term ||
        [
          row.codigo_trazabilidad,
          row.planta.nombre_comun_principal,
          row.planta.nombre_cientifico,
        ].some((text) =>
          text
            ?.normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLocaleLowerCase('es')
            .includes(term),
        )),
  );
  const direction = query.sort === 'date-asc' ? 1 : -1;
  filtered.sort(
    (a, b) => direction * (a.fecha.localeCompare(b.fecha) || a.id - b.id),
  );
  const offset = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(offset, offset + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: filtered.length,
    totalPages: Math.ceil(filtered.length / query.pageSize),
  };
}

export function seedOverview(
  rows: SeedCollection[],
  generatedAt: string,
): SeedOverview {
  const species = new Map<number, SeedOverview['filters']['species'][number]>();
  const locations = new Map<number, { id: number; name: string }>();
  const totals = new Map<
    SeedUnit,
    { unit: SeedUnit; collected: number; available: number | null }
  >();
  // Elegir nombres de la recolección más reciente de forma determinista.
  for (const row of [...rows].sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id,
  )) {
    if (!species.has(row.planta.id))
      species.set(row.planta.id, {
        id: row.planta.id,
        commonName: row.planta.nombre_comun_principal,
        scientificName: row.planta.nombre_cientifico,
      });
    if (row.ubicacion && !locations.has(row.ubicacion.id))
      locations.set(row.ubicacion.id, {
        id: row.ubicacion.id,
        name:
          row.ubicacion.nombre ??
          row.ubicacion.division ??
          row.ubicacion.pais ??
          `Ubicación ${row.ubicacion.id}`,
      });
    const total = totals.get(row.unidad_canonica) ?? {
      unit: row.unidad_canonica,
      collected: 0,
      available: 0,
    };
    total.collected += row.cantidad_inicial_canonica;
    total.available =
      total.available === null || row.saldo_actual === null
        ? null
        : total.available + row.saldo_actual;
    totals.set(row.unidad_canonica, total);
  }
  const totalsByUnit = [...totals.values()]
    .sort((a, b) => a.unit.localeCompare(b.unit))
    .map((total) => {
      if (
        !Number.isFinite(total.collected) ||
        total.collected > Number.MAX_SAFE_INTEGER ||
        (total.available !== null &&
          (!Number.isFinite(total.available) ||
            total.available > Number.MAX_SAFE_INTEGER))
      )
        sourceError();
      return {
        ...total,
        collected: Number(total.collected.toFixed(6)),
        available:
          total.available === null ? null : Number(total.available.toFixed(6)),
      };
    });
  return {
    summary: {
      collectionsCount: rows.length,
      speciesCount: species.size,
      locationsCount: locations.size,
      mintedCollectionsCount: rows.filter((row) => row.blockchain?.explorer_url)
        .length,
      lastCollectionAt: rows.length
        ? rows.reduce(
            (date, row) => (row.fecha > date ? row.fecha : date),
            rows[0].fecha,
          )
        : null,
      totalsByUnit,
    },
    filters: {
      species: [...species.values()].sort((a, b) => a.id - b.id),
      locations: [...locations.values()].sort((a, b) => a.id - b.id),
    },
    generatedAt,
  };
}
