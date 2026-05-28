import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AgregarMiembroEquipoDto } from '../api/dto/agregar-miembro-equipo.dto';
import { RolEnSubcampania } from '../domain/enums/rol-en-subcampania.enum';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasEquipoService } from '../application/subcampanias-equipo.service';

function buildAuthService(rol: string): SubcampaniasAuthService {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (String(r ?? '').toUpperCase() !== 'ADMIN')
        throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
}

function buildSupabaseAgregar(opts: {
  subcampaniaRow: any;
  insertResult?: { data: any; error: any };
}): SupabaseService {
  const subSingle = jest
    .fn()
    .mockResolvedValue(
      opts.subcampaniaRow
        ? { data: opts.subcampaniaRow, error: null }
        : { data: null, error: { message: 'nf' } },
    );
  const subIs = jest.fn().mockReturnValue({ single: subSingle });
  const subEq = jest.fn().mockReturnValue({ is: subIs });
  const subSelect = jest.fn().mockReturnValue({ eq: subEq });

  const insertSingle = jest
    .fn()
    .mockResolvedValue(
      opts.insertResult ?? {
        data: {
          id: 10,
          usuario_id: 7,
          rol: 'OPERARIO',
          agregado_at: '2026-05-27T00:00:00Z',
        },
        error: null,
      },
    );
  const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });

  return {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'subcampania') return { select: subSelect };
        if (table === 'subcampania_equipo') return { insert };
        return {};
      }),
    }),
  } as unknown as SupabaseService;
}

function buildSupabaseQuitar(opts: {
  subcampaniaRow: any;
  miembroRow?: any;
  deleteError?: any;
}): SupabaseService {
  const subSingle = jest
    .fn()
    .mockResolvedValue(
      opts.subcampaniaRow
        ? { data: opts.subcampaniaRow, error: null }
        : { data: null, error: { message: 'nf' } },
    );
  const subIs = jest.fn().mockReturnValue({ single: subSingle });
  const subEq = jest.fn().mockReturnValue({ is: subIs });
  const subSelect = jest.fn().mockReturnValue({ eq: subEq });

  const miembroMaybeSingle = jest
    .fn()
    .mockResolvedValue({ data: opts.miembroRow ?? null, error: null });
  const miembroEq2 = jest
    .fn()
    .mockReturnValue({ maybeSingle: miembroMaybeSingle });
  const miembroEq1 = jest.fn().mockReturnValue({ eq: miembroEq2 });
  const miembroSelect = jest.fn().mockReturnValue({ eq: miembroEq1 });

  const delEq2 = jest
    .fn()
    .mockResolvedValue({ error: opts.deleteError ?? null });
  const delEq1 = jest.fn().mockReturnValue({ eq: delEq2 });
  const del = jest.fn().mockReturnValue({ eq: delEq1 });

  return {
    getClient: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'subcampania') return { select: subSelect };
        if (table === 'subcampania_equipo')
          return { select: miembroSelect, delete: del };
        return {};
      }),
    }),
  } as unknown as SupabaseService;
}

const buildAgregarDto = (
  rol = RolEnSubcampania.OPERARIO,
): AgregarMiembroEquipoDto => ({
  usuario_id: 7,
  rol,
});

describe('SubcampaniasEquipoService.agregar', () => {
  it('agrega correctamente un OPERARIO', async () => {
    const supabase = buildSupabaseAgregar({ subcampaniaRow: { id: 1 } });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const result = await service.agregar(1, buildAgregarDto(), 'auth-1');
    expect(result.success).toBe(true);
  });

  it('lanza 422 cuando ya existe un COORDINADOR (23505)', async () => {
    const supabase = buildSupabaseAgregar({
      subcampaniaRow: { id: 1 },
      insertResult: {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      },
    });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(
      service.agregar(1, buildAgregarDto(RolEnSubcampania.COORDINADOR), 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('lanza 422 cuando el usuario ya pertenece al equipo (23505 con OPERARIO)', async () => {
    const supabase = buildSupabaseAgregar({
      subcampaniaRow: { id: 1 },
      insertResult: {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates subcampania_equipo_uq',
        },
      },
    });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(
      service.agregar(1, buildAgregarDto(RolEnSubcampania.OPERARIO), 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('lanza 404 si la subcampaña no existe', async () => {
    const supabase = buildSupabaseAgregar({ subcampaniaRow: null });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(
      service.agregar(99, buildAgregarDto(), 'auth-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabaseAgregar({ subcampaniaRow: { id: 1 } });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('GENERAL'),
    );
    await expect(
      service.agregar(1, buildAgregarDto(), 'auth-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('SubcampaniasEquipoService.quitar', () => {
  it('quita un miembro OPERARIO correctamente', async () => {
    const supabase = buildSupabaseQuitar({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
      miembroRow: { id: 50, rol: 'OPERARIO' },
    });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const result = await service.quitar(1, 7, 'auth-1');
    expect(result.success).toBe(true);
  });

  it('lanza 422 al quitar al COORDINADOR si la subcampaña está ACTIVA', async () => {
    const supabase = buildSupabaseQuitar({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
      miembroRow: { id: 50, rol: 'COORDINADOR' },
    });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.quitar(1, 7, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('permite quitar al COORDINADOR si la subcampaña está en BORRADOR', async () => {
    const supabase = buildSupabaseQuitar({
      subcampaniaRow: { id: 1, estado: 'BORRADOR' },
      miembroRow: { id: 50, rol: 'COORDINADOR' },
    });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    const result = await service.quitar(1, 7, 'auth-1');
    expect(result.success).toBe(true);
  });

  it('lanza 404 si el miembro no pertenece al equipo', async () => {
    const supabase = buildSupabaseQuitar({
      subcampaniaRow: { id: 1, estado: 'ACTIVA' },
      miembroRow: null,
    });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.quitar(1, 999, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza 404 si la subcampaña no existe', async () => {
    const supabase = buildSupabaseQuitar({ subcampaniaRow: null });
    const service = new SubcampaniasEquipoService(
      supabase,
      buildAuthService('ADMIN'),
    );
    await expect(service.quitar(99, 7, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
