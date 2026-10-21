import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CampaniasAuthService } from '../application/campanias-auth.service';
import { CampaniasOrganizacionesService } from '../application/campanias-organizaciones.service';

function buildSupabase() {
  const campania = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          single: jest
            .fn()
            .mockResolvedValue({ data: { id: 10 }, error: null }),
        }),
      }),
    }),
  };
  const seleccion = {
    eq: jest.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ count: 1, error: null }),
  };
  seleccion.eq.mockReturnValue(seleccion);
  const borrado = {
    eq: jest.fn(),
    then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
  };
  borrado.eq.mockReturnValue(borrado);
  const insertar = jest.fn().mockResolvedValue({ error: null });
  const borrar = jest.fn().mockReturnValue(borrado);
  const from = jest.fn((table: string) => {
    if (table === 'campania') return campania;
    if (table === 'campania_organizacion') {
      return {
        insert: insertar,
        select: jest.fn().mockReturnValue(seleccion),
        delete: borrar,
      };
    }
    throw new Error(`Tabla no mockeada: ${table}`);
  });
  const supabase = {
    getAdminClient: jest.fn().mockReturnValue({ from }),
    getClient: jest.fn(() => {
      throw new Error('El cliente público no puede escribir.');
    }),
  } as unknown as SupabaseService;
  return { supabase, from, insertar, borrar, borrado };
}

function buildAuthService(rol = 'ADMIN') {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Admin', rol }),
    assertAdmin: jest.fn((role: string) => {
      if (role !== 'ADMIN') throw new ForbiddenException();
    }),
  } as unknown as CampaniasAuthService;
}

describe('CampaniasOrganizacionesService: persistencia privada', () => {
  it('asocia las organizaciones autorizadas aunque el cliente público no pueda escribir', async () => {
    const { supabase, insertar } = buildSupabase();
    const service = new CampaniasOrganizacionesService(
      supabase,
      buildAuthService(),
    );

    const result = await service.asociar(
      10,
      { organizacion_ids: [20, 21] },
      'auth-1',
    );

    expect(result.success).toBe(true);
    expect(insertar).toHaveBeenCalledWith([
      { campania_id: 10, organizacion_id: 20, created_by: 1 },
      { campania_id: 10, organizacion_id: 21, created_by: 1 },
    ]);
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it('desasocia solo la relación solicitada aunque el cliente público no pueda escribir', async () => {
    const { supabase, borrar, borrado } = buildSupabase();
    const service = new CampaniasOrganizacionesService(
      supabase,
      buildAuthService(),
    );

    const result = await service.desasociar(10, 20, 'auth-1');

    expect(result.success).toBe(true);
    expect(borrar).toHaveBeenCalledTimes(1);
    expect(borrado.eq.mock.calls).toEqual([
      ['campania_id', 10],
      ['organizacion_id', 20],
    ]);
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it.each(['asociar', 'desasociar'] as const)(
    '%s rechaza falta de ADMIN antes de consultar o escribir',
    async (operation) => {
      const { supabase, from, insertar, borrar } = buildSupabase();
      const service = new CampaniasOrganizacionesService(
        supabase,
        buildAuthService('GENERAL'),
      );
      const result =
        operation === 'asociar'
          ? service.asociar(10, { organizacion_ids: [20] }, 'auth-1')
          : service.desasociar(10, 20, 'auth-1');

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(from).not.toHaveBeenCalled();
      expect(insertar).not.toHaveBeenCalled();
      expect(borrar).not.toHaveBeenCalled();
      expect(supabase.getAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(['asociar', 'desasociar'] as const)(
    '%s falla antes de DML sin cliente privado y sin fallback',
    async (operation) => {
      const { supabase, from, insertar, borrar } = buildSupabase();
      const failure = new InternalServerErrorException(
        'Cliente privado no disponible.',
      );
      jest.mocked(supabase.getAdminClient).mockImplementation(() => {
        throw failure;
      });
      const service = new CampaniasOrganizacionesService(
        supabase,
        buildAuthService(),
      );
      const result =
        operation === 'asociar'
          ? service.asociar(10, { organizacion_ids: [20] }, 'auth-1')
          : service.desasociar(10, 20, 'auth-1');

      await expect(result).rejects.toBe(failure);
      expect(from).not.toHaveBeenCalled();
      expect(insertar).not.toHaveBeenCalled();
      expect(borrar).not.toHaveBeenCalled();
      expect(supabase.getClient).not.toHaveBeenCalled();
    },
  );
});
