import type { SeedRow } from '../../src/impact/seed-bank/seed-bank.types';

export const EXPLORER =
  'https://shannon-explorer.somnia.network/token/0x4bb21533f7803BBce74421f6bdfc4B6c57706EA2/instance/42';
export function seedFixture() {
  const collection = (id: number, overrides: SeedRow = {}): SeedRow => ({
    id,
    codigo_trazabilidad: `REC-FIXTURE-${id}`,
    tipo_material: 'SEMILLA',
    fecha: `2026-10-${String(id).padStart(2, '0')}`,
    cantidad_inicial_canonica: 100,
    unidad_canonica: 'G',
    saldo_actual: 0,
    estado_registro: 'VALIDADO',
    planta_id: 11,
    ubicacion_id: 1,
    planta: {
      nombre_comun_principal: 'Nombre actual',
      nombre_cientifico: 'Nombre científico actual',
      especie: 'Catálogo',
    },
    nombre_comercial_snapshot: 'Árbol histórico',
    nombre_cientifico_snapshot: 'Científico histórico',
    metodo: { nombre: 'Manual' },
    blockchain_url: null,
    token_id: null,
    transaction_hash: null,
    // El doble devuelve datos adicionales adrede para comprobar la proyección.
    usuario_id: (id % 2) + 1,
    vivero_id: (id % 3) + 1,
    correo: 'private@example.invalid',
    nombre_recolector_snapshot: 'private-person',
    observaciones: 'private-observation',
    ...overrides,
  });
  const rows = [
    collection(1, { estado_registro: 'BORRADOR' }),
    collection(2, {
      estado_registro: 'PENDIENTE_VALIDACION',
      cantidad_inicial_canonica: 200,
      saldo_actual: null,
      ubicacion_id: 2,
    }),
    collection(3, {
      cantidad_inicial_canonica: 10,
      unidad_canonica: 'UNIDAD',
      saldo_actual: 4,
      planta_id: 12,
      ubicacion_id: 2,
      nombre_comercial_snapshot: null,
      nombre_cientifico_snapshot: null,
      planta: { nombre_comun_principal: 'Cedro', nombre_cientifico: 'Cedrela' },
      blockchain_url: EXPLORER,
      token_id: '42',
      transaction_hash: `0x${'a'.repeat(64)}`,
    }),
    collection(4, {
      estado_registro: 'RECHAZADO',
      cantidad_inicial_canonica: 25,
      saldo_actual: 10,
      planta_id: 13,
      ubicacion_id: null,
      blockchain_url: 'https://ipfs.io/ipfs/metadata',
      token_id: '99',
    }),
    collection(5, {
      cantidad_inicial_canonica: 1.5,
      unidad_canonica: 'KG',
      saldo_actual: 0.25,
      planta_id: 12,
      ubicacion_id: 3,
      nombre_comercial_snapshot: null,
      planta: { nombre_comun_principal: 'Cedro' },
      blockchain_url: EXPLORER,
      token_id: '43',
    }),
    collection(6, {
      tipo_material: 'ESQUEJE',
      cantidad_inicial_canonica: 1000,
      unidad_canonica: 'UNIDAD',
      saldo_actual: 1000,
      planta_id: 14,
      ubicacion_id: 4,
    }),
    collection(7, {
      fecha: '2026-10-21',
      cantidad_inicial_canonica: 0.1,
      saldo_actual: 0.1,
    }),
    collection(8, {
      fecha: '2026-10-21',
      cantidad_inicial_canonica: 0.2,
      saldo_actual: 0.2,
    }),
  ];
  const photo = (id: number, overrides: SeedRow = {}): SeedRow => ({
    id,
    entidad_id: 3,
    tipo_entidad_id: 42,
    bucket: 'recoleccion_fotos',
    ruta_archivo: 'fixture.jpg',
    tipo_archivo: 'FOTO',
    eliminado_en: null,
    orden: 0,
    es_principal: true,
    descripcion: 'private-caption',
    metadata: { secreto: 'private-metadata' },
    ...overrides,
  });
  const tables: Record<string, SeedRow[]> = {
    recoleccion: rows,
    v_ubicacion_enriquecida: [1, 2, 3, 4].map((id) => ({
      id,
      nombre: `Lugar ${id}`,
      pais_nombre: 'Bolivia',
      division_ruta: [{ tipo: 'Comunidad', nombre: 'Comunidad pública' }],
      latitud: '-16.5',
      longitud: '-68.1',
      referencia: 'private-reference',
    })),
    tipos_entidad_evidencia: [{ id: 42, codigo: 'RECOLECCION', activo: true }],
    evidencias_trazabilidad: [
      photo(31),
      photo(32, { eliminado_en: '2026-10-21' }),
      photo(33, { entidad_id: 1 }),
      photo(34, { ruta_archivo: 'https://private.invalid/original.jpg' }),
      photo(35, { tipo_archivo: 'DOCUMENTO' }),
      photo(36, { bucket: 'participacion_evidencias' }),
      photo(37, { tipo_entidad_id: 43 }),
      photo(38, { ruta_archivo: '../private.jpg' }),
    ],
  };
  const calls: { table: string; select: string }[] = [];
  const reads: { table: string; from: number; to: number }[] = [];
  const state = {
    errorTable: '',
    throwTable: '',
    cap: 2,
    original: Buffer.from('fixture-image'),
    downloads: [] as string[],
  };
  const client = {
    from(table: string) {
      const predicates: ((row: SeedRow) => boolean)[] = [];
      const sorts: { key: string; ascending: boolean }[] = [];
      let start = 0,
        end = Number.MAX_SAFE_INTEGER;
      const result = () => {
        if (state.throwTable === table)
          throw new Error('private-infrastructure-detail');
        if (state.errorTable === table || !tables[table])
          return {
            data: null,
            error: { message: 'private-database-detail' },
            count: null,
          };
        const filtered = tables[table].filter((row) =>
          predicates.every((test) => test(row)),
        );
        filtered.sort((a, b) => {
          for (const sort of sorts) {
            const delta = Number(a[sort.key]) - Number(b[sort.key]);
            if (delta) return sort.ascending ? delta : -delta;
          }
          return 0;
        });
        return {
          data: filtered.slice(start, Math.min(end + 1, start + state.cap)),
          error: null,
          count: filtered.length,
        };
      };
      const query = {
        select(selection: string) {
          calls.push({ table, select: selection });
          return query;
        },
        eq(key: string, value: unknown) {
          predicates.push((row) => String(row[key]) === String(value));
          return query;
        },
        in(key: string, values: unknown[]) {
          predicates.push((row) =>
            values.map(String).includes(String(row[key])),
          );
          return query;
        },
        is(key: string, value: unknown) {
          predicates.push((row) => row[key] === value);
          return query;
        },
        order(key: string, options: { ascending: boolean }) {
          sorts.push({ key, ascending: options.ascending });
          return query;
        },
        range(from: number, to: number) {
          reads.push({ table, from, to });
          start = from;
          end = to;
          return query;
        },
        maybeSingle() {
          const value = result();
          return Promise.resolve({ ...value, data: value.data?.[0] ?? null });
        },
        then(
          resolve: (value: ReturnType<typeof result>) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve().then(result).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          download(path: string) {
            state.downloads.push(`${bucket}/${path}`);
            return Promise.resolve({
              data: new Blob([new Uint8Array(state.original)]),
              error: null,
            });
          },
        };
      },
    },
  };
  return { client, state, tables, calls, reads };
}
