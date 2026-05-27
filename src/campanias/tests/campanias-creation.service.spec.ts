import {
  BadRequestException,
  ForbiddenException,
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

function buildSupabase(insertResult: {
  data: any;
  error: any;
}): SupabaseService {
  const single = jest.fn().mockResolvedValue(insertResult);
  const select = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select });
  const from = jest.fn().mockReturnValue({ insert });
  return {
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
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
  it('crea campaña correctamente y llama RPC de codigos', async () => {
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
    const supabase = buildSupabase({ data: campania, error: null });
    const authService = buildAuthService('ADMIN');
    const codigosService = buildCodigosService('CMP-2026-001');

    const service = new CampaniasCreationService(
      supabase,
      authService,
      codigosService,
    );
    const result = await service.crear(buildDto(), 'auth-1');

    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result.data.codigo_trazabilidad).toBe('CMP-2026-001');
  });

  it('lanza 403 si el rol no es ADMIN', async () => {
    const supabase = buildSupabase({ data: null, error: null });
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
  });

  it('lanza 422 si Supabase devuelve error 23505 (nombre duplicado)', async () => {
    const supabase = buildSupabase({
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
    const supabase = buildSupabase({
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
    const supabase = buildSupabase({ data: null, error: null });
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
