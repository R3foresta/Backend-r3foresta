import { ForbiddenException, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  RecoleccionAccesosService,
  validateM1Reply,
} from '../application/recoleccion-accesos.service';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import {
  parseM1Comando,
  parseM1Query,
} from '../api/dto/acceso-recoleccion.dto';

const actor = { usuario_id: '1', auth_id: 'verificada', rol: 'ADMIN' };
const key = randomUUID();
const receipt = () => ({
  http_status: 200,
  body: {
    comando_id: key,
    operacion: 'OTORGAR_ACCESO_RECOLECCION',
    estado: 'CONFIRMADO',
    resultado: {
      tipo: 'ACCESO_RECOLECCION',
      usuario_id: '2',
      acceso_explicito_anterior: false,
      acceso_explicito_nuevo: true,
      revision_anterior: '0',
      revision_nueva: '1',
      cambio: 'CAMBIO_APLICADO',
    },
    error: null,
    finalizado_en: '2026-11-05T16:00:00Z',
  },
});

describe('contrato M1 independiente y cerrado', () => {
  it('normaliza intención y conserva IDs/revisión BIGINT sin Number', () => {
    const p = parseM1Comando('9007199254740993', {
      comando_id: key,
      revision_esperada: '9007199254740994',
      motivo: '  Revisio\u0301n  ',
    });
    expect(p.payload).toEqual({
      usuario_destino_id: '9007199254740993',
      revision_esperada: '9007199254740994',
      motivo: 'Revisión',
    });
  });
  it.each([
    { actor_id: '1' },
    { rol_global: 'ADMIN' },
    { usuario_destino_id: '2' },
  ])('rechaza campos ajenos a la intención %j', (extra) => {
    expect(() =>
      parseM1Comando('2', {
        comando_id: key,
        revision_esperada: '0',
        motivo: 'Prueba',
        ...extra,
      }),
    ).toThrow(HttpException);
  });
  it.each([1, '01', '-1', '9223372036854775808'])(
    'rechaza revisión inválida %j',
    (revision) => {
      expect(() =>
        parseM1Comando('2', {
          comando_id: key,
          revision_esperada: revision,
          motivo: 'Prueba',
        }),
      ).toThrow(HttpException);
    },
  );
  it('pagina historia por ID sin aceptar un cursor o actor del cliente', () => {
    expect(parseM1Query({ antes_de_id: '42', limite: '50' })).toEqual({
      antes_de_id: '42',
      limite: 50,
    });
    for (const q of [
      { limite: '51' },
      { limite: ['1'] },
      { cursor: 'inventado' },
      { actor_id: '1' },
    ])
      expect(() => parseM1Query(q)).toThrow(HttpException);
  });
  it('valida recibo propio sin convertirlo en capacidad vigente', () => {
    expect(validateM1Reply(receipt(), key).body.estado).toBe('CONFIRMADO');
    const r = receipt();
    r.body.resultado.revision_nueva = '2';
    expect(() => validateM1Reply(r, key)).toThrow();
  });
  it('usa cliente privado y actor verificado, sin recurrir al público', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: receipt(), error: null });
    const getClient = jest.fn();
    const service = new RecoleccionAccesosService({
      getAdminClient: () => ({ rpc }),
      getClient,
    } as unknown as SupabaseService);
    const payload = parseM1Comando('2', {
      comando_id: key,
      revision_esperada: '0',
      motivo: 'Prueba',
    }).payload;
    await service.ejecutar(actor, 'OTORGAR_ACCESO_RECOLECCION', key, payload);
    expect(rpc).toHaveBeenCalledWith('m1_acceso_ejecutar', {
      p_actor_id: '1',
      p_auth_id: 'verificada',
      p_operacion: 'OTORGAR_ACCESO_RECOLECCION',
      p_comando_id: key,
      p_payload: payload,
    });
    expect(getClient).not.toHaveBeenCalled();
  });
  it.each(['transporte', 'respuesta privada inesperada'])(
    'conserva incertidumbre ante %s',
    async (kind) => {
      const r = receipt();
      const rpc =
        kind === 'transporte'
          ? jest.fn().mockRejectedValue(new Error('secreto sintético'))
          : jest.fn().mockResolvedValue({
              data: { ...r, body: { ...r.body, datos_privados: 'ocultar' } },
              error: null,
            });
      const service = new RecoleccionAccesosService({
        getAdminClient: () => ({ rpc }),
      } as unknown as SupabaseService);
      try {
        await service.recuperar(actor, key);
        throw new Error('No rechazó');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(503);
        expect((error as HttpException).getResponse()).toMatchObject({
          comando_id: key,
          resultado_concluyente: false,
          error: {
            codigo: 'RESULTADO_NO_DETERMINADO',
            reintento: 'MISMA_CLAVE',
          },
        });
        expect(
          JSON.stringify((error as HttpException).getResponse()),
        ).not.toContain('sintético');
      }
    },
  );
});
describe('M1 efectivo y propiedad en aplicación', () => {
  it('no convierte un Number inseguro en autoridad sobre un vivero vecino', async () => {
    const auth = new RecoleccionAuthService({
      getAdminClient: () => ({
        rpc: (name: string) =>
          Promise.resolve({
            data:
              name === 'm2_ambitos'
                ? { global: false, viveros: ['9007199254740992'] }
                : false,
            error: null,
          }),
      }),
    } as unknown as SupabaseService);
    const usuario = { id: '2', rol: 'VALIDADOR' };
    const redondeado = Number('9007199254740993');
    await expect(
      auth.assertCanRead(
        { usuario_id: '3', vivero_id: redondeado },
        usuario.id,
        usuario.rol,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      auth.assertCanRead(
        { usuario_id: '3', vivero_id: '9007199254740992' },
        usuario.id,
        usuario.rol,
      ),
    ).resolves.toBeUndefined();
  });
  it.each([
    ['GENERAL', false, false],
    ['GENERAL', true, true],
    ['VALIDADOR', true, true],
    ['VALIDADOR', false, false],
    ['VOLUNTARIO', true, false],
    ['ADMIN', true, true],
  ])('%s con acceso %s permite captura %s', async (role, access, allowed) => {
    const rpc = jest.fn().mockResolvedValue({ data: access, error: null });
    const auth = new RecoleccionAuthService({
      getAdminClient: () => ({ rpc }),
    } as unknown as SupabaseService);
    const result = auth.assertCanCreate(String(role), 2);
    if (allowed) await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('M1 no concede mantenimiento de un autor distinto', async () => {
    const auth = new RecoleccionAuthService({
      getAdminClient: () => ({
        rpc: () => Promise.resolve({ data: true, error: null }),
      }),
    } as unknown as SupabaseService);
    await expect(
      auth.assertOwnerOrAdmin({ usuario_id: 3 }, 2, 'GENERAL'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
