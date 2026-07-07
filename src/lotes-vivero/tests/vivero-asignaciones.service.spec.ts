import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearAsignacionDto } from '../api/dto/crear-asignacion.dto';
import { DevolverAsignacionDto } from '../api/dto/devolver-asignacion.dto';
import { ViveroAsignacionesService } from '../application/vivero-asignaciones.service';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { MotivoDevolucionPlantacion } from '../domain/enums/motivo-devolucion-plantacion.enum';
import { PropositoAsignacion } from '../domain/enums/proposito-asignacion.enum';

function buildAuthService(): ViveroAuthService {
  return {
    getUserByAuthId: jest.fn().mockResolvedValue({
      id: 11,
      nombre: 'Op Vivero',
      rol: 'GENERAL',
    }),
    assertCanWrite: jest.fn(),
  } as unknown as ViveroAuthService;
}

const rpcAsignacionOk = {
  asignacion_id: 123,
  evento_lote_vivero_id: 456,
  evento_plantacion_id: 789,
  lote_vivero_id: 55,
  codigo_trazabilidad_lote: 'VIV-000055-REC-000001',
  subcampania_id: 33,
  campania_id: 7,
  proposito: 'PLANTACION_INICIAL',
  estado_asignacion: 'ACTIVA',
  cantidad_asignada: 100,
  saldo_vivo_antes: 500,
  saldo_vivo_despues: 400,
  evidencia_ids_vinculadas: [501],
  lote_finalizado: false,
  motivo_cierre: null,
};

function buildSupabase(opts: {
  loteEstado?: string;
  subcampania?: { id: number; nombre: string; estado: string } | null;
  asignacion?: Record<string, unknown> | null;
  rpcResult?: { data: unknown; error: unknown };
}): { supabase: SupabaseService; rpc: jest.Mock } {
  const loteMaybeSingle = jest.fn().mockResolvedValue({
    data: { id: 55, estado_lote: opts.loteEstado ?? 'ACTIVO' },
    error: null,
  });
  const loteEq = jest.fn().mockReturnValue({ maybeSingle: loteMaybeSingle });
  const loteSelect = jest.fn().mockReturnValue({ eq: loteEq });

  const subMaybeSingle = jest.fn().mockResolvedValue({
    data:
      opts.subcampania === undefined
        ? { id: 33, nombre: 'Sub QA', estado: 'ACTIVA' }
        : opts.subcampania,
    error: null,
  });
  const subIs = jest.fn().mockReturnValue({ maybeSingle: subMaybeSingle });
  const subEq = jest.fn().mockReturnValue({ is: subIs });
  const subSelect = jest.fn().mockReturnValue({ eq: subEq });

  const asigMaybeSingle = jest.fn().mockResolvedValue({
    data:
      opts.asignacion === undefined
        ? {
            id: 10,
            lote_vivero_id: 55,
            estado: 'ACTIVA',
            cantidad_asignada: 100,
            cantidad_consumida: 0,
          }
        : opts.asignacion,
    error: null,
  });
  const asigEq = jest.fn().mockReturnValue({ maybeSingle: asigMaybeSingle });
  const asigSelect = jest.fn().mockReturnValue({ eq: asigEq });

  const rpc = jest
    .fn()
    .mockResolvedValue(
      opts.rpcResult ?? { data: rpcAsignacionOk, error: null },
    );

  const supabase = {
    getClient: jest.fn().mockReturnValue({
      rpc,
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'lote_vivero') return { select: loteSelect };
        if (table === 'subcampania') return { select: subSelect };
        if (table === 'asignacion_vivero_subcampania')
          return { select: asigSelect };
        return {};
      }),
    }),
  } as unknown as SupabaseService;

  return { supabase, rpc };
}

const baseDto: CrearAsignacionDto = {
  subcampania_id: 33,
  cantidad_asignada: 100,
  proposito: PropositoAsignacion.PLANTACION_INICIAL,
  fecha_asignacion: '2026-07-06',
  evidencia_ids: [501],
};

