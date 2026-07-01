import { ConflictException } from '@nestjs/common';
import { PlantasService } from './plantas.service';
import { SupabaseService } from '../supabase/supabase.service';

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

type QueryMock = {
  select: jest.Mock;
  eq: jest.Mock;
  update: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
  then: Promise<QueryResult>['then'];
};

function createQuery(result: QueryResult = {}): QueryMock {
  const promise = Promise.resolve({
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  });
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    update: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
    then: promise.then.bind(promise),
  } as QueryMock;

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  query.single.mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });

  return query;
}

function createSupabaseMock(queues: Record<string, QueryMock[]>) {
  return {
    from: jest.fn((table: string) => {
      const queue = queues[table];
      const query = queue?.shift();
      if (!query) {
        throw new Error(`No mock query configured for table ${table}`);
      }
      return query;
    }),
    storage: {
      from: jest.fn(),
    },
  };
}

describe('PlantasService', () => {
  function buildService(queues: Record<string, QueryMock[]>) {
    const supabase = createSupabaseMock(queues);
    const supabaseService = {
      getClient: jest.fn(() => supabase),
    } as unknown as SupabaseService;

    return {
      service: new PlantasService(supabaseService),
      supabase,
    };
  }

  it('desactiva una planta sin procesos activos', async () => {
    const updateQuery = createQuery({ error: null });
    const { service } = buildService({
      planta: [
        createQuery({ data: { id: 10, activo: true } }),
        updateQuery,
        createQuery({ data: { id: 10, activo: false } }),
      ],
      recoleccion: [createQuery({ data: [] })],
      lote_vivero: [createQuery({ data: [] })],
    });

    const result = await service.desactivar(10);

    expect(updateQuery.update).toHaveBeenCalledWith({ activo: false });
    expect(result).toEqual({
      success: true,
      data: { id: 10, activo: false },
    });
  });

  it('bloquea la desactivacion si la planta tiene recolecciones en proceso', async () => {
    const updateQuery = createQuery({ error: null });
    const { service } = buildService({
      planta: [createQuery({ data: { id: 10, activo: true } }), updateQuery],
      recoleccion: [
        createQuery({
          data: [
            {
              id: 1,
              estado_registro: 'VALIDADO',
              estado_operativo: 'ABIERTO',
              saldo_actual: 30,
            },
          ],
        }),
      ],
      lote_vivero: [createQuery({ data: [] })],
    });

    const action = service.desactivar(10);

    await expect(action).rejects.toThrow(ConflictException);
    await expect(action).rejects.toThrow('recoleccion(es) en proceso');
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('bloquea la desactivacion si la planta tiene lotes de vivero en proceso', async () => {
    const updateQuery = createQuery({ error: null });
    const { service } = buildService({
      planta: [createQuery({ data: { id: 10, activo: true } }), updateQuery],
      recoleccion: [createQuery({ data: [] })],
      lote_vivero: [
        createQuery({
          data: [
            {
              id: 7,
              estado_lote: 'ACTIVO',
              saldo_vivo_actual: 12,
              cantidad_inicial_en_proceso: 50,
            },
          ],
        }),
      ],
    });

    const action = service.desactivar(10);

    await expect(action).rejects.toThrow(ConflictException);
    await expect(action).rejects.toThrow('lote(s) de vivero en proceso');
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('permite desactivar si solo hay referencias historicas cerradas', async () => {
    const updateQuery = createQuery({ error: null });
    const { service } = buildService({
      planta: [
        createQuery({ data: { id: 10, activo: true } }),
        updateQuery,
        createQuery({ data: { id: 10, activo: false } }),
      ],
      recoleccion: [
        createQuery({
          data: [
            {
              id: 1,
              estado_registro: 'VALIDADO',
              estado_operativo: 'CERRADO',
              saldo_actual: 0,
            },
          ],
        }),
      ],
      lote_vivero: [
        createQuery({
          data: [
            {
              id: 7,
              estado_lote: 'FINALIZADO',
              saldo_vivo_actual: 0,
              cantidad_inicial_en_proceso: 0,
            },
          ],
        }),
      ],
    });

    await expect(service.desactivar(10)).resolves.toEqual({
      success: true,
      data: { id: 10, activo: false },
    });
    expect(updateQuery.update).toHaveBeenCalledWith({ activo: false });
  });

  it('aplica la misma validacion al actualizar activo=false', async () => {
    const updateQuery = createQuery({ error: null });
    const { service } = buildService({
      planta: [
        createQuery({
          data: {
            id: 10,
            nombre_cientifico: 'Buddleja coriacea',
            variedad: 'comun',
            activo: true,
          },
        }),
        updateQuery,
      ],
      recoleccion: [
        createQuery({
          data: [
            {
              id: 1,
              estado_registro: 'BORRADOR',
              estado_operativo: 'ABIERTO',
              saldo_actual: 10,
            },
          ],
        }),
      ],
      lote_vivero: [createQuery({ data: [] })],
    });

    await expect(service.actualizar(10, { activo: false })).rejects.toThrow(
      ConflictException,
    );
    expect(updateQuery.update).not.toHaveBeenCalled();
  });
});
