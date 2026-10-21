import {
  ForbiddenException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasAuthService } from '../application/campanias-auth.service';
import { CampaniasEdicionService } from '../application/campanias-edicion.service';

type SubcampaniaCountArgs = {
  soloVivas?: boolean;
  excluyeCanceladas?: boolean;
};

/**
 * Mock de Supabase para el edicion service.
 * - Primera consulta a `campania`: fetch de la campaña actual (con `.single()`).
 * - Segunda consulta a `subcampania`: count con `.select('*', { count: 'exact', head: true })`.
 * - Tercera consulta a `campania`: update final (con `.single()` cuando editar, sin cuando borrar).
 */
function buildSupabase(config: {
  campaniaActual: { id: number; tipo: string } | null;
  subcampaniaCount: number;
  updateResult?: { data: any; error: any };
  updateBorrarError?: any;
}) {
  const subcampaniaFilters: SubcampaniaCountArgs = {};

  const fromMock = jest.fn((tabla: string) => {
    if (tabla === 'campania') {
      // Cada llamada a `.from('campania')` puede ser fetch inicial o update.
      // Diferenciamos por método invocado.
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: config.campaniaActual,
                error: config.campaniaActual ? null : { message: 'not found' },
              }),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue(
                config.updateResult ?? {
                  data: { id: config.campaniaActual?.id },
                  error: null,
                },
              ),
            }),
            // Para el path de borrar (sin .select().single())
            then: undefined,
          }),
        }),
      } as any;
    }
    if (tabla === 'subcampania') {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.is = jest.fn((field: string, value: unknown) => {
        if (field === 'deleted_at' && value === null) {
          subcampaniaFilters.soloVivas = true;
        }
        return chain;
      });
      chain.neq = jest.fn((field: string, value: unknown) => {
        if (field === 'estado' && value === 'CANCELADA') {
          subcampaniaFilters.excluyeCanceladas = true;
        }
        // El count se resuelve al await del thenable.
        return Promise.resolve({ count: config.subcampaniaCount, error: null });
      });
      // Cuando no hay .neq (path de editar - tipo), el thenable se resuelve al await de chain.
      chain.then = (onResolve: any) =>
        onResolve({ count: config.subcampaniaCount, error: null });
      return chain;
    }
    throw new Error(`Tabla no mockeada: ${tabla}`);
  });

  const supabase = {
    getAdminClient: jest.fn().mockReturnValue({ from: fromMock }),
    getClient: jest.fn(() => {
      throw new Error('El cliente público no tiene permisos de escritura.');
    }),
  } as unknown as SupabaseService;

  return { supabase, subcampaniaFilters, from: fromMock };
}

function buildAuthService(rol: string): CampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (r.toUpperCase() !== 'ADMIN') throw new ForbiddenException();
    }),
  } as unknown as CampaniasAuthService;
}

