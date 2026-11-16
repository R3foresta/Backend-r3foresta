import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { TipoCampania } from '../domain/enums/tipo-campania.enum';
import { CampaniasCodigosService } from '../application/campanias-codigos.service';
import { CampaniasCreationService } from '../application/campanias-creation.service';
import { CrearCampaniaDto } from '../api/dto/crear-campania.dto';

function buildDto(overrides: Partial<CrearCampaniaDto> = {}): CrearCampaniaDto {
  return {
    nombre: 'Campaña Test',
    tipo: TipoCampania.REFORESTACION,
    ...overrides,
  };
}

const campania = {
  id: 1,
  nombre: 'Campaña Test',
  tipo: 'REFORESTACION',
  codigo_trazabilidad: 'CMP-2026-1000',
  descripcion: null,
  fecha_estimada_inicio: null,
  fecha_estimada_fin: null,
  created_at: '2026-01-01T00:00:00Z',
};

function buildSupabase(result: {
  data: unknown;
  error: { code: string; message: string } | null;
}) {
  const rpc = jest.fn().mockResolvedValue(result);
  const from = jest.fn(() => {
    throw new Error('El alta completa corresponde a la RPC.');
  });
  const getAdminClient = jest.fn().mockReturnValue({ rpc, from });
  const getClient = jest.fn(() => {
    throw new Error('El cliente público no participa en el alta.');
  });
  const supabase = { getAdminClient, getClient } as unknown as SupabaseService;
  return { supabase, rpc, from, getAdminClient, getClient };
}

describe('CampaniasCreationService', () => {
  it('crea campaña y organizaciones con una sola RPC privada y conserva el contrato', async () => {
    const { supabase, rpc, from, getClient } = buildSupabase({
      data: campania,
      error: null,
    });
    const service = new CampaniasCreationService(supabase);

    const result = await service.crear(
      buildDto({ organizacion_ids: [20, 21] }),
      'auth-verificado',
    );

    expect(result).toEqual({
      success: true,
      data: { message: 'Campaña creada correctamente.', ...campania },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_crear_campania', {
      p_auth_id: 'auth-verificado',
      p_nombre: 'Campaña Test',
      p_tipo: 'REFORESTACION',
      p_descripcion: null,
      p_fecha_estimada_inicio: null,
      p_fecha_estimada_fin: null,
      p_organizacion_ids: [20, 21],
    });
    expect(from).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('conserva las organizaciones opcionales y envía los campos vigentes', async () => {
    const { supabase, rpc } = buildSupabase({ data: campania, error: null });
    const service = new CampaniasCreationService(supabase);
    await service.crear(
      buildDto({
        descripcion: 'Descripción',
        fecha_estimada_inicio: '2026-11-20',
        fecha_estimada_fin: '2026-11-21',
      }),
      'auth-verificado',
    );
    expect(rpc).toHaveBeenCalledWith(
      'fn_crear_campania',
      expect.objectContaining({
        p_descripcion: 'Descripción',
        p_fecha_estimada_inicio: '2026-11-20',
        p_fecha_estimada_fin: '2026-11-21',
        p_organizacion_ids: null,
      }),
    );
  });

  it.each([
    [
      'PT403',
      ForbiddenException,
      'Solo el rol ADMIN puede realizar esta operación.',
    ],
    ['PT403', ForbiddenException, 'CUENTA_INACTIVA'],
    ['PT404', NotFoundException, 'La cuenta de la sesión no existe.'],
    [
      'PT422',
      UnprocessableEntityException,
      'Ya existe una campaña con ese nombre.',
    ],
    [
      'PT400',
      BadRequestException,
      'Las organizaciones asociadas deben existir en el catálogo.',
    ],
    [
      'PT400',
      BadRequestException,
      'No se pudo crear la campaña: código u organizaciones duplicadas.',
    ],
  ])(
    'propaga %s de la revalidación transaccional, sin devolver éxito',
    async (code, exception, message) => {
      const { supabase, rpc, from, getClient } = buildSupabase({
        data: null,
        error: { code, message },
      });
      const service = new CampaniasCreationService(supabase);
      await expect(
        service.crear(buildDto(), 'auth-verificado'),
      ).rejects.toMatchObject({ constructor: exception, message });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(from).not.toHaveBeenCalled();
      expect(getClient).not.toHaveBeenCalled();
    },
  );

  it('un fallo SQL de asociaciones impide success y no expone detalles de la solicitud', async () => {
    const { supabase, rpc, from } = buildSupabase({
      data: null,
      error: { code: 'P0001', message: 'Detalle interno de una asociación' },
    });
    const service = new CampaniasCreationService(supabase);
    await expect(
      service.crear(buildDto({ organizacion_ids: [20] }), 'auth-verificado'),
    ).rejects.toThrow(new BadRequestException('No se pudo crear la campaña.'));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['PGRST202', '42883'])(
    'informa la migración111 ausente (%s)',
    async (code) => {
      const { supabase } = buildSupabase({
        data: null,
        error: { code, message: 'RPC no disponible' },
      });
      await expect(
        new CampaniasCreationService(supabase).crear(
          buildDto(),
          'auth-verificado',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    },
  );

  it.each(['55P03', '57014', '40P01', '40001'])(
    'clasifica el aborto técnico %s como 503 inconcluso',
    async (code) => {
      const { supabase } = buildSupabase({
        data: null,
        error: { code, message: 'Aborto técnico' },
      });
      await expect(
        new CampaniasCreationService(supabase).crear(
          buildDto(),
          'auth-verificado',
        ),
      ).rejects.toMatchObject({
        constructor: ServiceUnavailableException,
        response: {
          error: {
            codigo: 'RESULTADO_NO_DETERMINADO',
            resultado_concluyente: false,
          },
        },
      });
    },
  );

  it('falla antes de escribir si falta el cliente privado, sin fallback público', async () => {
    const { supabase, rpc, getAdminClient, getClient } = buildSupabase({
      data: null,
      error: null,
    });
    const failure = new InternalServerErrorException(
      'Cliente privado no disponible.',
    );
    getAdminClient.mockImplementation(() => {
      throw failure;
    });
    await expect(
      new CampaniasCreationService(supabase).crear(
        buildDto(),
        'auth-verificado',
      ),
    ).rejects.toBe(failure);
    expect(rpc).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { id: 1 }])(
    'rechaza un resultado de RPC inválido (%j)',
    async (data) => {
      const { supabase } = buildSupabase({ data, error: null });
      await expect(
        new CampaniasCreationService(supabase).crear(
          buildDto(),
          'auth-verificado',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    },
  );

  it.each([
    { fecha_estimada_inicio: '2026-12-01', fecha_estimada_fin: '2026-06-01' },
    { tipo: 'OTRO' as TipoCampania },
  ])('valida las políticas antes de invocar SQL (%j)', async (overrides) => {
    const { supabase, rpc } = buildSupabase({ data: null, error: null });
    await expect(
      new CampaniasCreationService(supabase).crear(
        buildDto(overrides),
        'auth-verificado',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('CampaniasCodigosService', () => {
  it('usa exclusivamente el generador privado y conserva el sufijo1000 completo', async () => {
    const { supabase, rpc, getClient } = buildSupabase({
      data: 'CMP-2026-1000',
      error: null,
    });
    await expect(
      new CampaniasCodigosService(supabase).generarCodigo(2026),
    ).resolves.toBe('CMP-2026-1000');
    expect(rpc).toHaveBeenCalledWith('fn_generar_codigo_campania', {
      p_anio: 2026,
    });
    expect(getClient).not.toHaveBeenCalled();
  });
});
