import { SupabaseService } from '../supabase/supabase.service';
import { ImpactService } from './impact.service';

type QueryResult = { data?: unknown; error?: unknown };

type BuilderMethod =
  | 'select'
  | 'eq'
  | 'in'
  | 'is'
  | 'ilike'
  | 'order'
  | 'range';

type QueryBuilderMock = Promise<QueryResult> &
  Record<BuilderMethod, jest.Mock> & {
    maybeSingle: () => Promise<QueryResult>;
  };

function makeBuilder(result: QueryResult): QueryBuilderMock {
  const builder = Promise.resolve(result) as QueryBuilderMock;
  const methods: BuilderMethod[] = [
    'select',
    'eq',
    'in',
    'is',
    'ilike',
    'order',
    'range',
  ];
  methods.forEach((method) => {
    builder[method] = jest.fn().mockReturnValue(builder);
  });
  builder.maybeSingle = () => Promise.resolve(result);
  return builder;
}

function makeSupabase(
  byTable: Record<string, QueryResult | QueryResult[]>,
  polygons: Record<number, unknown> = {},
) {
  const counters: Record<string, number> = {};
  const from = jest.fn((table: string) => {
    const configured = byTable[table];
    if (configured === undefined) throw new Error(`No mock for ${table}`);
    const index = counters[table] ?? 0;
    counters[table] = index + 1;
    const result = Array.isArray(configured)
      ? (configured[index] ?? configured[configured.length - 1])
      : configured;
    return makeBuilder(result);
  });
  const client = {
    from,
    rpc: jest.fn((_name: string, args: { p_id: number }) =>
      Promise.resolve({ data: polygons[args.p_id] ?? null, error: null }),
    ),
    storage: {
      from: jest.fn(() => ({
        getPublicUrl: jest.fn((path: string) => ({
          data: { publicUrl: `https://storage.example/${path}` },
        })),
      })),
    },
  };
  return {
    supabase: {
      getClient: jest.fn().mockReturnValue(client),
    } as unknown as SupabaseService,
    client,
  };
}

