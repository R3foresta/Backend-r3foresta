import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearOrganizacionDto } from '../dto/crear-organizacion.dto';
import { EditarOrganizacionDto } from '../dto/editar-organizacion.dto';
import { TipoOrganizacion } from '../enums/tipo-organizacion.enum';
import { OrganizacionesAuthService } from '../organizaciones-auth.service';
import { OrganizacionesLogoService } from '../organizaciones-logo.service';
import { OrganizacionesService } from '../organizaciones.service';

type QueryResult = { data?: any; error?: any; count?: number };

function makeBuilder(result: QueryResult) {
  const builder: any = {};
  [
    'insert',
    'update',
    'delete',
    'select',
    'eq',
    'in',
    'is',
    'order',
    'ilike',
    'or',
    'range',
  ].forEach((m) => {
    builder[m] = jest.fn().mockReturnValue(builder);
  });
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (onFulfilled?: any, onRejected?: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function makeSupabase(byTable: Record<string, QueryResult | QueryResult[]>) {
  const counters: Record<string, number> = {};
  const builders: Record<string, any[]> = {};
  const fromMock = jest.fn((table: string) => {
    const value = byTable[table];
    if (value === undefined) {
      throw new Error(`No mock for table ${table}`);
    }
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const result = Array.isArray(value)
      ? (value[idx] ?? value[value.length - 1])
      : value;
    const builder = makeBuilder(result);
    if (!builders[table]) builders[table] = [];
    builders[table].push(builder);
    return builder;
  });
  const supabase = {
    getClient: jest.fn().mockReturnValue({ from: fromMock }),
  } as unknown as SupabaseService;
  return { supabase, fromMock, builders };
}

function buildAuthService(rol: string) {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (String(r).toUpperCase() !== 'ADMIN') {
        throw new ForbiddenException(
          'Solo el rol ADMIN puede realizar esta operacion.',
        );
      }
    }),
  } as unknown as OrganizacionesAuthService;
}

function buildLogoService(
  overrides: Partial<Record<keyof OrganizacionesLogoService, any>> = {},
) {
  return {
    subir: jest
      .fn()
      .mockResolvedValue(
        'https://x.supabase.co/storage/v1/object/public/organizaciones/org-1-1.png',
      ),
    eliminarPorUrl: jest.fn().mockResolvedValue(undefined),
    extraerPath: jest.fn(),
    ...overrides,
  } as unknown as OrganizacionesLogoService;
}

