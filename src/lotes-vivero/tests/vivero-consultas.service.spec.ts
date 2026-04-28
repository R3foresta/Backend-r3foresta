import { InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ViveroConsultasService } from '../application/vivero-consultas.service';
import { EstadoLoteVivero } from '../domain/enums/estado-lote-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';

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

    service = new ViveroConsultasService(supabaseService);
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
