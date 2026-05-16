import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ViveroConsultasService } from '../application/vivero-consultas.service';
import { EstadoLoteVivero } from '../domain/enums/estado-lote-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { ViveroTimelineService } from '../application/vivero-timeline.service';

function createQueryMock(response: any) {
  const query: any = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return query;
}

describe('ViveroConsultasService', () => {
  let from: jest.Mock;
  let query: any;
  let service: ViveroConsultasService;

  beforeEach(() => {
    query = createQueryMock({
      data: [
        {
          id: '101',
          codigo_trazabilidad: 'VIV-000101-REC-000010',
          estado_lote: 'ACTIVO',
          motivo_cierre: null,
          recoleccion_id: '10',
          planta_id: '5',
          vivero_id: '2',
          responsable_id: '77',
          nombre_cientifico_snapshot: 'Cedrela odorata',
          nombre_comercial_snapshot: 'Cedro',
          tipo_material_snapshot: 'SEMILLA',
          variedad_snapshot: 'Local',
          nombre_comunidad_origen_snapshot: 'Comunidad A',
          nombre_responsable_snapshot: 'Responsable Vivero',
          fecha_inicio: '2026-04-20',
          cantidad_inicial_en_proceso: '8',
          unidad_medida_inicial: 'UNIDAD',
          plantas_vivas_iniciales: null,
          saldo_vivo_actual: null,
          subetapa_actual: null,
          created_at: '2026-04-20T10:00:00Z',
          updated_at: '2026-04-20T10:00:00Z',
          vivero: { id: 2, codigo: 'VIV-CENTRAL', nombre: 'Vivero Central' },
          recoleccion: {
            id: 10,
            codigo_trazabilidad: 'REC-000010',
            fecha: '2026-04-18',
            tipo_material: 'SEMILLA',
            estado_registro: 'VALIDADO',
            estado_operativo: 'ABIERTO',
            saldo_actual: 2,
            unidad_canonica: 'UNIDAD',
          },
          planta: {
            id: 5,
            especie: 'Cedrela odorata',
            nombre_cientifico: 'Cedrela odorata',
            nombre_comun_principal: 'Cedro',
            variedad: 'Local',
            imagen_url: null,
          },
          responsable: {
            id: 77,
            nombre: 'Responsable',
            apellido: 'Vivero',
            username: 'rvivero',
            correo: 'rvivero@example.com',
          },
        },
      ],
      error: null,
      count: 1,
    });
    from = jest.fn().mockReturnValue(query);

    const supabaseService = {
      getClient: jest.fn().mockReturnValue({ from }),
    } as unknown as SupabaseService;

    const timelineService = {} as unknown as ViveroTimelineService;
    service = new ViveroConsultasService(supabaseService, timelineService);
  });

  it('lista lotes con paginacion por defecto y mapea el resumen para frontend', async () => {
    const result = await service.listarLotes({});

    expect(from).toHaveBeenCalledWith('lote_vivero');
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('vivero:vivero_id'),
      { count: 'exact' },
    );
    expect(query.order).toHaveBeenNthCalledWith(1, 'fecha_inicio', {
      ascending: false,
    });
    expect(query.order).toHaveBeenNthCalledWith(2, 'created_at', {
      ascending: false,
    });
    expect(query.order).toHaveBeenNthCalledWith(3, 'id', { ascending: false });
    expect(query.range).toHaveBeenCalledWith(0, 19);
    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: 101,
          codigo_trazabilidad: 'VIV-000101-REC-000010',
          estado_lote: 'ACTIVO',
          recoleccion_id: 10,
          planta_id: 5,
          vivero_id: 2,
          responsable_id: 77,
          cantidad_inicial_en_proceso: 8,
          unidad_medida_inicial: 'UNIDAD',
          saldo_vivo_actual: null,
          stock_vivo_actual: null,
          vivero: { id: 2, codigo: 'VIV-CENTRAL', nombre: 'Vivero Central' },
        }),
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
  });

  it('aplica filtros soportados por el endpoint de listado', async () => {
    await service.listarLotes({
      page: 2,
      limit: 10,
      estado_lote: EstadoLoteVivero.ACTIVO,
      vivero_id: 2,
      recoleccion_id: 10,
      lote_vivero_id: 101,
      motivo_cierre: MotivoCierreLote.DESPACHO_TOTAL,
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-06-30',
      q: 'Cedro',
    });

    expect(query.eq).toHaveBeenCalledWith('estado_lote', 'ACTIVO');
    expect(query.eq).toHaveBeenCalledWith('vivero_id', 2);
    expect(query.eq).toHaveBeenCalledWith('recoleccion_id', 10);
    expect(query.eq).toHaveBeenCalledWith('id', 101);
    expect(query.eq).toHaveBeenCalledWith('motivo_cierre', 'DESPACHO_TOTAL');
    expect(query.gte).toHaveBeenCalledWith('fecha_inicio', '2026-01-01');
    expect(query.lte).toHaveBeenCalledWith('fecha_inicio', '2026-06-30');
    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining('codigo_trazabilidad.ilike.%Cedro%'),
    );
    expect(query.range).toHaveBeenCalledWith(10, 19);
  });

  it('traduce errores de Supabase a InternalServerErrorException', async () => {
    query = createQueryMock({
      data: null,
      error: { message: 'database unavailable' },
      count: null,
    });
    from.mockReturnValue(query);

    await expect(service.listarLotes({})).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

function createDetailQueryMock(loteResponse: any, eventosResponse: any) {
  const loteQuery: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(loteResponse),
  };

  const eventosQuery: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) =>
      Promise.resolve(eventosResponse).then(resolve, reject),
  };

  const from = jest.fn((table: string) => {
    if (table === 'lote_vivero') return loteQuery;
    if (table === 'evento_lote_vivero') return eventosQuery;
    throw new Error(`Unexpected table in test: ${table}`);
  });

  return { from, loteQuery, eventosQuery };
}

