import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  MAX_FOTO_BYTES,
  ParticipacionImagenService,
} from '../../participacion/cargas/participacion-imagen.service';
import {
  projectSeed,
  seedOverview,
  seedPage,
  seedRelation,
  seedText,
} from '../domain/policies/seed-bank.policy';
import type { SeedBankQueryDto } from '../seed-bank/seed-bank.dto';
import type {
  SeedCollection,
  SeedDetail,
  SeedRow,
} from '../seed-bank/seed-bank.types';

// No cuenta, recolector, correo, snapshots de personas, notas o referencia GPS.
export const SEED_SELECT = [
  'id',
  'codigo_trazabilidad',
  'tipo_material',
  'fecha',
  'cantidad_inicial_canonica',
  'unidad_canonica',
  'saldo_actual',
  'estado_registro',
  'planta_id',
  'ubicacion_id',
  'nombre_comercial_snapshot',
  'nombre_cientifico_snapshot',
  'blockchain_url',
  'token_id',
  'transaction_hash',
  'planta:planta_id(nombre_comun_principal,nombre_cientifico,especie)',
  'metodo:metodo_id(nombre)',
].join(',');
const PHOTO_SELECT = 'id,entidad_id,bucket,ruta_archivo,es_principal,orden';
const READ_SIZE = 500;
type ReadResult = { data: unknown; error: unknown; count: number | null };