describe('ImpactService', () => {
  it('lista solamente el perfil público mínimo de organizaciones activas', async () => {
    const { supabase } = makeSupabase({
      organizacion: {
        data: [{ id: 3, nombre: 'Bosque SA', logo_url: 'https://logo' }],
        error: null,
      },
    });
    const service = new ImpactService(supabase);

    await expect(service.listOrganizations()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 3,
          name: 'Bosque SA',
          logo: 'https://logo',
          description: null,
        },
      ],
    });
  });

  it('devuelve un dashboard vacío cuando la organización aún no tiene campañas', async () => {
    const { supabase } = makeSupabase({
      organizacion: {
        data: { id: 3, nombre: 'Bosque SA', logo_url: null },
        error: null,
      },
      campania_organizacion: { data: [], error: null },
    });
    const service = new ImpactService(supabase);

    const response = await service.getOrganizationDashboard(3);

    expect(response.data.summary).toMatchObject({
      campaignsCount: 0,
      subcampaignsCount: 0,
      treesTarget: 0,
      treesPlantedInitial: 0,
      progressPct: null,
      plantingRecordsCount: 0,
      evidenceCount: 0,
    });
    expect(response.data.map).toEqual({ plantingPoints: [], areas: [] });
    expect(response.data.speciesMix).toEqual([]);
  });

  it('agrega impacto y publica GPS/evidencia sin datos operativos internos', async () => {
    const { supabase, client } = makeSupabase(
      {
        organizacion: {
          data: { id: 3, nombre: 'Bosque SA', logo_url: null },
          error: null,
        },
        campania_organizacion: {
          data: [{ campania_id: 8 }],
          error: null,
        },
        campania: {
          data: [
            {
              id: 8,
              nombre: 'Campaña Norte',
              tipo: 'REFORESTACION',
              descripcion: 'Recuperación de bosque',
              fecha_estimada_inicio: '2026-01-01',
              fecha_estimada_fin: '2026-12-31',
              updated_at: '2026-08-01T00:00:00Z',
            },
          ],
          error: null,
        },
        campania_estado: {
          data: [{ campania_id: 8, estado_derivado: 'ACTIVA' }],
          error: null,
        },
        subcampania: {
          data: [
            {
              id: 21,
              campania_id: 8,
              nombre: 'Zona A',
              descripcion: null,
              estado: 'ACTIVA',
              fase_mantenimiento: 'NO_APLICA',
              zona_id: 4,
              nombre_zona_snapshot: 'Tiquipaya',
              area_hectareas: 2.5,
              meta_total_arboles: 100,
              total_plantado_inicial: 80,
              total_repuesto: 10,
              saldo_vivo_actual: 72,
              updated_at: '2026-08-02T00:00:00Z',
            },
          ],
          error: null,
        },
        registro_plantacion: {
          data: [
            {
              id: 31,
              subcampania_id: 21,
              fecha_plantacion: '2026-07-15',
              latitud: -17.338,
              longitud: -66.215,
              cantidad_total_plantada: 80,
              es_reposicion: false,
              gps_dentro_poligono: true,
              gps_distancia_a_poligono_m: 0,
              created_at: '2026-07-15T15:00:00Z',
            },
          ],
          error: null,
        },
        registro_plantacion_detalle: {
          data: [
            {
              registro_plantacion_id: 31,
              planta_id: 5,
              cantidad: 80,
              nombre_cientifico_snapshot: 'Polylepis subtusalbida',
              nombre_comercial_snapshot: 'Kewiña',
              planta: null,
            },
          ],
          error: null,
        },
        tipos_entidad_evidencia: {
          data: { id: 2 },
          error: null,
        },
        evidencias_trazabilidad: {
          data: [
            {
              id: 41,
              entidad_id: 31,
              codigo_trazabilidad: 'PLT-031-SUB-021',
              bucket: 'private-name',
              ruta_archivo: 'plantacion.jpg',
              titulo: 'Jornada de plantación',
              es_principal: true,
              tomado_en: '2026-07-15T14:00:00Z',
              creado_en: '2026-07-15T15:00:00Z',
            },
          ],
          error: null,
        },
      },
      {
        21: {
          type: 'Polygon',
          coordinates: [
            [
              [-66.22, -17.34],
              [-66.21, -17.34],
              [-66.22, -17.34],
            ],
          ],
        },
      },
    );
    const service = new ImpactService(supabase);

    const response = await service.getOrganizationDashboard(3);

    expect(response.data.summary).toMatchObject({
      treesTarget: 100,
      treesPlantedInitial: 80,
      treesReplanted: 10,
      treesAliveReported: 72,
      progressPct: 80,
      survivalPct: 80,
      hectares: 2.5,
      plantingRecordsCount: 1,
      evidenceCount: 1,
    });
    expect(response.data.map.plantingPoints[0]).toMatchObject({
      latitude: -17.338,
      longitude: -66.215,
      withinArea: true,
      treesPlanted: 80,
    });
    expect(response.data.evidencePreview[0]).toMatchObject({
      publicTraceabilityCode: 'PLT-031-SUB-021',
      imageUrl: 'https://storage.example/plantacion.jpg',
      title: 'Jornada de plantación',
      species: [
        {
          id: 5,
          commonName: 'Kewiña',
          scientificName: 'Polylepis subtusalbida',
          quantity: 80,
        },
      ],
    });
    expect(response.data.speciesMix).toEqual([
      {
        speciesId: 5,
        commonName: 'Kewiña',
        scientificName: 'Polylepis subtusalbida',
        taxonomyId: null,
        ecologicalCategory: null,
        origin: 'UNKNOWN',
        quantity: 80,
        quantityStage: 'PLANTED',
      },
    ]);
    expect(client.from).toHaveBeenCalledWith('registro_plantacion_detalle');

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('responsable');
    expect(serialized).not.toContain('hash_sha256');
    expect(serialized).not.toContain('private-name');
    expect(serialized).not.toContain('ruta_archivo');
  });

  it('carga especies en el detalle y resuelve una ubicación sin snapshot', async () => {
    const { supabase, client } = makeSupabase({
      organizacion: {
        data: { id: 3, nombre: 'Bosque SA', logo_url: null },
        error: null,
      },
      campania_organizacion: {
        data: [{ campania_id: 8 }],
        error: null,
      },
      campania: {
        data: [
          {
            id: 8,
            nombre: 'Campaña Norte',
            tipo: 'REFORESTACION',
            descripcion: null,
            fecha_estimada_inicio: null,
            fecha_estimada_fin: null,
            updated_at: '2026-08-01T00:00:00Z',
          },
        ],
        error: null,
      },
      campania_estado: {
        data: [{ campania_id: 8, estado_derivado: 'ACTIVA' }],
        error: null,
      },
      subcampania: {
        data: [
          {
            id: 21,
            campania_id: 8,
            nombre: 'Zona en planificación',
            descripcion: null,
            estado: 'ACTIVA',
            fase_mantenimiento: 'NO_APLICA',
            zona_id: 4,
            nombre_zona_snapshot: null,
            area_hectareas: 2,
            meta_total_arboles: 100,
            total_plantado_inicial: 10,
            total_repuesto: 0,
            saldo_vivo_actual: 10,
            updated_at: '2026-08-02T00:00:00Z',
          },
        ],
        error: null,
      },
      division_administrativa: {
        data: [{ id: 4, nombre: 'Tiquipaya' }],
        error: null,
      },
      registro_plantacion: {
        data: [
          {
            id: 31,
            subcampania_id: 21,
            fecha_plantacion: '2026-07-15',
            latitud: -17.338,
            longitud: -66.215,
            cantidad_total_plantada: 10,
            es_reposicion: false,
            gps_dentro_poligono: true,
            gps_distancia_a_poligono_m: 0,
            created_at: '2026-07-15T15:00:00Z',
          },
        ],
        error: null,
      },
      registro_plantacion_detalle: {
        data: [
          {
            registro_plantacion_id: 31,
            planta_id: 5,
            cantidad: 6,
            nombre_cientifico_snapshot: 'Polylepis subtusalbida',
            nombre_comercial_snapshot: 'Kewiña histórica',
            planta: {
              id: 5,
              especie: 'Kewiña actual',
              nombre_cientifico: 'Nombre actual',
              nombre_comun_principal: 'Kewiña actual',
            },
          },
          {
            registro_plantacion_id: 31,
            planta_id: 5,
            cantidad: 4,
            nombre_cientifico_snapshot: 'Polylepis subtusalbida',
            nombre_comercial_snapshot: 'Kewiña histórica',
            planta: {
              id: 5,
              especie: 'Kewiña actual',
              nombre_cientifico: 'Nombre actual',
              nombre_comun_principal: 'Kewiña actual',
            },
          },
        ],
        error: null,
      },
      tipos_entidad_evidencia: { data: null, error: null },
    });
    const service = new ImpactService(supabase);

    const response = await service.getCampaignDetail(3, 8);

    expect(response.data.subcampaigns[0].location).toEqual({
      id: 4,
      name: 'Tiquipaya',
    });
    expect(response.data.plantingRecords[0].species).toEqual([
      {
        id: 5,
        commonName: 'Kewiña histórica',
        scientificName: 'Polylepis subtusalbida',
        quantity: 10,
      },
    ]);
    expect(client.from).toHaveBeenCalledWith('registro_plantacion_detalle');
  });

  it('pagina y filtra la galería pública por especie y fecha', async () => {
    const { supabase, client } = makeSupabase({
      organizacion: {
        data: { id: 3, nombre: 'Bosque SA', logo_url: null },
        error: null,
      },
      campania_organizacion: {
        data: [{ campania_id: 8 }],
        error: null,
      },
      campania: {
        data: [
          {
            id: 8,
            nombre: 'Campaña Norte',
            tipo: 'REFORESTACION',
            descripcion: null,
            fecha_estimada_inicio: null,
            fecha_estimada_fin: null,
            updated_at: '2026-08-01T00:00:00Z',
          },
        ],
        error: null,
      },
      campania_estado: {
        data: [{ campania_id: 8, estado_derivado: 'ACTIVA' }],
        error: null,
      },
      subcampania: {
        data: [
          {
            id: 21,
            campania_id: 8,
            nombre: 'Zona A',
            descripcion: null,
            estado: 'ACTIVA',
            fase_mantenimiento: 'NO_APLICA',
            zona_id: 4,
            nombre_zona_snapshot: 'Tiquipaya',
            area_hectareas: 2,
            meta_total_arboles: 100,
            total_plantado_inicial: 30,
            total_repuesto: 0,
            saldo_vivo_actual: 30,
            updated_at: '2026-08-02T00:00:00Z',
          },
        ],
        error: null,
      },
      registro_plantacion: {
        data: [
          {
            id: 31,
            subcampania_id: 21,
            fecha_plantacion: '2026-07-15',
            latitud: -17.338,
            longitud: -66.215,
            cantidad_total_plantada: 20,
            es_reposicion: false,
            gps_dentro_poligono: true,
            gps_distancia_a_poligono_m: 0,
            created_at: '2026-07-15T15:00:00Z',
          },
          {
            id: 32,
            subcampania_id: 21,
            fecha_plantacion: '2026-07-17',
            latitud: -17.339,
            longitud: -66.216,
            cantidad_total_plantada: 10,
            es_reposicion: false,
            gps_dentro_poligono: true,
            gps_distancia_a_poligono_m: 0,
            created_at: '2026-07-17T15:00:00Z',
          },
        ],
        error: null,
      },
      registro_plantacion_detalle: {
        data: [
          {
            registro_plantacion_id: 31,
            planta_id: 5,
            cantidad: 20,
            nombre_cientifico_snapshot: 'Polylepis subtusalbida',
            nombre_comercial_snapshot: 'Kewiña',
            planta: null,
          },
          {
            registro_plantacion_id: 32,
            planta_id: 6,
            cantidad: 10,
            nombre_cientifico_snapshot: 'Schinus molle',
            nombre_comercial_snapshot: 'Molle',
            planta: null,
          },
        ],
        error: null,
      },
      tipos_entidad_evidencia: { data: { id: 6 }, error: null },
      evidencias_trazabilidad: {
        data: [
          {
            id: 41,
            entidad_id: 31,
            codigo_trazabilidad: 'PLT-031',
            bucket: 'evidencias',
            ruta_archivo: 'uno.jpg',
            titulo: 'Evidencia uno',
            es_principal: false,
            tomado_en: '2026-07-15T10:00:00Z',
            creado_en: '2026-07-15T10:00:00Z',
          },
          {
            id: 42,
            entidad_id: 31,
            codigo_trazabilidad: 'PLT-031',
            bucket: 'evidencias',
            ruta_archivo: 'dos.jpg',
            titulo: 'Evidencia dos',
            es_principal: false,
            tomado_en: '2026-07-16T10:00:00Z',
            creado_en: '2026-07-16T10:00:00Z',
          },
          {
            id: 43,
            entidad_id: 32,
            codigo_trazabilidad: 'PLT-032',
            bucket: 'evidencias',
            ruta_archivo: 'tres.jpg',
            titulo: 'Otra especie',
            es_principal: false,
            tomado_en: '2026-07-17T10:00:00Z',
            creado_en: '2026-07-17T10:00:00Z',
          },
        ],
        error: null,
      },
    });
    const service = new ImpactService(supabase);

    const response = await service.getEvidenceGallery(3, {
      page: 1,
      pageSize: 1,
      speciesId: 5,
      from: '2026-07-15',
      to: '2026-07-16',
    });

    expect(response.data).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(response.data.items).toEqual([
      expect.objectContaining({
        id: 42,
        publicTraceabilityCode: 'PLT-031',
        species: [expect.objectContaining({ id: 5, quantity: 20 })],
      }),
    ]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('construye una serie acumulada con plantación, mortandad y reposición', async () => {
    const { supabase, client } = makeSupabase({
      organizacion: {
        data: { id: 3, nombre: 'Bosque SA', logo_url: null },
        error: null,
      },
      campania_organizacion: {
        data: [{ campania_id: 8 }],
        error: null,
      },
      campania: {
        data: [
          {
            id: 8,
            nombre: 'Campaña Norte',
            tipo: 'REFORESTACION',
            descripcion: null,
            fecha_estimada_inicio: null,
            fecha_estimada_fin: null,
            updated_at: '2026-08-01T00:00:00Z',
          },
        ],
        error: null,
      },
      campania_estado: {
        data: [{ campania_id: 8, estado_derivado: 'ACTIVA' }],
        error: null,
      },
      subcampania: {
        data: [
          {
            id: 21,
            campania_id: 8,
            nombre: 'Zona A',
            descripcion: null,
            estado: 'ACTIVA',
            fase_mantenimiento: 'MANTENIMIENTO',
            zona_id: 4,
            nombre_zona_snapshot: 'Tiquipaya',
            area_hectareas: 2,
            meta_total_arboles: 100,
            total_plantado_inicial: 100,
            total_repuesto: 4,
            saldo_vivo_actual: 94,
            updated_at: '2026-08-02T00:00:00Z',
          },
        ],
        error: null,
      },
      registro_plantacion: {
        data: [
          {
            id: 31,
            subcampania_id: 21,
            fecha_plantacion: '2026-07-01',
            latitud: -17.338,
            longitud: -66.215,
            cantidad_total_plantada: 100,
            es_reposicion: false,
            gps_dentro_poligono: true,
            gps_distancia_a_poligono_m: 0,
            created_at: '2026-07-01T15:00:00Z',
          },
          {
            id: 32,
            subcampania_id: 21,
            fecha_plantacion: '2026-07-20',
            latitud: -17.338,
            longitud: -66.215,
            cantidad_total_plantada: 4,
            es_reposicion: true,
            gps_dentro_poligono: true,
            gps_distancia_a_poligono_m: 0,
            created_at: '2026-07-20T15:00:00Z',
          },
        ],
        error: null,
      },
      evento_plantacion: {
        data: [
          {
            id: 71,
            subcampania_id: 21,
            registro_plantacion_id: 31,
            fecha_evento: '2026-07-10T12:00:00Z',
            cantidad_muerta_delta: 10,
            created_at: '2026-07-10T12:00:00Z',
          },
        ],
        error: null,
      },
    });
    const service = new ImpactService(supabase);

    const response = await service.getMonitoringTimeline(3, { campaignId: 8 });

    expect(response.data.dataAvailability).toEqual({
      plantingRecordsCount: 2,
      mortalityReportsCount: 1,
      hasMortalityMonitoring: true,
    });
    expect(response.data.points).toEqual([
      {
        date: '2026-07-01',
        campaignId: 8,
        monitoringRecordId: 31,
        treesMonitored: 100,
        treesAlive: 100,
        deathsNew: 0,
        deathsAccumulated: 0,
        replacementsNew: 0,
        replacementsAccumulated: 0,
        source: 'PLANTING_INITIAL',
      },
      {
        date: '2026-07-10',
        campaignId: 8,
        monitoringRecordId: 71,
        treesMonitored: 100,
        treesAlive: 90,
        deathsNew: 10,
        deathsAccumulated: 10,
        replacementsNew: 0,
        replacementsAccumulated: 0,
        source: 'MORTALITY_REPORT',
      },
      {
        date: '2026-07-20',
        campaignId: 8,
        monitoringRecordId: 32,
        treesMonitored: 104,
        treesAlive: 94,
        deathsNew: 0,
        deathsAccumulated: 10,
        replacementsNew: 4,
        replacementsAccumulated: 4,
        source: 'PLANTING_REPLACEMENT',
      },
    ]);
    expect(client.from).not.toHaveBeenCalledWith('evidencias_trazabilidad');
    expect(client.from).not.toHaveBeenCalledWith('registro_plantacion_detalle');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rechaza una galería con rango de fechas invertido', async () => {
    const { supabase } = makeSupabase({});
    const service = new ImpactService(supabase);

    await expect(
      service.getEvidenceGallery(3, {
        page: 1,
        pageSize: 24,
        from: '2026-08-01',
        to: '2026-07-01',
      }),
    ).rejects.toThrow('from no puede ser posterior a to.');
  });
});
