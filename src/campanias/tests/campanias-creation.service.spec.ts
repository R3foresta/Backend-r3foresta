import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { TipoCampania } from '../domain/enums/tipo-campania.enum';
import { CampaniasAuthService } from '../application/campanias-auth.service';
import { CampaniasCodigosService } from '../application/campanias-codigos.service';
import { CampaniasCreationService } from '../application/campanias-creation.service';
import { CrearCampaniaDto } from '../api/dto/crear-campania.dto';

function buildDto(overrides: Partial<CrearCampaniaDto> = {}): CrearCampaniaDto {
  return {
    nombre: 'Campaña Test',
    tipo: TipoCampania.REFORESTACION,
    ...overrides,
  } as CrearCampaniaDto;
}

function buildSupabase(insertResult: { data: any; error: any }) {
  const single = jest.fn().mockResolvedValue(insertResult);
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  const insertOrganizaciones = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    if (table === 'campania') return { insert };
    if (table === 'campania_organizacion')
      return { insert: insertOrganizaciones };
    throw new Error(`Tabla no mockeada: ${table}`);
  });
  const supabase = {
    getAdminClient: jest.fn().mockReturnValue({ from }),
    getClient: jest.fn(() => {
      throw new Error('El cliente público no tiene permisos de escritura.');
    }),
  } as unknown as SupabaseService;
  return { supabase, from, insert, insertOrganizaciones };
}

function buildAuthService(rol: string) {
  return {
    getUserByAuthId: jest
      .fn()
      .mockResolvedValue({ id: 1, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (r.toUpperCase() !== 'ADMIN') throw new ForbiddenException();
    }),
  } as unknown as CampaniasAuthService;
}

function buildCodigosService(codigo = 'CMP-2026-001') {
  return {
    generarCodigo: jest.fn().mockResolvedValue(codigo),
  } as unknown as CampaniasCodigosService;
}

describe('CampaniasCreationService', () => {
  it('crea campaña y asociaciones autorizadas aunque el cliente público no pueda escribir', async () => {
    const campania = {
      id: 1,
      nombre: 'Campaña Test',
      tipo: 'REFORESTACION',
      codigo_trazabilidad: 'CMP-2026-001',
      descripcion: null,
      fecha_estimada_inicio: null,
      fecha_estimada_fin: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    const { supabase, insert, insertOrganizaciones } = buildSupabase({
      data: campania,
      error: null,
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService('CMP-2026-001');

    const service = new CampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );
    const result = await service.crear(
      buildDto({ organizacion_ids: [20, 21] }),
      'auth-1',
    );

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.data.codigo_trazabilidad).toBe('CMP-2026-001');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Campaña Test',
        created_by: 1,
        updated_by: 1,
      }),
    );
    expect(insertOrganizaciones).toHaveBeenCalledWith([
      { campania_id: 1, organizacion_id: 20, created_by: 1 },
      { campania_id: 1, organizacion_id: 21, created_by: 1 },
    ]);
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it('lanza 403 si el rol no es ADMIN', async () => {
    const { supabase, from } = buildSupabase({ data: null, error: null });
    const authService = buildAuthService('GENERAL');
    const codigosService = buildCodigosService();

    const service = new CampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(from).not.toHaveBeenCalled();
    expect(supabase.getAdminClient).not.toHaveBeenCalled();
  });

  it('falla antes de escribir si no existe cliente privado, sin fallback público', async () => {
    const { supabase, from } = buildSupabase({ data: null, error: null });
    const failure = new InternalServerErrorException(
      'Cliente privado no disponible.',
    );
    jest.mocked(supabase.getAdminClient).mockImplementation(() => {
      throw failure;
    });
    const service = new CampaniasCreationService(
      supabase,
      buildAuthService('ADMIN'),
      buildCodigosService(),
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toBe(failure);
    expect(from).not.toHaveBeenCalled();
    expect(supabase.getClient).not.toHaveBeenCalled();
  });

  it('lanza 422 si Supabase devuelve error 23505 (nombre duplicado)', async () => {
    const { supabase } = buildSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new CampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('lanza 400 si Supabase devuelve error generico', async () => {
    const { supabase } = buildSupabase({
      data: null,
      error: { code: '42000', message: 'generic error' },
    });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new CampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );

    await expect(service.crear(buildDto(), 'auth-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza 400 si fecha_fin es anterior a fecha_inicio', async () => {
    const { supabase } = buildSupabase({ data: null, error: null });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService();

    const service = new CampaniasCreationService(
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
});
