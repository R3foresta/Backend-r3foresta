import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearSubcampaniaDto } from '../api/dto/crear-subcampania.dto';
import { SubcampaniasCodigosService } from '../application/subcampanias-codigos.service';
import { SubcampaniasCreationService } from '../application/subcampanias-creation.service';
import {
  SubcampaniasHistorialService,
  TipoHistorialSubcampania,
} from '../application/subcampanias-historial.service';

function buildDto(
  overrides: Partial<CrearSubcampaniaDto> = {},
): CrearSubcampaniaDto {
  return {
    campania_id: 1,
    nombre: 'Subcampaña Test',
    zona_id: 10,
    meta_total_arboles: 500,
    ...overrides,
  };
}

function buildSupabase(result: { data: unknown; error: unknown }) {
  const rpcPrivada = jest.fn().mockResolvedValue(result);
  const rpcPublica = jest.fn().mockResolvedValue({
    data: null,
    error: { code: '42501', message: 'permission denied for table campania' },
  });
  const from = jest.fn(() => {
    throw new Error('El alta solo utiliza la RPC atómica.');
  });
  const supabase = {
    getClient: jest.fn().mockReturnValue({ rpc: rpcPublica }),
    getAdminClient: jest.fn().mockReturnValue({ rpc: rpcPrivada, from }),
  };
  return {
    supabase: supabase as unknown as SupabaseService,
    rpcPrivada,
    rpcPublica,
    from,
  };
}

describe('SubcampaniasCreationService', () => {
  it('conserva la respuesta HTTP con tipo heredado y código entregados por la transacción', async () => {
    const inserted = {
      id: 100,
      ...buildDto(),
      tipo: 'ARBORIZACION',
      estado: 'BORRADOR',
      codigo_trazabilidad: 'SUB-001-CMP-2026-001',
      descripcion: null,
      fecha_estimada_inicio: null,
      fecha_estimada_fin: null,
      tolerancia_gps_metros: 50,
      created_at: '2026-11-16T00:00:00Z',
    };
    const { supabase, rpcPrivada, from } = buildSupabase({
      data: inserted,
      error: null,
    });
    const result = await new SubcampaniasCreationService(supabase).crear(
      buildDto(),
      'auth-1',
    );
    expect(result).toEqual({
      success: true,
      data: { message: 'Subcampaña creada correctamente.', ...inserted },
    });
    expect(rpcPrivada).toHaveBeenCalledTimes(1);
    expect(rpcPrivada).toHaveBeenCalledWith('pa_d_subcampania_crear', {
      p_auth_id: 'auth-1',
      p_payload: buildDto(),
    });
    expect(from).not.toHaveBeenCalled();
  });

  // Conserva la regresión local previa: el cierre de permisos públicos no debe
  // impedir crear ni generar; ambos caminos usan exclusivamente cliente privado.
  it('crea el borrador con permisos públicos cerrados, sin RPC separada de código ni historial', async () => {
    const dto = buildDto({ meta_total_arboles: 600 });
    const { supabase, rpcPrivada, rpcPublica } = buildSupabase({
      data: {
        ...dto,
        id: 100,
        tipo: 'REFORESTACION',
        estado: 'BORRADOR',
        codigo_trazabilidad: 'SUB-001-CMP-2026-001',
      },
      error: null,
    });
    await expect(
      new SubcampaniasCreationService(supabase).crear(dto, 'auth-1'),
    ).resolves.toMatchObject({
      success: true,
      data: {
        estado: 'BORRADOR',
        meta_total_arboles: 600,
        codigo_trazabilidad: 'SUB-001-CMP-2026-001',
      },
    });
    expect(rpcPrivada).toHaveBeenCalledTimes(1);
    expect(rpcPublica).not.toHaveBeenCalled();
  });

  it('mantiene el generador legado real sobre cliente privado sin fallback público', async () => {
    const { supabase, rpcPrivada, rpcPublica } = buildSupabase({
      data: 'SUB-1000-CMP-2026-001',
      error: null,
    });
    await expect(
      new SubcampaniasCodigosService(supabase).generarCodigo(1),
    ).resolves.toBe('SUB-1000-CMP-2026-001');
    expect(rpcPrivada).toHaveBeenCalledWith('fn_generar_codigo_subcampania', {
      p_campania_id: 1,
    });
    expect(rpcPublica).not.toHaveBeenCalled();
  });

  it('omite los opcionales undefined antes de enviar a SQL', async () => {
    const dto = buildDto({
      descripcion: undefined,
      fecha_estimada_inicio: undefined,
      tolerancia_gps_metros: 20,
    });
    const { supabase, rpcPrivada } = buildSupabase({
      data: { id: 100 },
      error: null,
    });
    await new SubcampaniasCreationService(supabase).crear(dto, 'auth-1');
    expect(rpcPrivada).toHaveBeenCalledWith('pa_d_subcampania_crear', {
      p_auth_id: 'auth-1',
      p_payload: {
        campania_id: 1,
        nombre: 'Subcampaña Test',
        zona_id: 10,
        meta_total_arboles: 500,
        tolerancia_gps_metros: 20,
      },
    });
  });

  it.each([
    ['42501', ForbiddenException],
    ['PT403', ForbiddenException],
    ['PT401', UnauthorizedException],
    ['P0002', NotFoundException],
    ['23505', UnprocessableEntityException],
    ['22023', BadRequestException],
    ['42000', BadRequestException],
    ['PGRST202', InternalServerErrorException],
    ['42883', InternalServerErrorException],
    ['55P03', ServiceUnavailableException],
    ['40001', ServiceUnavailableException],
  ])('mapea %s manteniendo el contrato de errores', async (code, exception) => {
    const { supabase } = buildSupabase({
      data: null,
      error: { code, message: 'Rechazo SQL de prueba' },
    });
    await expect(
      new SubcampaniasCreationService(supabase).crear(buildDto(), 'auth-1'),
    ).rejects.toThrow(exception);
  });

  it('rechaza una respuesta ausente de la RPC en lugar de anunciar un alta correcta', async () => {
    const { supabase } = buildSupabase({ data: null, error: null });
    await expect(
      new SubcampaniasCreationService(supabase).crear(buildDto(), 'auth-1'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('no puede registrar BORRADOR_CREADO mediante historial best-effort', async () => {
    const { supabase, from } = buildSupabase({ data: null, error: null });
    await expect(
      new SubcampaniasHistorialService(supabase).registrar({
        subcampaniaId: 100,
        tipo: TipoHistorialSubcampania.BORRADOR_CREADO,
        actorUserId: 1,
      }),
    ).rejects.toThrow('BORRADOR_CREADO requiere pa_d_subcampania_crear.');
    expect(from).not.toHaveBeenCalled();
  });
});