describe('CampaniasEdicionService.editar (RN-PLA-38)', () => {
  it('edita nombre/descripcion/fechas con subcampañas aunque el cliente público no pueda escribir', async () => {
    const { supabase } = buildSupabase({
      campaniaActual: { id: 10, tipo: 'REFORESTACION' },
      subcampaniaCount: 5,
      updateResult: { data: { id: 10 }, error: null },
    });
    const service = new CampaniasEdicionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.editar(
      10,
      {
        nombre: 'Nuevo nombre',
        descripcion: 'Otra descripcion',
        fecha_estimada_inicio: '2026-01-01',
        fecha_estimada_fin: '2026-12-31',
      } as any,
      'auth-1',
    );

    expect(result.success).toBe(true);
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it('bloquea cambio de tipo con 422 cuando existe cualquier subcampaña (incluye soft-deleted)', async () => {
    const { supabase, subcampaniaFilters } = buildSupabase({
      campaniaActual: { id: 10, tipo: 'REFORESTACION' },
      subcampaniaCount: 1,
    });
    const service = new CampaniasEdicionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    await expect(
      service.editar(10, { tipo: 'ARBORIZACION' } as any, 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);

    // La verificación de tipo NO filtra por deleted_at IS NULL: cuenta todas.
    expect(subcampaniaFilters.soloVivas).toBeUndefined();
  });

  it('permite cambiar tipo cuando no hay ninguna subcampaña asociada', async () => {
    const { supabase } = buildSupabase({
      campaniaActual: { id: 10, tipo: 'REFORESTACION' },
      subcampaniaCount: 0,
      updateResult: { data: { id: 10, tipo: 'ARBORIZACION' }, error: null },
    });
    const service = new CampaniasEdicionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.editar(
      10,
      { tipo: 'ARBORIZACION' } as any,
      'auth-1',
    );

    expect(result.success).toBe(true);
  });
});

describe('CampaniasEdicionService.borrar soft-delete (RN-PLA-38)', () => {
  it('desactiva sin subcampañas vivas aunque el cliente público no pueda escribir', async () => {
    const { supabase, subcampaniaFilters } = buildSupabase({
      campaniaActual: { id: 10, tipo: 'REFORESTACION' },
      subcampaniaCount: 0,
    });
    const service = new CampaniasEdicionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.borrar(10, 'auth-1');
    expect(result.success).toBe(true);
    // El filtro de count debe excluir CANCELADA y considerar solo vivas.
    expect(subcampaniaFilters.soloVivas).toBe(true);
    expect(subcampaniaFilters.excluyeCanceladas).toBe(true);
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it('permite desactivar cuando todas las subcampañas están CANCELADA (count=0 tras filtros)', async () => {
    const { supabase } = buildSupabase({
      campaniaActual: { id: 10, tipo: 'REFORESTACION' },
      subcampaniaCount: 0,
    });
    const service = new CampaniasEdicionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    const result = await service.borrar(10, 'auth-1');
    expect(result.success).toBe(true);
  });

  it('bloquea con 422 si existe alguna subcampaña no cancelada', async () => {
    const { supabase } = buildSupabase({
      campaniaActual: { id: 10, tipo: 'REFORESTACION' },
      subcampaniaCount: 1,
    });
    const service = new CampaniasEdicionService(
      supabase,
      buildAuthService('ADMIN'),
    );

    await expect(service.borrar(10, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('CampaniasEdicionService: autoridad y ausencia del cliente privado', () => {
  it.each(['editar', 'borrar'] as const)(
    '%s conserva ADMIN antes de consultar o escribir',
    async (operation) => {
      const { supabase, from } = buildSupabase({
        campaniaActual: { id: 10, tipo: 'REFORESTACION' },
        subcampaniaCount: 0,
      });
      const service = new CampaniasEdicionService(
        supabase,
        buildAuthService('GENERAL'),
      );
      const result =
        operation === 'editar'
          ? service.editar(10, { nombre: 'Nombre propuesto' }, 'auth-1')
          : service.borrar(10, 'auth-1');

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(from).not.toHaveBeenCalled();
      expect(supabase.getAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(['editar', 'borrar'] as const)(
    '%s falla antes de DML si falta cliente privado, sin fallback público',
    async (operation) => {
      const { supabase, from } = buildSupabase({
        campaniaActual: { id: 10, tipo: 'REFORESTACION' },
        subcampaniaCount: 0,
      });
      const failure = new InternalServerErrorException(
        'Cliente privado no disponible.',
      );
      jest.mocked(supabase.getAdminClient).mockImplementation(() => {
        throw failure;
      });
      const service = new CampaniasEdicionService(
        supabase,
        buildAuthService('ADMIN'),
      );
      const result =
        operation === 'editar'
          ? service.editar(10, { nombre: 'Nombre propuesto' }, 'auth-1')
          : service.borrar(10, 'auth-1');

      await expect(result).rejects.toBe(failure);
      expect(from).not.toHaveBeenCalled();
      expect(supabase.getClient).not.toHaveBeenCalled();
    },
  );
});
