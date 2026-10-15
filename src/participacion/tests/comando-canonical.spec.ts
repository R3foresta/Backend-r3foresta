import { canonicalCommand } from '../comando-canonical';
import {
  parseAccess,
  parseAuthority,
  parseReplacement,
  parseRecovery,
} from '../dto/comandos.dto';
const uuid = '4ff8f9bb-4280-463d-95c8-97a3f11f122c';

describe('PA-COMANDO/1 vectores y DTO', () => {
  it('conserva BIGINT, orden numérico y bytes fijados con vector Python independiente', () => {
    const dto = parseAccess({
      comando_id: uuid,
      usuario_destino_id: '9007199254740993',
      ambitos: [
        { subcampania_id: '10', revision_esperada: '5' },
        { revision_esperada: '0', subcampania_id: '2' },
      ],
    });
    const vector = canonicalCommand('OTORGAR_PLANTADOR', dto.payload);
    expect(vector.contenido).toBe(
      '{"ambitos":[{"revision_esperada":"0","subcampania_id":"2"},{"revision_esperada":"5","subcampania_id":"10"}],"usuario_destino_id":"9007199254740993"}',
    );
    expect(vector.huella).toBe(
      '19cdd018044379d5bf6717017c52c48d90bcd015e0a30621335f861972e54cd0',
    );
  });
  it('misma intención ignora orden de claves/conjuntos y normaliza NFC/trim, sin colapsar espacios interiores', () => {
    const first = parseAuthority(
      {
        comando_id: uuid,
        revision_esperada: '2',
        motivo: '  Gestio\u0301n  nueva  ',
        rol_global: 'GENERAL',
      },
      '42',
      true,
    );
    const second = parseAuthority(
      {
        motivo: 'Gestión  nueva',
        rol_global: 'GENERAL',
        comando_id: uuid,
        revision_esperada: '2',
      },
      '42',
      true,
    );
    expect(canonicalCommand('CAMBIAR_ROL_GLOBAL', first.payload)).toEqual(
      canonicalCommand('CAMBIAR_ROL_GLOBAL', second.payload),
    );
    expect(first.payload.motivo).toBe('Gestión  nueva');
  });
  it.each([
    { usuario_destino_id: 42 },
    { usuario_destino_id: '01' },
    { usuario_destino_id: '9223372036854775808' },
    { actor_id: '1' },
    { comando_id: uuid.toUpperCase() },
    { comando_id: 'not-uuid' },
    { ambitos: [] },
    { ambitos: [{ subcampania_id: '1', revision_esperada: '00' }] },
    {
      ambitos: [
        { subcampania_id: '1', revision_esperada: '0' },
        { subcampania_id: '1', revision_esperada: '0' },
      ],
    },
  ])('rechaza entrada no canónica %j', (variation) => {
    expect(() =>
      parseAccess({
        comando_id: uuid,
        usuario_destino_id: '42',
        ambitos: [{ subcampania_id: '1', revision_esperada: '0' }],
        ...variation,
      }),
    ).toThrow();
  });
  it('reemplazo exige personas distintas y ambas revisiones', () => {
    const base = {
      comando_id: uuid,
      usuario_saliente_id: '42',
      usuario_reemplazo_id: '43',
      tratamiento_saliente: 'SIN_ACCESO',
      ambitos: [
        {
          subcampania_id: '1',
          revision_saliente_esperada: '3',
          revision_reemplazo_esperada: '0',
        },
      ],
    };
    expect(
      parseReplacement(base).payload.ambitos[0].revision_reemplazo_esperada,
    ).toBe('0');
    expect(() =>
      parseReplacement({ ...base, usuario_reemplazo_id: '42' }),
    ).toThrow();
    expect(() =>
      parseReplacement({
        ...base,
        ambitos: [{ subcampania_id: '1', revision_saliente_esperada: '3' }],
      }),
    ).toThrow();
  });
  it('recuperación no acepta actor ni bootstrap operacional', () => {
    expect(() =>
      parseRecovery(uuid, { operacion: 'OTORGAR_PLANTADOR', actor_id: '42' }),
    ).toThrow();
    expect(() =>
      parseRecovery(uuid, { operacion: 'INICIALIZAR_PARTICIPACION_LEGADA' }),
    ).toThrow();
  });
});
