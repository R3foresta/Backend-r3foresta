import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearSubcampaniaDto } from '../api/dto/crear-subcampania.dto';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasCodigosService } from '../application/subcampanias-codigos.service';
import { SubcampaniasCreationService } from '../application/subcampanias-creation.service';

function buildDto(
  overrides: Partial<CrearSubcampaniaDto> = {},
): CrearSubcampaniaDto {
  return {
    campania_id: 1,
    nombre: 'Subcampaña Test',
    zona_id: 10,
    meta_total_arboles: 500,
    ...overrides,
  } as CrearSubcampaniaDto;
}

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

function buildCodigosService(
  codigo = 'SUB-001-CMP-2026-001',
): SubcampaniasCodigosService {
  return {
    generarCodigo: jest.fn().mockResolvedValue(codigo),
  } as unknown as SubcampaniasCodigosService;
}

function buildSupabase(opts: {
  campaniaResult: { data: any; error: any };
  insertResult: { data: any; error: any };
}): SupabaseService {
  const campaniaSingle = jest
    .fn()
    .mockResolvedValueOnce(opts.campaniaResult);
  const campaniaIs = jest
    .fn()
    .mockReturnValue({ single: campaniaSingle });
  const campaniaEq = jest.fn().mockReturnValue({ is: campaniaIs });
  const campaniaSelect = jest.fn().mockReturnValue({ eq: campaniaEq });

  const insertSingle = jest.fn().mockResolvedValueOnce(opts.insertResult);
  const insertSelect = jest.fn().mockReturnValue({ single: insertSingle });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });

  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'campania') {
      return { select: campaniaSelect };
    }
    if (table === 'subcampania') {
      return { insert };
    }
    return {};
  });

  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
}

describe('SubcampaniasCreationService', () => {
  it('crea subcampaña heredando tipo desde la campaña y llamando RPC de código', async () => {
    const campania = { id: 1, tipo: 'ARBORIZACION' };
    const inserted = {
      id: 100,
      campania_id: 1,
      nombre: 'Subcampaña Test',
      tipo: 'ARBORIZACION',
      estado: 'BORRADOR',
      zona_id: 10,
      meta_total_arboles: 500,
      codigo_trazabilidad: 'SUB-001-CMP-2026-001',
      descripcion: null,
      fecha_estimada_inicio: null,
      fecha_estimada_fin: null,
      tolerancia_gps_metros: 50,
      created_at: '2026-05-27T00:00:00Z',
    };

    const supabase = buildSupabase({
      campaniaResult: { data: campania, error: null },
      insertResult: { data: inserted, error: null },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new SubcampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );
    const result = await service.crear(buildDto(), 'auth-1');

    expect(result.success).toBe(true);
    expect((result.data as any).codigo_trazabilidad).toBe(
      'SUB-001-CMP-2026-001',
    );
    expect((result.data as any).tipo).toBe('ARBORIZACION');
    expect(codigosService.generarCodigo).toHaveBeenCalledWith(1);
  });

  it('lanza ForbiddenException si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({
      campaniaResult: { data: { id: 1, tipo: 'REFORESTACION' }, error: null },
      insertResult: { data: null, error: null },
    });
    const authService = buildAuthService('GENERAL');
    const codigosService = buildCodigosService();

    const service = new SubcampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lanza NotFoundException si la campaña no existe', async () => {
    const supabase = buildSupabase({
      campaniaResult: { data: null, error: { message: 'not found' } },
      insertResult: { data: null, error: null },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new SubcampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza 422 si Supabase responde con código 23505 en el insert', async () => {
    const supabase = buildSupabase({
      campaniaResult: { data: { id: 1, tipo: 'REFORESTACION' }, error: null },
      insertResult: {
        data: null,
        error: { code: '23505', message: 'duplicate' },
      },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new SubcampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 400 si fecha_fin es anterior a fecha_inicio', async () => {
    const supabase = buildSupabase({
      campaniaResult: { data: { id: 1, tipo: 'REFORESTACION' }, error: null },
      insertResult: { data: null, error: null },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new SubcampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(
      service.crear(
        buildDto({
          fecha_estimada_inicio: '2026-12-01',
          fecha_estimada_fin: '2026-06-01',
        }),
        'auth-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza 400 en error genérico de Supabase', async () => {
    const supabase = buildSupabase({
      campaniaResult: { data: { id: 1, tipo: 'REFORESTACION' }, error: null },
      insertResult: {
        data: null,
        error: { code: '42000', message: 'oops' },
      },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new SubcampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
