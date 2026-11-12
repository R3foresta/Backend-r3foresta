import {
  parseRecepcionComando,
  parseRecepcionRechazo,
} from '../api/dto/recepcion-semillas.dto';
import { validarReciboRecepcion } from '../domain/policies/recepcion-semillas.policy';
const key = '4ff8f9bb-4280-463d-95c8-97a3f11f122c';
const input = () => ({
  comando_id: key,
  revision_esperada: '9007199254740992',
  cantidad_recibida: 0.1,
  unidad_recibida: 'KG',
  fecha_recepcion: '2026-11-06',
  evidencia_ids: ['9007199254740993'],
});
export const recibo = (accion: 'RECIBIR' | 'RECHAZAR' = 'RECIBIR') => ({
  http_status: 200,
  ejecucion_nueva: true,
  body: {
    comando_id: key,
    estado: 'CONFIRMADO',
    error: null,
    finalizado_en: '2026-11-06T12:00:00.000Z',
    resultado: {
      accion,
      recoleccion_id: '9007199254740993',
      vivero_id: '1',
      recepcion_id: accion === 'RECIBIR' ? '1' : null,
      revision_anterior: '9007199254740992',
      revision_nueva: '9007199254740993',
      cantidad_recibida: accion === 'RECIBIR' ? 100 : null,
      unidad_recibida: accion === 'RECIBIR' ? 'G' : null,
      fecha_recepcion: accion === 'RECIBIR' ? '2026-11-06' : null,
      actor_id: '20',
      saldo_actual: 100,
      estado_registro: accion === 'RECIBIR' ? 'VALIDADO' : 'RECHAZADO',
      anclaje_externo: accion === 'RECIBIR' ? 'FUERA_TRANSACCION' : 'NO_APLICA',
      motivo_rechazo:
        accion === 'RECHAZAR' ? 'Cantidad declarada no conforme' : null,
      registrado_en: '2026-11-06T12:00:00.000Z',
    },
  },
});
describe('Contrato de decisión única de recepción', () => {
  it('mantiene BIGINT exactos y fija RECIBIR en servidor', () => {
    const r = parseRecepcionComando('9007199254740993', input());
    expect(r.payload).toMatchObject({
      accion: 'RECIBIR',
      recoleccion_id: '9007199254740993',
      revision_esperada: '9007199254740992',
      evidencia_ids: ['9007199254740993'],
    });
  });
  it.each([
    { actor_id: '1' },
    { vivero_id: '1' },
    { fotos: 'base64' },
    { accion: 'RECHAZAR' },
    { incidencia_id: '9' },
    { motivo_resolucion: 'Texto obsoleto' },
    { revision_esperada: 9007199254740992 },
    { evidencia_ids: [9007199254740992] },
    { fecha_recepcion: '2026-02-30' },
    { cantidad_recibida: Infinity },
    { cantidad_recibida: 1.5, unidad_recibida: 'UNIDAD' },
  ])('rechaza autoridad o carga inválida %j', (extra) => {
    expect(() =>
      parseRecepcionComando('100', { ...input(), ...extra }),
    ).toThrow();
  });
  it('rechaza sin foto y normaliza sólo el motivo', () => {
    expect(
      parseRecepcionRechazo('100', {
        comando_id: key,
        revision_esperada: '5',
        motivo_rechazo: '  Cantidad declarada no conforme  ',
      }).payload,
    ).toEqual({
      accion: 'RECHAZAR',
      recoleccion_id: '100',
      revision_esperada: '5',
      motivo_rechazo: 'Cantidad declarada no conforme',
    });
  });
  it('cuenta caracteres Unicode de motivo igual que PostgreSQL', () => {
    expect(
      parseRecepcionRechazo('100', {
        comando_id: key,
        revision_esperada: '5',
        motivo_rechazo: '🌱'.repeat(300),
      }).payload,
    ).toMatchObject({ motivo_rechazo: '🌱'.repeat(300) });
    expect(() =>
      parseRecepcionRechazo('100', {
        comando_id: key,
        revision_esperada: '5',
        motivo_rechazo: '🌱'.repeat(9),
      }),
    ).toThrow();
  });
  it.each([9, 501])('rechaza motivo de %i caracteres', (length) => {
    expect(() =>
      parseRecepcionRechazo('100', {
        comando_id: key,
        revision_esperada: '5',
        motivo_rechazo: 'a'.repeat(length),
      }),
    ).toThrow();
  });
  it('no admite fotos ni autoridad ni carga de recepción al rechazar', () => {
    for (const extra of [
      { evidencia_ids: ['1'] },
      { actor_id: '1' },
      { cantidad_recibida: 90 },
    ])
      expect(() =>
        parseRecepcionRechazo('100', {
          comando_id: key,
          revision_esperada: '5',
          motivo_rechazo: 'Cantidad no conforme',
          ...extra,
        }),
      ).toThrow();
  });
  it.each(['RECIBIR', 'RECHAZAR'] as const)(
    'acepta la decisión %s como comando confirmado',
    (accion) => {
      const r = recibo(accion);
      expect(
        validarReciboRecepcion(r, key, false, {
          actor: '20',
          origen: '9007199254740993',
          revision: '9007199254740992',
          accion,
        }),
      ).toEqual(r);
    },
  );
  it('una respuesta incompleta, acción ajena o revisión redondeada no confirma', () => {
    for (const r of [
      { http_status: 200, body: { comando_id: key, estado: 'CONFIRMADO' } },
      {
        ...recibo(),
        body: {
          ...recibo().body,
          resultado: {
            ...recibo().body.resultado,
            revision_nueva: 9007199254740992,
          },
        },
      },
      { ...recibo(), ejecucion_nueva: undefined },
    ])
      expect(() => validarReciboRecepcion(r, key)).toThrow();
    expect(() =>
      validarReciboRecepcion(recibo(), key, false, { actor: '99' }),
    ).toThrow();
    expect(() =>
      validarReciboRecepcion(recibo(), key, false, {
        actor: '20',
        accion: 'RECHAZAR',
      }),
    ).toThrow();
  });
  it('SIN_RESULTADO solo corresponde a recuperación202 y no prueba rollback', () => {
    const r = {
      http_status: 202,
      body: {
        comando_id: key,
        estado: 'SIN_RESULTADO',
        resultado: null,
        error: null,
        finalizado_en: null,
      },
    };
    expect(validarReciboRecepcion(r, key, true)).toEqual(r);
    expect(() => validarReciboRecepcion(r, key)).toThrow();
  });
});
