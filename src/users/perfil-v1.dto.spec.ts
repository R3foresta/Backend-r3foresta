import { parsePerfil, parseSelector } from './perfil-v1.dto';

describe('contrato de entrada perfil v1', () => {
  it.each([
    {},
    { nombre: null },
    { nombre: '' },
    { nombre: 'A'.repeat(101) },
    { apellido: 'A'.repeat(31) },
    { rol: 'ADMIN' },
    { actor_id: '2' },
    { activo: true },
    { afiliacion: {} },
    { afiliacion: { tipo: 'OTRA', nombre: '' } },
    { afiliacion: { tipo: 'OTRA', nombre: 'A'.repeat(151) } },
    { afiliacion: { tipo: 'OTRA', nombre: 'A', organizacion_id: '2' } },
    { afiliacion: { tipo: 'ORGANIZACION_REGISTRADA', organizacion_id: 2 } },
    { afiliacion: { tipo: 'ORGANIZACION_REGISTRADA', organizacion_id: '02' } },
    {
      afiliacion: {
        tipo: 'ORGANIZACION_REGISTRADA',
        organizacion_id: '9223372036854775808',
      },
    },
    {
      afiliacion: {
        tipo: 'ORGANIZACION_REGISTRADA',
        organizacion_id: '2',
        nombre: 'Inventado',
      },
    },
  ])('rechaza entrada fuera del contrato %#', (input) => {
    expect(() => parsePerfil(input)).toThrow();
  });

  it('respeta límites, normalización, omisión y borrado opcional', () => {
    expect(parsePerfil({ nombre: ' A\u0301na ', apellido: '  ' })).toEqual({
      nombre: 'Ána',
      apellido: null,
    });
    expect(parsePerfil({ apellido: null })).toEqual({ apellido: null });
    expect(parsePerfil({ afiliacion: null })).toEqual({ afiliacion: null });
    expect(
      parsePerfil({
        nombre: 'A'.repeat(100),
        apellido: 'B'.repeat(30),
        afiliacion: { tipo: 'OTRA', nombre: 'C'.repeat(150) },
      }),
    ).toEqual({
      nombre: 'A'.repeat(100),
      apellido: 'B'.repeat(30),
      afiliacion: { tipo: 'OTRA', nombre: 'C'.repeat(150) },
    });
  });

  it.each([
    { consulta: 'A' },
    { consulta: 'A'.repeat(101) },
    { limite: ['1'] },
    { limite: '0' },
    { limite: '21' },
    { limite: '1.5' },
    { cursor: 'A'.repeat(1025) },
    { actor_id: '2' },
  ])('rechaza selector inválido %#', (input) => {
    expect(() => parseSelector(input)).toThrow();
  });

  it('valida selector acotado y consulta NFC', () => {
    expect(parseSelector({})).toEqual({
      consulta: null,
      limite: 20,
      cursor: null,
    });
    expect(parseSelector({ consulta: ' A\u0301rbol ', limite: '1' })).toEqual({
      consulta: 'Árbol',
      limite: 1,
      cursor: null,
    });
  });
});
