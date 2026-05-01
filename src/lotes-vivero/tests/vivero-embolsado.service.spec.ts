import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroEmbolsadoService } from '../application/vivero-embolsado.service';
import { ViveroEvidenciasService } from '../application/vivero-evidencias.service';

// ---------------------------------------------------------------------------
// Helpers para construir mocks de cadenas Supabase (.from().select().eq()...)
// ---------------------------------------------------------------------------

function buildChain(overrides: Record<string, jest.Mock> = {}) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    update: jest.fn().mockReturnThis(),
    ...overrides,
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Suite principal
// ---------------------------------------------------------------------------

describe('ViveroEmbolsadoService', () => {
  let service: ViveroEmbolsadoService;
  let rpcMock: jest.Mock;
  let fromMock: jest.Mock;
  let authService: jest.Mocked<
    Pick<ViveroAuthService, 'getUserByAuthId' | 'assertCanWrite'>
  >;
  let evidenciasService: jest.Mocked<
    Pick<ViveroEvidenciasService, 'crearPendienteParaEvento'>
  >;

  const AUTH_ID = 'auth-uuid-test';
  const LOTE_ID = 6;
  const USUARIO_ID = 77;

  const loteActivo = {
    id: LOTE_ID,
    codigo_trazabilidad: 'VIV-000006-REC-2026-066',
    estado_lote: 'ACTIVO',
    nombre_cientifico_snapshot: 'Quercus robur',
    nombre_comercial_snapshot: 'Roble europeo',
    tipo_material_snapshot: 'ESQUEJE',
    cantidad_inicial_en_proceso: 50,
    unidad_medida_inicial: 'UNIDAD',
    fecha_inicio: '2026-04-20',
    plantas_vivas_iniciales: null,
    saldo_vivo_actual: null,
  };

  const eventoInicio = {
    id: 10,
    tipo_evento: 'INICIO',
    fecha_evento: '2026-04-20',
    created_at: '2026-04-20T10:00:00Z',
  };
  const eventoEmbolsado = {
    id: 27,
    tipo_evento: 'EMBOLSADO',
    fecha_evento: '2026-04-25',
    cantidad_afectada: 100,
    unidad_medida_evento: 'UNIDAD',
    saldo_vivo_antes: null,
    saldo_vivo_despues: 100,
    observaciones: null,
    responsable_id: USUARIO_ID,
    created_at: '2026-04-25T12:00:00Z',
  };

  const rpcResultadoEmbolsado = {
    evento_embolsado_id: 27,
    lote_vivero_id: LOTE_ID,
    codigo_trazabilidad: 'VIV-000006-REC-2026-066',
    plantas_vivas_iniciales: 100,
    saldo_vivo_antes: null,
    saldo_vivo_despues: 100,
    evidencia_ids_vinculadas: [137],
  };

  function buildService(fromImpl: jest.Mock, rpc: jest.Mock) {
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from: fromImpl,
        rpc,
      }),
    } as unknown as SupabaseService;

    authService = {
      getUserByAuthId: jest
        .fn()
        .mockResolvedValue({
          id: USUARIO_ID,
          nombre: 'Responsable',
          rol: 'GENERAL',
        }),
      assertCanWrite: jest.fn(),
    };

    evidenciasService = {
      crearPendienteParaEvento: jest.fn(),
    };

    return new ViveroEmbolsadoService(
      supabaseService,
      authService as unknown as ViveroAuthService,
      evidenciasService as unknown as ViveroEvidenciasService,
    );
  }

  // -------------------------------------------------------------------------
  // Test 1: GET context devuelve lote activo con INICIO y sin EMBOLSADO
  // -------------------------------------------------------------------------
  describe('obtenerContexto', () => {
    it('devuelve contexto con puede_registrar_embolsado=true cuando el lote esta ACTIVO, tiene INICIO y no tiene EMBOLSADO', async () => {
      const loteChain = buildChain({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: loteActivo, error: null }),
      });
      const eventosChain = buildChain({
        order: jest
          .fn()
          .mockResolvedValue({ data: [eventoInicio], error: null }),
      });

      fromMock = jest.fn().mockImplementation((tabla: string) => {
        if (tabla === 'lote_vivero') return loteChain;
        if (tabla === 'evento_lote_vivero') return eventosChain;
        return buildChain();
      });

      rpcMock = jest.fn();
      service = buildService(fromMock, rpcMock);

      const response = await service.obtenerContexto(LOTE_ID);
      const resultado = response.data;

      expect(response.success).toBe(true);
      expect(resultado.lote_id).toBe(LOTE_ID);
      expect(resultado.codigo_trazabilidad).toBe('VIV-000006-REC-2026-066');
      expect(resultado.estado_lote).toBe('ACTIVO');
      expect(resultado.puede_registrar_embolsado).toBe(true);
      expect(resultado.motivo_bloqueo).toBeNull();
      expect(resultado).not.toHaveProperty('evento_embolsado_existente');
    });

    it('devuelve puede_registrar_embolsado=false con motivo cuando el lote ya tiene EMBOLSADO', async () => {
      const loteChain = buildChain({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({
            data: {
              ...loteActivo,
              plantas_vivas_iniciales: 100,
              saldo_vivo_actual: 100,
            },
            error: null,
          }),
      });
      const eventosChain = buildChain({
        order: jest
          .fn()
          .mockResolvedValue({
            data: [eventoInicio, eventoEmbolsado],
            error: null,
          }),
      });

      fromMock = jest.fn().mockImplementation((tabla: string) => {
        if (tabla === 'lote_vivero') return loteChain;
        if (tabla === 'evento_lote_vivero') return eventosChain;
        return buildChain();
      });

      service = buildService(fromMock, jest.fn());

      const response = await service.obtenerContexto(LOTE_ID);
      const resultado = response.data;

      expect(response.success).toBe(true);
      expect(resultado.puede_registrar_embolsado).toBe(false);
      expect(resultado.motivo_bloqueo).toContain('ya tiene EMBOLSADO');
      expect(resultado).toHaveProperty('evento_embolsado_existente');
    });

    it('devuelve puede_registrar_embolsado=false cuando el lote no tiene evento INICIO', async () => {
      const loteChain = buildChain({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: loteActivo, error: null }),
      });
      const eventosChain = buildChain({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      fromMock = jest.fn().mockImplementation((tabla: string) => {
        if (tabla === 'lote_vivero') return loteChain;
        if (tabla === 'evento_lote_vivero') return eventosChain;
        return buildChain();
      });

      service = buildService(fromMock, jest.fn());

      const response = await service.obtenerContexto(LOTE_ID);
      const resultado = response.data;

      expect(response.success).toBe(true);
      expect(resultado.puede_registrar_embolsado).toBe(false);
      expect(resultado.motivo_bloqueo).toContain('INICIO');
    });

    it('lanza NotFoundException si el lote no existe', async () => {
      const loteChain = buildChain({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });
      const eventosChain = buildChain({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      fromMock = jest.fn().mockImplementation((tabla: string) => {
        if (tabla === 'lote_vivero') return loteChain;
        return eventosChain;
      });

      service = buildService(fromMock, jest.fn());

      await expect(service.obtenerContexto(LOTE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: POST embolsado registra correctamente llamando la RPC
  // Test 10: responsable_id sale del usuario autenticado, no del body
  // -------------------------------------------------------------------------
  describe('registrar', () => {
    const dto: RegistrarEmbolsadoDto = {
      fecha_evento: '2026-04-25',
      plantas_vivas_iniciales: 100,
      evidencia_ids: [137],
      observaciones: 'Embolsado de prueba',
    };

    it('llama la RPC con responsable autenticado y retorna el resultado', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest
          .fn()
          .mockResolvedValue({ data: rpcResultadoEmbolsado, error: null }),
      });

      service = buildService(jest.fn(), rpcMock);

      const response = await service.registrar(LOTE_ID, dto, AUTH_ID);
      const resultado = response.data;

      // Test 10: responsable_id viene del usuario autenticado, no del body
      expect(authService.getUserByAuthId).toHaveBeenCalledWith(AUTH_ID);
      expect(authService.assertCanWrite).toHaveBeenCalledWith('GENERAL');
      expect(rpcMock).toHaveBeenCalledWith('fn_vivero_registrar_embolsado', {
        p_lote_id: LOTE_ID,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: USUARIO_ID, // <-- sale de getUserByAuthId, no del body
        p_plantas_vivas_iniciales: dto.plantas_vivas_iniciales,
        p_observaciones: dto.observaciones,
        p_evidencia_ids: dto.evidencia_ids,
      });

      expect(response.success).toBe(true);
      expect(resultado.message).toBe('Embolsado registrado correctamente.');
      expect(resultado.evento_embolsado_id).toBe(27);
      expect(resultado.lote_vivero_id).toBe(LOTE_ID);
      expect(resultado.codigo_trazabilidad).toBe('VIV-000006-REC-2026-066');
      expect(resultado.plantas_vivas_iniciales).toBe(100);
      expect(resultado.saldo_vivo_antes).toBeNull();
      expect(resultado.saldo_vivo_despues).toBe(100);
      expect(resultado.evidencia_ids_vinculadas).toEqual([137]);
    });

    // Test 9: el body no permite mandar unidad_medida_evento, saldo_vivo_antes
    // ni saldo_vivo_despues; la RPC los calcula y el DTO no los acepta
    it('no acepta campos de saldo ni unidad_medida_evento en el body (los calcula la RPC)', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest
          .fn()
          .mockResolvedValue({ data: rpcResultadoEmbolsado, error: null }),
      });
      service = buildService(jest.fn(), rpcMock);

      // Simula que el frontend intenta mandar campos prohibidos en el body
      const dtoConCamposExtra = { ...dto } as any;
      dtoConCamposExtra.unidad_medida_evento = 'UNIDAD';
      dtoConCamposExtra.saldo_vivo_antes = 0;
      dtoConCamposExtra.saldo_vivo_despues = 100;

      await service.registrar(LOTE_ID, dtoConCamposExtra, AUTH_ID);

      // La RPC nunca debe recibir esos campos del body: siempre los calcula internamente
      const llamadaRpc = rpcMock.mock.calls[0][1];
      expect(llamadaRpc).not.toHaveProperty('p_unidad_medida_evento');
      expect(llamadaRpc).not.toHaveProperty('p_saldo_vivo_antes');
      expect(llamadaRpc).not.toHaveProperty('p_saldo_vivo_despues');
    });

    // Test 5: rechaza cuando el responsable no esta disponible
    it('propaga NotFoundException si el usuario autenticado no existe', async () => {
      rpcMock = jest.fn();
      service = buildService(jest.fn(), rpcMock);
      authService.getUserByAuthId.mockRejectedValue(
        new NotFoundException('Usuario no encontrado'),
      );

      await expect(service.registrar(LOTE_ID, dto, AUTH_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(rpcMock).not.toHaveBeenCalled();
    });

    // Test 3: rechaza plantas_vivas_iniciales <= 0 — la RPC devuelve error
    it('propaga BadRequestException si la RPC rechaza plantas_vivas_iniciales invalido', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'plantas_vivas_iniciales debe ser un entero mayor o igual a 1.',
          },
        }),
      });
      service = buildService(jest.fn(), rpcMock);

      const dtoInvalido = { ...dto, plantas_vivas_iniciales: 0 };
      await expect(
        service.registrar(LOTE_ID, dtoInvalido as any, AUTH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    // Test 4: rechaza evidencia_ids vacio o ausente — la RPC devuelve error
    it('propaga BadRequestException si la RPC rechaza evidencia_ids vacio', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'EMBOLSADO requiere al menos una evidencia obligatoria (RN-VIV-26).',
          },
        }),
      });
      service = buildService(jest.fn(), rpcMock);

      const dtoSinEvidencia = { ...dto, evidencia_ids: [] };
      await expect(
        service.registrar(LOTE_ID, dtoSinEvidencia as any, AUTH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    // Test 6: propaga error si la RPC rechaza lote sin INICIO previo
    it('propaga BadRequestException si la RPC rechaza porque el lote no tiene INICIO', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'El lote 6 no tiene un evento INICIO registrado. EMBOLSADO requiere INICIO previo (RN-VIV-10).',
          },
        }),
      });
      service = buildService(jest.fn(), rpcMock);

      await expect(service.registrar(LOTE_ID, dto, AUTH_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    // Test 7: propaga error si la RPC rechaza EMBOLSADO duplicado
    it('propaga BadRequestException si la RPC rechaza EMBOLSADO duplicado', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'El lote 6 ya tiene un evento EMBOLSADO registrado. No se puede registrar dos veces (RN-VIV-11).',
          },
        }),
      });
      service = buildService(jest.fn(), rpcMock);

      await expect(service.registrar(LOTE_ID, dto, AUTH_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    // Test 8: propaga error si la RPC rechaza evidencia ya vinculada
    it('propaga BadRequestException si la RPC rechaza evidencia ya vinculada a otra entidad', async () => {
      rpcMock = jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'Todas las evidencias de EMBOLSADO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.',
          },
        }),
      });
      service = buildService(jest.fn(), rpcMock);

      await expect(service.registrar(LOTE_ID, dto, AUTH_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET :id/embolsado — consultar resultado
  // -------------------------------------------------------------------------
  describe('obtenerResultado', () => {
    it('devuelve registrado: false cuando el lote no tiene evento EMBOLSADO', async () => {
      const loteChain = buildChain({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: LOTE_ID,
            codigo_trazabilidad: 'VIV-000006-REC-2026-066',
            plantas_vivas_iniciales: null,
            saldo_vivo_actual: null,
          },
          error: null,
        }),
      });
      const eventoChain = buildChain({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      fromMock = jest.fn().mockImplementation((tabla: string) => {
        if (tabla === 'lote_vivero') return loteChain;
        if (tabla === 'evento_lote_vivero') return eventoChain;
        return buildChain();
      });

      service = buildService(fromMock, jest.fn());

      const response = await service.obtenerResultado(LOTE_ID);
      const resultado = response.data;

      expect(response.success).toBe(true);
      expect(resultado.registrado).toBe(false);
      expect(resultado.evento).toBeNull();
    });

    it('devuelve registrado: true con evento cuando EMBOLSADO existe', async () => {
      const loteChain = buildChain({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: LOTE_ID,
            codigo_trazabilidad: 'VIV-000006-REC-2026-066',
            plantas_vivas_iniciales: 100,
            saldo_vivo_actual: 100,
          },
          error: null,
        }),
      });
      const eventoChain = buildChain({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: eventoEmbolsado, error: null }),
      });
      const tipoEntidadChain = buildChain({
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { id: 5 }, error: null }),
      });
      const evidenciasChain = buildChain({
        is: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      fromMock = jest.fn().mockImplementation((tabla: string) => {
        if (tabla === 'lote_vivero') return loteChain;
        if (tabla === 'evento_lote_vivero') return eventoChain;
        if (tabla === 'tipos_entidad_evidencia') return tipoEntidadChain;
        if (tabla === 'evidencias_trazabilidad') return evidenciasChain;
        return buildChain();
      });

      const supabaseService = {
        getClient: jest.fn().mockReturnValue({
          from: fromMock,
          rpc: jest.fn(),
          storage: {
            from: jest.fn().mockReturnValue({
              getPublicUrl: jest
                .fn()
                .mockReturnValue({
                  data: { publicUrl: 'https://storage/foto.jpg' },
                }),
            }),
          },
        }),
      } as unknown as SupabaseService;

      service = new ViveroEmbolsadoService(
        supabaseService,
        authService as unknown as ViveroAuthService,
        evidenciasService as unknown as ViveroEvidenciasService,
      );

      const response = await service.obtenerResultado(LOTE_ID);
      const resultado = response.data;

      expect(response.success).toBe(true);
      expect(resultado.registrado).toBe(true);
      expect(resultado.evento).not.toBeNull();
      expect(resultado.evento!.id).toBe(27);
      expect(resultado.evento!.saldo_vivo_antes).toBeNull();
      expect(resultado.evento!.saldo_vivo_despues).toBe(100);
      expect(resultado).toHaveProperty('lote');
      const lote = (resultado as any).lote;
      expect(lote.plantas_vivas_iniciales).toBe(100);
    });
  });
});