@Injectable()
export class SeedBankService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly images: ParticipacionImagenService,
  ) {}

  private unavailable(): never {
    throw new ServiceUnavailableException(
      'No se pudo consultar el banco de semillas. Reintente la lectura.',
    );
  }
  private async read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      return this.unavailable();
    }
  }

  async overview() {
    return this.read(async () => {
      const { items } = await this.load();
      return {
        success: true as const,
        data: seedOverview(items, new Date().toISOString()),
      };
    });
  }

  async collections(query: SeedBankQueryDto) {
    return this.read(async () => {
      const { items } = await this.load();
      return { success: true as const, data: seedPage(items, query) };
    });
  }

  async detail(id: number) {
    return this.read(async () => {
      const { items, rows } = await this.load(id);
      if (!items.length)
        throw new NotFoundException('Recolección de semillas no encontrada.');
      const row = items[0];
      const photos =
        row.estado_registro === 'VALIDADO' ? await this.photos(id) : [];
      const data: SeedDetail = {
        ...row,
        metodo: seedText(seedRelation(rows[0].metodo).nombre),
        // No existe aprobación separada de observaciones/captions en M1.
        observaciones_publicas: null,
        fotos: photos.map((photo) => ({
          id: this.photoId(photo),
          url: `/api/v1/impact/seed-bank/collections/${id}/photos/${this.photoId(photo)}`,
          descripcion: null,
        })),
        generatedAt: new Date().toISOString(),
      };
      return { success: true as const, data };
    });
  }

  async photo(id: number, photoId: number): Promise<Buffer> {
    return this.read(async () => {
      // Revalidar pertenencia, estado y borrado en cada descarga; no basta URL previa.
      const { items } = await this.load(id);
      if (items[0]?.estado_registro !== 'VALIDADO')
        throw new NotFoundException('Imagen no encontrada.');
      const photo = (await this.photos(id)).find(
        (item) => this.photoId(item) === photoId,
      );
      if (!photo) throw new NotFoundException('Imagen no encontrada.');
      const { data, error } = await this.supabase
        .getAdminClient()
        .storage.from('recoleccion_fotos')
        .download(String(photo.ruta_archivo));
      if (error || !data || data.size > MAX_FOTO_BYTES) this.unavailable();
      const bytes = Buffer.from(await data.arrayBuffer());
      return (await this.images.preparar(bytes)).derivada;
    });
  }

  private async load(
    id?: number,
  ): Promise<{ rows: SeedRow[]; items: SeedCollection[] }> {
    const client = this.supabase.getAdminClient();
    const rows = await this.all((offset, end) => {
      let query = client
        .from('recoleccion')
        .select(SEED_SELECT, { count: 'exact' })
        .eq('tipo_material', 'SEMILLA');
      if (id !== undefined) query = query.eq('id', id);
      return query.order('id', { ascending: true }).range(offset, end);
    });
    const ids = [
      ...new Set(
        rows
          .filter((row) => row.ubicacion_id != null)
          .map((row) => this.locationKey(row.ubicacion_id)),
      ),
    ];
    const locations = new Map<string, SeedRow>();
    const view =
      this.config.get<string>('UBICACION_VIEW_NAME') ||
      'v_ubicacion_enriquecida';
    // Evita un IN de miles de IDs y límites implícitos de PostgREST.
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      const locationsPage = await this.all((from, to) =>
        client
          .from(view)
          .select('id,nombre,pais_nombre,division_ruta,latitud,longitud', {
            count: 'exact',
          })
          .in('id', batch)
          .order('id', { ascending: true })
          .range(from, to),
      );
      for (const location of locationsPage)
        locations.set(this.locationKey(location.id), location);
    }
    const items = rows.map((row) =>
      projectSeed(
        row,
        row.ubicacion_id == null
          ? undefined
          : (locations.get(this.locationKey(row.ubicacion_id)) ?? {}),
      ),
    );
    if (new Set(items.map((item) => item.id)).size !== items.length)
      this.unavailable();
    return { rows, items };
  }

  private async all(
    loader: (offset: number, end: number) => PromiseLike<ReadResult>,
  ): Promise<SeedRow[]> {
    const result: SeedRow[] = [];
    let expected: number | undefined;
    for (;;) {
      const { data, error, count } = await loader(
        result.length,
        result.length + READ_SIZE - 1,
      );
      if (
        error ||
        !Array.isArray(data) ||
        !Number.isSafeInteger(count) ||
        count === null ||
        count < 0 ||
        (expected !== undefined && expected !== count)
      )
        this.unavailable();
      expected = count;
      if (data.length === 0 && result.length < count) this.unavailable();
      const page: unknown[] = data;
      if (
        !page.every(
          (row): row is SeedRow =>
            row !== null && typeof row === 'object' && !Array.isArray(row),
        )
      )
        this.unavailable();
      result.push(...page);
      if (result.length === count) return result;
      if (result.length > count) this.unavailable();
      // Avanza por lo recibido, incluso si el servidor limita a menos de 500 filas.
    }
  }

  private async photos(id: number): Promise<SeedRow[]> {
    const client: SupabaseClient = this.supabase.getAdminClient();
    const { data: type, error } = await client
      .from('tipos_entidad_evidencia')
      .select('id')
      .eq('codigo', 'RECOLECCION')
      .eq('activo', true)
      .maybeSingle();
    if (error || !type) this.unavailable();
    const rows = await this.all((from, to) =>
      client
        .from('evidencias_trazabilidad')
        .select(PHOTO_SELECT, { count: 'exact' })
        .eq('tipo_entidad_id', type.id)
        .eq('entidad_id', id)
        .eq('tipo_archivo', 'FOTO')
        .eq('bucket', 'recoleccion_fotos')
        .is('eliminado_en', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows
      .filter(
        (photo) =>
          photo.bucket === 'recoleccion_fotos' &&
          this.safePath(photo.ruta_archivo),
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.es_principal)) - Number(Boolean(a.es_principal)) ||
          Number(a.orden ?? 0) - Number(b.orden ?? 0) ||
          this.photoId(a) - this.photoId(b),
      );
  }
  private safePath(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      !value.startsWith('/') &&
      !/[\\:?#]|%2e|%2f|%5c/i.test(value) &&
      ![...value].some((character) => character.charCodeAt(0) < 32) &&
      !value.split('/').some((part) => part === '.' || part === '..')
    );
  }
  private photoId(photo: SeedRow): number {
    const id = Number(photo.id);
    if (!Number.isSafeInteger(id) || id < 1) this.unavailable();
    return id;
  }
  private locationKey(value: unknown): string {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1
    )
      this.unavailable();
    return String(value);
  }
}