const baseLoteRow = {
  id: '101',
  codigo_trazabilidad: 'VIV-000101-REC-000010',
  estado_lote: 'ACTIVO',
  motivo_cierre: null,
  recoleccion_id: '10',
  planta_id: '5',
  vivero_id: '2',
  responsable_id: '77',
  nombre_cientifico_snapshot: 'Cedrela odorata',
  nombre_comercial_snapshot: 'Cedro',
  tipo_material_snapshot: 'SEMILLA',
  variedad_snapshot: 'Local',
  nombre_comunidad_origen_snapshot: 'Comunidad A',
  nombre_responsable_snapshot: 'Responsable Vivero',
  fecha_inicio: '2026-04-20',
  cantidad_inicial_en_proceso: '8',
  unidad_medida_inicial: 'UNIDAD',
  plantas_vivas_iniciales: 200,
  saldo_vivo_actual: 180,
  subetapa_actual: 'MEDIA_SOMBRA',
  created_at: '2026-04-20T10:00:00Z',
  updated_at: '2026-05-01T10:00:00Z',
  vivero: null,
  recoleccion: null,
  planta: null,
  responsable: null,
};

describe('ViveroConsultasService.obtenerDetalle', () => {
  let from: jest.Mock;
  let service: ViveroConsultasService;

  function buildService(loteResp: any, eventosResp: any) {
    const mocks = createDetailQueryMock(loteResp, eventosResp);
    from = mocks.from;
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({ from }),
    } as unknown as SupabaseService;
    const timelineService = {} as unknown as ViveroTimelineService;
    service = new ViveroConsultasService(supabaseService, timelineService);
    return mocks;
  }

  it('devuelve el detalle del lote con ultimo_evento_por_tipo poblado a partir de eventos ordenados DESC', async () => {
    const eventos = [
      // Ordenados DESC por fecha (lo que devuelve PostgREST con order()).
      {
        id: '904',
        tipo_evento: 'MERMA',
        fecha_evento: '2026-05-08',
        created_at: '2026-05-08T11:00:00Z',
        responsable_id: '77',
        cantidad_afectada: 5,
        unidad_medida_evento: 'UNIDAD',
        saldo_vivo_antes: 185,
        saldo_vivo_despues: 180,
        subetapa_destino: null,
        causa_merma: 'PLAGA',
        destino_tipo: null,
        destino_referencia: null,
        motivo_cierre_calculado: null,
      },
      {
        id: '903',
        tipo_evento: 'MERMA',
        fecha_evento: '2026-05-05',
        created_at: '2026-05-05T11:00:00Z',
        responsable_id: '77',
        cantidad_afectada: 10,
        unidad_medida_evento: 'UNIDAD',
        saldo_vivo_antes: 195,
        saldo_vivo_despues: 185,
        subetapa_destino: null,
        causa_merma: 'SEQUIA',
        destino_tipo: null,
        destino_referencia: null,
        motivo_cierre_calculado: null,
      },
      {
        id: '902',
        tipo_evento: 'ADAPTABILIDAD',
        fecha_evento: '2026-05-01',
        created_at: '2026-05-01T11:00:00Z',
        responsable_id: '77',
        cantidad_afectada: 200,
        unidad_medida_evento: 'UNIDAD',
        saldo_vivo_antes: 200,
        saldo_vivo_despues: 200,
        subetapa_destino: 'MEDIA_SOMBRA',
        causa_merma: null,
        destino_tipo: null,
        destino_referencia: null,
        motivo_cierre_calculado: null,
      },
      {
        id: '901',
        tipo_evento: 'EMBOLSADO',
        fecha_evento: '2026-04-25',
        created_at: '2026-04-25T10:00:00Z',
        responsable_id: '77',
        cantidad_afectada: 200,
        unidad_medida_evento: 'UNIDAD',
        saldo_vivo_antes: null,
        saldo_vivo_despues: 200,
        subetapa_destino: null,
        causa_merma: null,
        destino_tipo: null,
        destino_referencia: null,
        motivo_cierre_calculado: null,
      },
      {
        id: '900',
        tipo_evento: 'INICIO',
        fecha_evento: '2026-04-20',
        created_at: '2026-04-20T10:00:00Z',
        responsable_id: '77',
        cantidad_afectada: 8,
        unidad_medida_evento: 'UNIDAD',
        saldo_vivo_antes: null,
        saldo_vivo_despues: null,
        subetapa_destino: null,
        causa_merma: null,
        destino_tipo: null,
        destino_referencia: null,
        motivo_cierre_calculado: null,
      },
    ];

    const mocks = buildService(
      { data: baseLoteRow, error: null },
      { data: eventos, error: null },
    );

    const result = await service.obtenerDetalle(101);

    expect(from).toHaveBeenCalledWith('lote_vivero');
    expect(from).toHaveBeenCalledWith('evento_lote_vivero');
    expect(mocks.loteQuery.eq).toHaveBeenCalledWith('id', 101);
    expect(mocks.eventosQuery.eq).toHaveBeenCalledWith('lote_id', 101);
    expect(mocks.eventosQuery.order).toHaveBeenNthCalledWith(1, 'fecha_evento', {
      ascending: false,
    });
    expect(mocks.eventosQuery.order).toHaveBeenNthCalledWith(2, 'created_at', {
      ascending: false,
    });
    expect(mocks.eventosQuery.order).toHaveBeenNthCalledWith(3, 'id', {
      ascending: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 101,
        codigo_trazabilidad: 'VIV-000101-REC-000010',
        saldo_vivo_actual: 180,
        subetapa_actual: 'MEDIA_SOMBRA',
      }),
    );
    // El primer match por tipo gana → MERMA debe ser el evento mas reciente (904).
    expect(result.data.ultimo_evento_por_tipo.MERMA).toEqual(
      expect.objectContaining({ id: 904, fecha_evento: '2026-05-08' }),
    );
    expect(result.data.ultimo_evento_por_tipo.EMBOLSADO).toEqual(
      expect.objectContaining({ id: 901, fecha_evento: '2026-04-25' }),
    );
    expect(result.data.ultimo_evento_por_tipo.INICIO).toEqual(
      expect.objectContaining({ id: 900 }),
    );
    expect(result.data.ultimo_evento_por_tipo.ADAPTABILIDAD).toEqual(
      expect.objectContaining({ subetapa_destino: 'MEDIA_SOMBRA' }),
    );
    expect(result.data.ultimo_evento_por_tipo.DESPACHO).toBeNull();
    expect(result.data.ultimo_evento_por_tipo.CIERRE_AUTOMATICO).toBeNull();
  });

  it('devuelve null en todos los tipos cuando el lote no tiene eventos', async () => {
    buildService(
      { data: baseLoteRow, error: null },
      { data: [], error: null },
    );

    const result = await service.obtenerDetalle(101);

    expect(result.data.ultimo_evento_por_tipo).toEqual({
      INICIO: null,
      EMBOLSADO: null,
      ADAPTABILIDAD: null,
      MERMA: null,
      DESPACHO: null,
      CIERRE_AUTOMATICO: null,
    });
  });

  it('lanza NotFoundException cuando el lote no existe', async () => {
    buildService({ data: null, error: null }, { data: [], error: null });

    await expect(service.obtenerDetalle(999)).rejects.toThrow(NotFoundException);
  });

  it('lanza InternalServerErrorException si Supabase falla leyendo el lote', async () => {
    buildService(
      { data: null, error: { message: 'database unavailable' } },
      { data: [], error: null },
    );

    await expect(service.obtenerDetalle(101)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('lanza InternalServerErrorException si Supabase falla leyendo eventos', async () => {
    buildService(
      { data: baseLoteRow, error: null },
      { data: null, error: { message: 'eventos boom' } },
    );

    await expect(service.obtenerDetalle(101)).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
