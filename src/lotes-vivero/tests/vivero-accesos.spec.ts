import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BigintIdPipe } from '../../common/dto/bigint-id';
import { SupabaseService } from '../../supabase/supabase.service';
import { parseM2Comando } from '../api/dto/acceso-viveros.dto';
import { CrearLoteViveroDto } from '../api/dto/crear-lote-vivero.dto';
import { ViveroAuthService } from '../application/vivero-auth.service';
import {
  ViveroAccesosService,
  validateM2Reply,
} from '../application/vivero-accesos.service';

const key = '00000000-0000-4000-8000-000000000001';
const actor = {
  usuario_id: '9007199254740995',
  auth_id: 'sintetico',
  rol: 'GENERAL',
};
const user = { id: actor.usuario_id, nombre: 'Sintético', rol: 'GENERAL' };

describe('Acceso por vivero T2: contrato, identidad y política por objeto', () => {
  const body = {
    comando_id: key,
    vivero_id: '9007199254740997',
    revision_esperada: '0',
    motivo: '  A\u0301mbito operativo  ',
  };
  it('mantiene IDs/revisiones BIGINT y normaliza solo el motivo', () => {
    expect(parseM2Comando(actor.usuario_id, body).payload).toEqual({
      usuario_destino_id: actor.usuario_id,
      vivero_id: '9007199254740997',
      revision_esperada: '0',
      motivo: 'Ámbito operativo',
    });
  });
  it.each([
    { actor_id: '1' },
    { rol: 'ADMIN' },
    { vivero_id: 1 },
    { revision_esperada: 0 },
    { vivero_id: '01' },
    { vivero_id: '9223372036854775808' },
    { motivo: 'ab' },
    { comando_id: '00000000-0000-4000-8000-00000000000A' },
  ])('rechaza entrada no canónica o autoridad del body %j', (patch) => {
    expect(() => parseM2Comando('20', { ...body, ...patch })).toThrow();
  });
  it('acepta cadenas BIGINT en rutas y rechaza números ya redondeados', () => {
    const pipe = new BigintIdPipe();
    expect(pipe.transform('9007199254740997')).toBe('9007199254740997');
    expect(() => pipe.transform(Number('9007199254740997'))).toThrow();
  });
  it('DTO conserva IDs grandes y rechaza un number inseguro antes de RPC', async () => {
    const fields = {
      recoleccion_id: '9007199254740997',
      vivero_id: '9007199254740999',
      fecha_inicio: '2026-11-05',
      fecha_evento: '2026-11-05',
      cantidad_inicial_en_proceso: 1,
      unidad_medida_inicial: 'G',
      evidencia_ids: ['9007199254741001'],
    };
    const dto = plainToInstance(CrearLoteViveroDto, fields);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.vivero_id).toBe(fields.vivero_id);
    expect(
      (
        await validate(
          plainToInstance(CrearLoteViveroDto, {
            ...fields,
            vivero_id: Number('9007199254740999'),
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    ['0.000001', true],
    ['9007199254740993.123456', true],
    [0.000001, true],
    [2.5, true],
    ['0', false],
    ['0.0000001', false],
    [0.0000001, false],
    ['1e-6', false],
    ['1.0000000', false],
    [Infinity, false],
  ])('DTO preserva la cantidad exacta %p y su validez %p', async (cantidad, valida) => {
    const dto = plainToInstance(CrearLoteViveroDto, {
      recoleccion_id: '1',
      vivero_id: '1',
      fecha_inicio: '2026-11-10',
      fecha_evento: '2026-11-10',
      cantidad_inicial_en_proceso: cantidad,
      unidad_medida_inicial: 'G',
      evidencia_ids: ['1'],
    });
    expect((await validate(dto)).length === 0).toBe(valida);
    expect(dto.cantidad_inicial_en_proceso).toBe(cantidad);
  });
  function setup(scopes: unknown = { global: false, viveros: ['1'] }) {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: { vivero_id: '2' }, error: null }),
      single: jest
        .fn()
        .mockResolvedValue({ data: { ...user, activo: true }, error: null }),
    };
    const rpc = jest.fn().mockResolvedValue({ data: scopes, error: null });
    const client = { from: jest.fn().mockReturnValue(query), rpc };
    const publicClient = jest.fn(() => {
      throw new Error('Cliente público prohibido');
    });
    const supabase = {
      getAdminClient: () => client,
      getClient: publicClient,
    } as unknown as SupabaseService;
    return {
      service: new ViveroAuthService(supabase),
      query,
      rpc,
      publicClient,
      supabase,
    };
  }
  it('resuelve actividad e identidad privada como texto sin fallback', async () => {
    const { service, query, publicClient } = setup();
    expect((await service.getUserByAuthId('sintetico')).id).toBe(
      actor.usuario_id,
    );
    expect(query.select).toHaveBeenCalledWith('id::text, nombre, rol, activo');
    expect(publicClient).not.toHaveBeenCalled();
  });
  it('no toma el vivero del creador: resuelve el ámbito real del lote', async () => {
    const { service, query } = setup();
    await expect(service.assertLote(user, '10')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(query.select).toHaveBeenCalledWith('vivero_id::text');
  });
  it('retirar A conserva B y nunca transforma un permiso local en global', async () => {
    const { service, rpc } = setup();
    await service.assertVivero(user, '1');
    await expect(service.assertVivero(user, '2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    rpc.mockResolvedValue({
      data: { global: false, viveros: ['2'] },
      error: null,
    });
    await expect(service.assertVivero(user, '1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.assertVivero(user, '2');
  });
  it.each(['GENERAL', 'VALIDADOR'])(
    'el rol %s sin vigencia no opera',
    async (rol) => {
      const { service } = setup({ global: false, viveros: [] });
      await expect(
        service.assertVivero({ ...user, rol }, '1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('ADMIN deriva alcance y VOLUNTARIO no hereda vigencias', async () => {
    const { service } = setup({ global: true, viveros: [] });
    await service.assertVivero({ ...user, rol: 'ADMIN' }, '999');
    await expect(
      service.assertVivero({ ...user, rol: 'VOLUNTARIO' }, '1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('una lectura previa ADMIN no restaura alcance global si SQL ya observó la democión', async () => {
    const { service } = setup({ global: false, viveros: ['2'] });
    await expect(
      service.assertVivero({ ...user, rol: 'ADMIN' }, '1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.assertVivero({ ...user, rol: 'ADMIN' }, '2');
  });
  it('una RPC ausente o inválida no concede acceso por respaldo al rol', async () => {
    const { service, rpc } = setup(null);
    await expect(service.assertVivero(user, '1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    rpc.mockResolvedValue({
      data: { global: false, viveros: ['9007199254740997'] },
      error: null,
    });
    await expect(
      service.assertVivero(user, '9007199254740996'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rechaza cuenta inactiva incluso si conserva asignaciones', async () => {
    const { service, query } = setup();
    query.single.mockResolvedValue({
      data: { ...user, activo: false },
      error: null,
    });
    await expect(service.getUserByAuthId('sintetico')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('fallo de infraestructura conserva UUID/intención para recuperar', async () => {
    const { supabase, rpc } = setup();
    rpc.mockResolvedValue({ data: null, error: { code: '57014' } });
    await expect(
      new ViveroAccesosService(supabase).ejecutar(
        actor,
        'OTORGAR_ACCESO_VIVERO',
        key,
        parseM2Comando('20', body).payload,
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { comando_id: key, resultado_concluyente: false },
    });
  });
  it('no acepta una lectura que fabrique alcance global por tener una vigencia', () => {
    expect(() =>
      validateM2Reply(
        {
          http_status: 200,
          body: {
            data: {
              usuario_id: '20',
              rol_global: 'GENERAL',
              activo: true,
              revision_acceso: '1',
              revision_autoridad: '0',
              alcance_global: true,
              viveros: [],
              capacidades_globales: { administrar: true },
              historial: [],
              siguiente_antes_de_id: null,
            },
            observado_en: '2026-11-05T12:00:00Z',
          },
        },
        null,
      ),
    ).toThrow();
  });
});