describe('ViveroAsignacionesService — asignacion fisica (RF-VIV-11)', () => {
  it('llama la RPC fisica fn_vivero_asignar_stock_subcampania con el payload completo', async () => {
    const { supabase, rpc } = buildSupabase({});
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    await service.crearAsignacion(55, baseDto, 'auth-1');

    expect(rpc).toHaveBeenCalledWith('fn_vivero_asignar_stock_subcampania', {
      p_lote_vivero_id: 55,
      p_subcampania_id: 33,
      p_cantidad_asignada: 100,
      p_proposito: PropositoAsignacion.PLANTACION_INICIAL,
      p_usuario_asignacion_id: 11,
      p_fecha_asignacion: '2026-07-06',
      p_evidencia_ids: [501],
      p_observaciones: null,
    });
    // Contrato fisico: la reserva logica quedo eliminada.
    expect(rpc).not.toHaveBeenCalledWith(
      'fn_vivero_reservar_stock_lote',
      expect.anything(),
    );
  });

  it('expone el descuento fisico del saldo del lote en la respuesta', async () => {
    const { supabase } = buildSupabase({});
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    const result = await service.crearAsignacion(55, baseDto, 'auth-1');

    expect(result.success).toBe(true);
    expect(result.data.saldo_vivo_antes).toBe(500);
    expect(result.data.saldo_vivo_despues).toBe(400);
    expect(result.data.evento_lote_vivero_id).toBe(456);
    expect(result.data.evento_plantacion_id).toBe(789);
    expect(result.data.evidencia_ids_vinculadas).toEqual([501]);
  });

  it('rechaza asignacion a subcampaña BORRADOR con 409', async () => {
    const { supabase } = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'BORRADOR' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    await expect(
      service.crearAsignacion(55, baseDto, 'auth-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza asignacion a subcampaña CANCELADA con 409', async () => {
    const { supabase } = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'CANCELADA' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    await expect(
      service.crearAsignacion(55, baseDto, 'auth-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza PLANTACION_INICIAL contra subcampaña COMPLETADA con 422', async () => {
    const { supabase } = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'COMPLETADA' },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    await expect(
      service.crearAsignacion(55, baseDto, 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('acepta REPOSICION contra subcampaña COMPLETADA', async () => {
    const { supabase } = buildSupabase({
      subcampania: { id: 33, nombre: 'Sub QA', estado: 'COMPLETADA' },
      rpcResult: {
        data: { ...rpcAsignacionOk, proposito: 'REPOSICION' },
        error: null,
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());
    const dto: CrearAsignacionDto = {
      ...baseDto,
      proposito: PropositoAsignacion.REPOSICION,
    };
    const result = await service.crearAsignacion(55, dto, 'auth-1');
    expect(result.success).toBe(true);
  });

  it('propaga como 422 el rechazo de la RPC por falta de evidencia (RN-VIV-54)', async () => {
    const { supabase } = buildSupabase({
      rpcResult: {
        data: null,
        error: {
          code: 'P0001',
          message:
            'La asignacion fisica requiere al menos una evidencia de entrega/salida (RN-VIV-54).',
        },
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    const action = service.crearAsignacion(55, baseDto, 'auth-1');

    await expect(action).rejects.toThrow(UnprocessableEntityException);
    await expect(action).rejects.toThrow('evidencia');
  });

  it('propaga como 422 el rechazo de la RPC por saldo fisico insuficiente', async () => {
    const { supabase } = buildSupabase({
      rpcResult: {
        data: null,
        error: {
          code: 'P0001',
          message:
            'La cantidad a asignar (600) excede el saldo vivo fisico del lote 55 (500).',
        },
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    const action = service.crearAsignacion(55, baseDto, 'auth-1');

    await expect(action).rejects.toThrow(UnprocessableEntityException);
    await expect(action).rejects.toThrow('excede el saldo');
  });

  it('propaga como 422 el rechazo de la RPC cuando el lote no tiene EMBOLSADO', async () => {
    const { supabase } = buildSupabase({
      rpcResult: {
        data: null,
        error: {
          code: 'P0001',
          message:
            'El lote 55 no tiene EMBOLSADO registrado. Antes de EMBOLSADO solo existe material en proceso, no plantas entregables (RN-VIV-61).',
        },
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    const action = service.crearAsignacion(55, baseDto, 'auth-1');

    await expect(action).rejects.toThrow(UnprocessableEntityException);
    await expect(action).rejects.toThrow('EMBOLSADO');
  });
});

describe('ViveroAsignacionesService — devolucion fisica (RF-VIV-12)', () => {
  const devolucionDto: DevolverAsignacionDto = {
    cantidad_devuelta: 40,
    motivo_devolucion: MotivoDevolucionPlantacion.SOBRANTE_OPERATIVO,
    fecha_devolucion: '2026-07-07',
  };

  const rpcDevolucionOk = {
    asignacion_id: 10,
    estado_asignacion: 'ACTIVA',
    cantidad_devuelta_delta: 40,
    cantidad_devuelta_total: 40,
    saldo_asignado_disponible: 60,
    lote_vivero_id: 55,
    saldo_vivo_antes: 400,
    saldo_vivo_despues: 440,
    lote_reabierto: false,
    evento_lote_vivero_id: 460,
    evento_plantacion_id: 795,
  };

  it('llama fn_m3_devolver_asignacion_vivero y expone el aumento de saldo fisico (RN-VIV-48)', async () => {
    const { supabase, rpc } = buildSupabase({
      rpcResult: { data: rpcDevolucionOk, error: null },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    const result = await service.devolverAsignacion(
      55,
      10,
      devolucionDto,
      'auth-1',
    );

    expect(rpc).toHaveBeenCalledWith('fn_m3_devolver_asignacion_vivero', {
      p_asignacion_id: 10,
      p_cantidad_devuelta: 40,
      p_motivo_devolucion: MotivoDevolucionPlantacion.SOBRANTE_OPERATIVO,
      p_usuario_devolucion_id: 11,
      p_fecha_devolucion: '2026-07-07',
      p_observaciones: null,
    });
    expect(result.data.saldo_vivo_antes).toBe(400);
    expect(result.data.saldo_vivo_despues).toBe(440);
    expect(result.data.evento_lote_vivero_id).toBe(460);
    expect(result.data.evento_plantacion_id).toBe(795);
  });

  it('marca DEVUELTA cuando la RPC devuelve el estado terminal', async () => {
    const { supabase } = buildSupabase({
      rpcResult: {
        data: {
          ...rpcDevolucionOk,
          estado_asignacion: 'DEVUELTA',
          cantidad_devuelta_total: 100,
          saldo_asignado_disponible: 0,
        },
        error: null,
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    const result = await service.devolverAsignacion(
      55,
      10,
      devolucionDto,
      'auth-1',
    );

    expect(result.data.estado).toBe('DEVUELTA');
    expect(result.data.saldo_asignado_disponible).toBe(0);
  });

  it('rechaza con 409 si la asignacion ya esta DEVUELTA (pre-chequeo)', async () => {
    const { supabase } = buildSupabase({
      asignacion: {
        id: 10,
        lote_vivero_id: 55,
        estado: 'DEVUELTA',
        cantidad_asignada: 100,
        cantidad_consumida: 0,
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    await expect(
      service.devolverAsignacion(55, 10, devolucionDto, 'auth-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza con 409 cuando la RPC reporta exceso sobre el saldo asignado', async () => {
    const { supabase } = buildSupabase({
      rpcResult: {
        data: null,
        error: {
          code: 'P0001',
          message:
            'La devolucion (500) excede el saldo asignado disponible (100) de la asignacion 10.',
        },
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    await expect(
      service.devolverAsignacion(55, 10, devolucionDto, 'auth-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza con 404 si la asignacion no pertenece al lote', async () => {
    const { supabase } = buildSupabase({
      asignacion: {
        id: 10,
        lote_vivero_id: 99,
        estado: 'ACTIVA',
        cantidad_asignada: 100,
        cantidad_consumida: 0,
      },
    });
    const service = new ViveroAsignacionesService(supabase, buildAuthService());

    await expect(
      service.devolverAsignacion(55, 10, devolucionDto, 'auth-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
