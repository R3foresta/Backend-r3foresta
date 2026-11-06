import { parseRecepcionComando } from '../api/dto/recepcion-semillas.dto';
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
describe('Contrato de recepción T4', () => {
  it('mantiene origen, evidencia y revisión BIGINT exactos', () => {
    const r = parseRecepcionComando('9007199254740993', input());
    expect(r.payload.recoleccion_id).toBe('9007199254740993');
    expect(r.payload.revision_esperada).toBe('9007199254740992');
    expect(r.payload.evidencia_ids).toEqual(['9007199254740993']);
  });
  it.each([
    { actor_id: '1' },
    { vivero_id: '1' },
    { fotos: 'base64' },
    { revision_esperada: 9007199254740992 },
    { evidencia_ids: [9007199254740992] },
    { fecha_recepcion: '2026-02-30' },
    { cantidad_recibida: Infinity },
  ])('rechaza autoridad/carga inválida %j', (extra) => {
    expect(() =>
      parseRecepcionComando('100', { ...input(), ...extra }),
    ).toThrow();
  });
  it('solo permite resolución explícita con ID y motivo completo', () => {
    expect(() =>
      parseRecepcionComando('100', { ...input(), incidencia_id: '9' }),
    ).toThrow();
    const r = parseRecepcionComando('100', {
      ...input(),
      incidencia_id: '9',
      motivo_resolucion: '  Nueva comprobación física conforme  ',
    });
    expect(r.payload.motivo_resolucion).toBe(
      'Nueva comprobación física conforme',
    );
  });
  it('una respuesta incompleta o revisión redondeada no se presenta como confirmación', () => {
    expect(() =>
      validarReciboRecepcion(
        {
          http_status: 200,
          body: {
            comando_id: key,
            estado: 'CONFIRMADO',
            resultado: { revision_nueva: 9007199254740992 },
            error: null,
            finalizado_en: new Date().toISOString(),
          },
        },
        key,
      ),
    ).toThrow();
    expect(() =>
      validarReciboRecepcion(
        { http_status: 200, body: { comando_id: key, estado: 'CONFIRMADO' } },
        key,
      ),
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
