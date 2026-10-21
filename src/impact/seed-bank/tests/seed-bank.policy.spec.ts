import { parseSeedQuery } from '../seed-bank.dto';
import {
  projectSeed,
  seedExplorer,
  seedOverview,
} from '../../domain/policies/seed-bank.policy';
import {
  EXPLORER,
  seedFixture,
} from '../../../../test/fixtures/seed-bank.fixture';

describe('Políticas de publicación del banco de semillas', () => {
  it.each([
    ['ipfs://metadata', '42', null],
    ['https://ipfs.io/ipfs/metadata', '42', null],
    ['https://images.example/42.jpg', '42', null],
    [EXPLORER, '99', null],
    [
      EXPLORER.replace('somnia.network', 'somnia.network.evil.example'),
      '42',
      null,
    ],
    [EXPLORER.replace('https://', 'https://person:secret@'), '42', null],
    [EXPLORER + '?metadata=1', '42', null],
    [EXPLORER + '#private', '42', null],
    [EXPLORER.replace('https:', 'javascript:'), '42', null],
  ])('no publica como mint el enlace %s', (url, token, hash) => {
    expect(seedExplorer(url, token, hash)).toBeNull();
  });
  it('solo publica el explorador cuyo token o transacción coincide con la fuente', () => {
    const hash = `0x${'a'.repeat(64)}`;
    expect(seedExplorer(EXPLORER, '42', null)).toBe(EXPLORER);
    expect(seedExplorer(EXPLORER, null, null)).toBe(EXPLORER);
    const tx = `https://shannon-explorer.somnia.network/tx/${hash}`;
    expect(seedExplorer(tx, null, hash)).toBe(tx);
    expect(seedExplorer(tx, null, `0x${'b'.repeat(64)}`)).toBeNull();
  });
  it('conserva nombres históricos, no inventa acuñación y deja campos desconocidos explícitos', () => {
    const fixture = seedFixture();
    const row = projectSeed(fixture.tables.recoleccion[0]);
    expect(row.planta).toMatchObject({
      nombre_comun_principal: 'Árbol histórico',
      nombre_cientifico: 'Científico histórico',
    });
    expect(row.ubicacion).toBeNull();
    expect(row.blockchain).toBeNull();
    const withToken = projectSeed(fixture.tables.recoleccion[3]);
    expect(withToken.blockchain).toEqual({
      token_id: '99',
      explorer_url: null,
      transaction_hash: null,
      network: null,
      minted_at: null,
    });
  });
  it('normaliza decimales y evita sumar saldos parciales; una ubicación sin nombre sigue contando', () => {
    const fixture = seedFixture();
    const rows = [
      projectSeed(fixture.tables.recoleccion[6], {}),
      projectSeed(fixture.tables.recoleccion[7], {}),
    ];
    const overview = seedOverview(rows, '2026-10-21T00:00:00Z');
    expect(overview.summary.totalsByUnit).toEqual([
      { unit: 'G', collected: 0.3, available: 0.3 },
    ]);
    expect(overview.summary.locationsCount).toBe(1);
    expect(overview.filters.locations).toEqual([
      { id: 1, name: 'Ubicación 1' },
    ]);
    rows[0].saldo_actual = null;
    expect(
      seedOverview(rows, '2026-10-21T00:00:00Z').summary.totalsByUnit[0]
        .available,
    ).toBeNull();
  });
  it.each([
    { cantidad_inicial_canonica: null },
    { cantidad_inicial_canonica: -1 },
    { cantidad_inicial_canonica: Infinity },
    { cantidad_inicial_canonica: '' },
    {
      cantidad_inicial_canonica: Number.MAX_SAFE_INTEGER,
      unidad_canonica: 'KG',
    },
    { saldo_actual: -1 },
    { saldo_actual: NaN },
    { saldo_actual: '' },
    { unidad_canonica: 'GR' },
    { cantidad_inicial_canonica: 1.5, unidad_canonica: 'UNIDAD' },
    { saldo_actual: 1.5, unidad_canonica: 'UNIDAD' },
    { id: '9007199254740992' },
    { planta_id: null },
    { fecha: '2026-02-30' },
    { estado_registro: 'DESCONOCIDO' },
    { tipo_material: 'ESQUEJE' },
  ])('no oculta datos incompatibles ni inventa valores para %j', (values) => {
    expect(() =>
      projectSeed({ ...seedFixture().tables.recoleccion[0], ...values }),
    ).toThrow();
  });
  it('rechaza filtros en resumen/detalle y límites que desbordan el offset', () => {
    expect(() => parseSeedQuery({ page: '1' }, false)).toThrow();
    expect(() =>
      parseSeedQuery({
        page: String(Number.MAX_SAFE_INTEGER),
        pageSize: '100',
      }),
    ).toThrow();
  });
});
