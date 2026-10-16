import { canonicalCommand } from '../comando-canonical';
import {
  parseParticipantesQuery,
  parseRegistroInicial,
} from '../dto/registro.dto';

const base = {
  comando_id: '4ff8f9bb-4280-463d-95c8-97a3f11f122c',
  subcampania_id: '11',
  plan_revision_esperada: '2',
  fecha_plantacion: '2026-10-13',
  latitud: -16.5,
  longitud: -68.1,
  especies: [{ planta_id: '8', cantidad: 30 }],
  coresponsable_ids: [],
  evidencia_ids: ['901'],
};
describe('Registro inicial: contrato de intención PA-COMANDO/1', () => {
  it('fija vector independiente Python con coordenadas decimales de seis posiciones', () => {
    const value = canonicalCommand(
      'REGISTRAR_PLANTACION_INICIAL',
      parseRegistroInicial(base, '42').payload,
    );
    expect(value.contenido).toBe(
      '{"afiliaciones_declaradas":[],"coresponsable_ids":[],"especies":[{"cantidad":30,"planta_id":"8"}],"evidencia_ids":["901"],"fecha_plantacion":"2026-10-13","latitud":"-16.500000","longitud":"-68.100000","observaciones":null,"plan_revision_esperada":"2","subcampania_id":"11"}',
    );
    expect(value.huella).toBe(
      '39b7c9878c3994e82264713f69ce9b0f0e4b7e79528cdc0f324ba83fe9675994',
    );
  });
  it.each([undefined, null, '', '  '])(
    'normaliza observaciones %j y ausencia de declaración',
    (observaciones) => {
      expect(
        parseRegistroInicial(
          { ...base, observaciones, afiliaciones_declaradas: [] },
          '42',
        ).payload,
      ).toEqual(parseRegistroInicial(base, '42').payload);
    },
  );
  it('ordena conjuntos numéricamente y conserva declaración null distinta de falta de declaración', () => {
    const payload = parseRegistroInicial(
      {
        ...base,
        coresponsable_ids: ['10', '2'],
        evidencia_ids: ['901', '3'],
        afiliaciones_declaradas: [
          { usuario_id: '42', afiliacion: null },
          {
            usuario_id: '2',
            afiliacion: {
              tipo: 'OTRA',
              nombre: '  Asociacio\u0301n  propia  ',
            },
          },
        ],
      },
      '42',
    ).payload;
    expect(payload.coresponsable_ids).toEqual(['2', '10']);
    expect(payload.evidencia_ids).toEqual(['3', '901']);
    expect(payload.afiliaciones_declaradas).toEqual([
      {
        usuario_id: '2',
        afiliacion: { tipo: 'OTRA', nombre: 'Asociación  propia' },
      },
      { usuario_id: '42', afiliacion: null },
    ]);
    expect(
      canonicalCommand('REGISTRAR_PLANTACION_INICIAL', payload).huella,
    ).not.toBe(
      canonicalCommand('REGISTRAR_PLANTACION_INICIAL', {
        ...payload,
        afiliaciones_declaradas: [],
      }).huella,
    );
  });
  it('normaliza -0 y acepta precisión exactamente representable de hasta seis decimales', () => {
    const payload = parseRegistroInicial(
      { ...base, latitud: -0, longitud: 0.123456 },
      '42',
    ).payload;
    expect(Object.is(payload.latitud, -0)).toBe(false);
    expect(
      canonicalCommand('REGISTRAR_PLANTACION_INICIAL', payload).contenido,
    ).toContain('"latitud":"0.000000"');
  });
  it.each([
    { responsable_id: '42' },
    { es_reposicion: false },
    { huella: 'fake' },
    { asignacion_id: '1' },
    { subcampania_id: 11 },
    { plan_revision_esperada: '00' },
    { fecha_plantacion: '2026-02-30' },
    { fecha_plantacion: '2026-10-13T00:00:00Z' },
    { latitud: 0.1234567 },
    { longitud: Infinity },
    { especies: [] },
    { especies: [{ planta_id: '8', cantidad: 0 }] },
    {
      especies: [
        { planta_id: '8', cantidad: 2147483647 },
        { planta_id: '9', cantidad: 1 },
      ],
    },
    {
      especies: [
        { planta_id: '8', cantidad: 1 },
        { planta_id: '8', cantidad: 2 },
      ],
    },
    { coresponsable_ids: ['42'] },
    { coresponsable_ids: ['2', '2'] },
    { evidencia_ids: [] },
    { evidencia_ids: ['901', '901'] },
    { observaciones: 'x'.repeat(2001) },
    { afiliaciones_declaradas: [{ usuario_id: '5', afiliacion: null }] },
    {
      afiliaciones_declaradas: [
        { usuario_id: '42', afiliacion: { tipo: 'OTRA', nombre: ' ' } },
      ],
    },
    {
      afiliaciones_declaradas: [
        {
          usuario_id: '42',
          afiliacion: {
            tipo: 'ORGANIZACION_REGISTRADA',
            organizacion_id: '1',
            nombre: 'falso',
          },
        },
      ],
    },
  ])('rechaza entrada incompatible antes del comando %j', (variation) => {
    expect(() =>
      parseRegistroInicial({ ...base, ...variation }, '42'),
    ).toThrow();
  });
  it('pagina personas con límites precisos y rechaza controles extra', () => {
    expect(parseParticipantesQuery({})).toEqual({
      q: null,
      cursor: null,
      limite: 20,
    });
    expect(() => parseParticipantesQuery({ limite: '21' })).toThrow();
    expect(() => parseParticipantesQuery({ actor_id: '42' })).toThrow();
  });
});