const baseOrg = {
  id: 1,
  nombre: 'Org Test',
  tipo: 'ONG',
  activo: true,
  logo_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('OrganizacionesService.crear', () => {
  function dto(
    overrides: Partial<CrearOrganizacionDto> = {},
  ): CrearOrganizacionDto {
    return {
      nombre: 'Org Test',
      tipo: TipoOrganizacion.ONG,
      ...overrides,
    } as CrearOrganizacionDto;
  }

  it('crea organizacion sin logo y devuelve datos', async () => {
    const { supabase, fromMock } = makeSupabase({
      organizacion: { data: baseOrg, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    const result = await service.crear(dto(), 'auth-1');

    expect(result.success).toBe(true);
    expect((result as any).data.id).toBe(1);
    expect(fromMock).toHaveBeenCalledWith('organizacion');
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const { supabase } = makeSupabase({
      organizacion: { data: null, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('GENERAL'),
      buildLogoService(),
    );

    await expect(service.crear(dto(), 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lanza UnprocessableEntityException si nombre duplicado (23505)', async () => {
    const { supabase } = makeSupabase({
      organizacion: {
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    await expect(service.crear(dto(), 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('sube el logo y persiste la URL en un segundo update', async () => {
    const inserted = { ...baseOrg };
    const updated = {
      ...baseOrg,
      logo_url:
        'https://x.supabase.co/storage/v1/object/public/organizaciones/org-1-1.png',
    };
    const { supabase } = makeSupabase({
      organizacion: [
        { data: inserted, error: null },
        { data: updated, error: null },
      ],
    });
    const logoService = buildLogoService();
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      logoService,
    );

    const file = { mimetype: 'image/png', buffer: Buffer.from('x') } as any;
    const result = await service.crear(dto(), 'auth-1', file);

    expect(logoService.subir).toHaveBeenCalledWith(1, file);
    expect((result as any).data.logo_url).toContain('org-1-1.png');
  });
});

describe('OrganizacionesService.listar', () => {
  it('aplica los filtros activo y tipo al query', async () => {
    const rows = [
      { ...baseOrg, id: 1 },
      { ...baseOrg, id: 2 },
    ];
    const { supabase, builders } = makeSupabase({
      organizacion: { data: rows, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    const result = await service.listar({
      activo: true,
      tipo: TipoOrganizacion.ONG,
    });

    expect(result.data).toHaveLength(2);
    const builder = builders.organizacion[0];
    expect(builder.eq).toHaveBeenCalledWith('activo', true);
    expect(builder.eq).toHaveBeenCalledWith('tipo', 'ONG');
  });

  it('sin filtros no llama eq', async () => {
    const { supabase, builders } = makeSupabase({
      organizacion: { data: [], error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    await service.listar({});
    expect(builders.organizacion[0].eq).not.toHaveBeenCalled();
  });
});

describe('OrganizacionesService.obtenerPorId', () => {
  it('devuelve la organizacion existente', async () => {
    const { supabase } = makeSupabase({
      organizacion: { data: baseOrg, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    const result = await service.obtenerPorId(1);
    expect((result as any).data.id).toBe(1);
  });

  it('lanza NotFoundException si no existe', async () => {
    const { supabase } = makeSupabase({
      organizacion: { data: null, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    await expect(service.obtenerPorId(99)).rejects.toThrow(NotFoundException);
  });
});

describe('OrganizacionesService.editar', () => {
  function dto(
    overrides: Partial<EditarOrganizacionDto> = {},
  ): EditarOrganizacionDto {
    return { nombre: 'Nuevo Nombre', ...overrides } as EditarOrganizacionDto;
  }

  it('actualiza y devuelve la fila editada', async () => {
    const updated = { ...baseOrg, nombre: 'Nuevo Nombre' };
    const { supabase, builders } = makeSupabase({
      organizacion: [
        { data: baseOrg, error: null }, // cargar
        { data: updated, error: null }, // update
      ],
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    const result = await service.editar(1, dto(), 'auth-1');
    expect((result as any).data.nombre).toBe('Nuevo Nombre');
    expect(builders.organizacion[1].update).toHaveBeenCalled();
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const { supabase } = makeSupabase({
      organizacion: { data: baseOrg, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('GENERAL'),
      buildLogoService(),
    );

    await expect(service.editar(1, dto(), 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('no hace UPDATE si el patch llega vacio', async () => {
    const { supabase, builders } = makeSupabase({
      organizacion: { data: baseOrg, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    const result = await service.editar(
      1,
      {} as EditarOrganizacionDto,
      'auth-1',
    );
    expect((result as any).data.id).toBe(1);
    expect(builders.organizacion).toHaveLength(1);
    expect(builders.organizacion[0].update).not.toHaveBeenCalled();
  });

  it('lanza 422 si Supabase devuelve 23505 en el UPDATE', async () => {
    const { supabase } = makeSupabase({
      organizacion: [
        { data: baseOrg, error: null },
        {
          data: null,
          error: { code: '23505', message: 'duplicate' },
        },
      ],
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    await expect(
      service.editar(1, dto({ nombre: 'Otro' }), 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});

describe('OrganizacionesService.borrar', () => {
  it('lanza 422 si hay referencias en campania_organizacion', async () => {
    const { supabase, builders } = makeSupabase({
      organizacion: { data: baseOrg, error: null },
      campania_organizacion: { count: 3, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      buildLogoService(),
    );

    await expect(service.borrar(1, 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(builders.organizacion).toHaveLength(1);
  });

  it('hard-delete cuando no hay referencias', async () => {
    const { supabase, builders } = makeSupabase({
      organizacion: [
        { data: baseOrg, error: null }, // cargar
        { data: null, error: null }, // delete
      ],
      campania_organizacion: { count: 0, error: null },
    });
    const logoService = buildLogoService();
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      logoService,
    );

    const result = await service.borrar(1, 'auth-1');
    expect((result as any).data.id).toBe(1);
    expect(builders.organizacion[1].delete).toHaveBeenCalled();
    expect(logoService.eliminarPorUrl).not.toHaveBeenCalled();
  });

  it('borra el logo del bucket cuando la org tenia logo_url', async () => {
    const conLogo = {
      ...baseOrg,
      logo_url:
        'https://x.supabase.co/storage/v1/object/public/organizaciones/org-1-1.png',
    };
    const { supabase } = makeSupabase({
      organizacion: [
        { data: conLogo, error: null },
        { data: null, error: null },
      ],
      campania_organizacion: { count: 0, error: null },
    });
    const logoService = buildLogoService();
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('ADMIN'),
      logoService,
    );

    await service.borrar(1, 'auth-1');
    expect(logoService.eliminarPorUrl).toHaveBeenCalledWith(conLogo.logo_url);
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const { supabase } = makeSupabase({
      organizacion: { data: baseOrg, error: null },
    });
    const service = new OrganizacionesService(
      supabase,
      buildAuthService('GENERAL'),
      buildLogoService(),
    );

    await expect(service.borrar(1, 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
