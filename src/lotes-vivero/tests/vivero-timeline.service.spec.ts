import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { LotesViveroService } from '../application/lotes-vivero.service';
import { ViveroTimelineService } from '../application/vivero-timeline.service';
import { TipoEventoVivero as E } from '../domain/enums/tipo-evento-vivero.enum';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';

type Row = Record<string, unknown>;
const lote = '9007199254740993';
const baseId = 9007199254741000n;
const event = (n: number, extra: Row = {}): Row => ({
  id: String(baseId + BigInt(n)),
  lote_id: lote,
  tipo_evento: E.ADAPTABILIDAD,
  fecha_evento: '2026-11-13',
  created_at: '2026-11-14',
  responsable_id: '77',
  cantidad_afectada: 10,
  usuario: { nombre: 'Nombre actual', apellido: null },
  ...extra,
});
const photo = (n: number, eventId = String(baseId)): Row => ({
  id: String(baseId + 10000n + BigInt(n)),
  entidad_id: eventId,
  tipo_entidad_id: '9',
  eliminado_en: null,
  bucket: 'vivero_incorporaciones',
  ruta_archivo: `privada/${n}.jpg`,
  mime_type: 'image/jpeg',
  tipo_archivo: 'FOTO',
  es_principal: false,
  orden: n,
  titulo: 'Conteo sintético',
  tamano_bytes: '120',
  tomado_en: '2026-11-14T08:00:00Z',
});

/** Transporte PostgREST sintético con filtros, orden, count exacto y límite del
 * servidor independiente al solicitado. No conecta DB ni Storage reales. */
function fixture(events: Row[], photos: Row[] = [], cap = 1000) {
  const state = {
    events,
    photos,
    cap,
    failCount: false,
    failPhotosAt: -1,
    photoQueries: 0,
    failSign: new Set<string>(),
    afterEventRead: null as (() => void) | null,
  };
  const calls: Array<{ table: string; columns: string; offset: number }> = [];
  const compare = (a: unknown, b: unknown, key: string) => {
    if (key.endsWith('id'))
      return BigInt(String(a)) < BigInt(String(b))
        ? -1
        : BigInt(String(a)) > BigInt(String(b))
          ? 1
          : 0;
    return a === b ? 0 : String(a) < String(b) ? -1 : 1;
  };
  const createSignedUrl = jest.fn(async (path: string, ttl: number) => {
    if (state.failSign.has(path))
      return { data: null, error: { message: 'firma no disponible' } };
    return {
      data: { signedUrl: `https://private.invalid/${path}?ttl=${ttl}` },
      error: null,
    };
  });
  const getPublicUrl = jest.fn((path: string) => ({
    data: { publicUrl: `https://legacy.invalid/${path}` },
  }));
  const client = {
    from(table: string) {
      const predicates: Array<(row: Row) => boolean> = [];
      const orders: Array<{ key: string; asc: boolean }> = [];
      let columns = '*',
        head = false,
        offset = 0,
        length = 1000;
      const execute = (single = false) => {
        calls.push({ table, columns, offset });
        if (state.failCount && head)
          return { data: null, count: null, error: { message: 'count falló' } };
        if (
          table === 'evidencias_trazabilidad' &&
          state.photoQueries++ === state.failPhotosAt
        )
          return { data: null, count: null, error: { message: 'fotos falló' } };
        const rows =
          table === 'lote_vivero'
            ? [lote, '22'].map((id) => ({
                id,
                codigo_trazabilidad: 'VIV-INC-sintetico',
                estado_lote: 'ACTIVO',
                nombre_responsable_snapshot: 'Responsable histórico',
              }))
            : table === 'evento_lote_vivero'
              ? state.events
              : table === 'evidencias_trazabilidad'
                ? state.photos
                : [{ id: '9', codigo: 'EVENTO_LOTE_VIVERO', activo: true }];
        const filtered = rows
          .filter((row) => predicates.every((p) => p(row)))
          .sort((a, b) => {
            for (const o of orders) {
              const c = compare(a[o.key], b[o.key], o.key);
              if (c) return o.asc ? c : -c;
            }
            return 0;
          });
        const data = head
          ? null
          : filtered.slice(
              offset,
              offset + Math.min(length, single ? 1000 : state.cap),
            );
        if (columns.includes('usuario:responsable_id'))
          state.afterEventRead?.();
        return {
          data: single ? (data?.[0] ?? null) : data,
          count: filtered.length,
          error: null,
        };
      };
      const q = {
        select(value: string, options?: { head?: boolean }) {
          columns = value;
          head = options?.head ?? false;
          return q;
        },
        eq(key: string, value: unknown) {
          predicates.push((r) => String(r[key]) === String(value));
          return q;
        },
        is(key: string, value: unknown) {
          predicates.push((r) => r[key] === value);
          return q;
        },
        ilike(key: string, value: string) {
          predicates.push(
            (r) => String(r[key]).toLowerCase() === value.toLowerCase(),
          );
          return q;
        },
        in(key: string, values: string[]) {
          predicates.push((r) => values.includes(String(r[key])));
          return q;
        },
        lte(key: string, value: unknown) {
          predicates.push((r) => compare(r[key], value, key) <= 0);
          return q;
        },
        gte(key: string, value: unknown) {
          predicates.push((r) => compare(r[key], value, key) >= 0);
          return q;
        },
        or(value: string) {
          const parts =
            /^fecha_evento\.gt\.([^,]+),and\(fecha_evento\.eq\.([^,]+),created_at\.gt\.([^)]+)\),and\(fecha_evento\.eq\.([^,]+),created_at\.eq\.([^,]+),id\.gt\.([^)]+)\)$/.exec(
              value,
            );
          if (!parts)
            throw new Error('Filtro de continuación inesperado: ' + value);
          predicates.push(
            (r) =>
              String(r.fecha_evento) > parts[1] ||
              (r.fecha_evento === parts[2] &&
                String(r.created_at) > parts[3]) ||
              (r.fecha_evento === parts[4] &&
                r.created_at === parts[5] &&
                BigInt(String(r.id)) > BigInt(parts[6])),
          );
          return q;
        },
        order(key: string, options: { ascending: boolean }) {
          orders.push({ key, asc: options.ascending });
          return q;
        },
        limit(value: number) {
          length = value;
          return q;
        },
        range(start: number, end: number) {
          offset = start;
          length = end - start + 1;
          return q;
        },
        maybeSingle: () => Promise.resolve(execute(true)),
        then: (
          yes: (value: unknown) => unknown,
          no: (error: unknown) => unknown,
        ) => Promise.resolve(execute()).then(yes, no),
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrl, getPublicUrl }) },
  };
  const supabase = {
    getAdminClient: () => client,
  } as unknown as SupabaseService;
  return {
    service: new ViveroTimelineService(supabase),
    state,
    calls,
    createSignedUrl,
    getPublicUrl,
  };
}

async function readAll(
  service: ViveroTimelineService,
  filters: FiltrarTimelineLoteDto = {},
) {
  const ids: Array<number | string> = [];
  let cursor: string | undefined;
  do {
    const page = (await service.obtenerTimeline(lote, { ...filters, cursor }))
      .data;
    ids.push(...page.eventos.map((e) => e.id));
    expect(page.paginacion.lectura_completa).toBe(!page.paginacion.hay_mas);
    cursor = page.paginacion.cursor_siguiente ?? undefined;
  } while (cursor);
  return ids;
}

describe('Timeline paginado, vínculos reales y fotos privadas', () => {
  it('recorre más de1000 eventos y conserva orden/IDs vecinos sin omisiones bajo un cap menor que limite', async () => {
    const f = fixture(
      Array.from({ length: 1007 }, (_, n) => event(n)),
      [],
      73,
    );
    const ids = await readAll(f.service, { limite: 200 });
    expect(ids).toEqual(
      Array.from({ length: 1007 }, (_, n) => String(baseId + BigInt(n))),
    );
    expect(new Set(ids).size).toBe(1007);
    expect(
      f.calls.filter((c) => c.columns.includes('usuario:responsable_id'))
        .length,
    ).toBe(14);
  });

  it('ordena por fecha física/DATE/ID y el corte excluye nuevas inserciones retroactivas hasta reiniciar lectura', async () => {
    const f = fixture([
      event(2),
      event(0),
      event(1, { fecha_evento: '2026-11-12' }),
    ]);
    const first = (await f.service.obtenerTimeline(lote, { limite: 1 })).data;
    expect(first.eventos[0].id).toBe(String(baseId + 1n));
    expect(first.paginacion.total_en_lectura).toBe(3);
    f.state.events.push(event(3, { fecha_evento: '2026-11-11' }));
    const next = (
      await f.service.obtenerTimeline(lote, {
        limite: 2,
        cursor: first.paginacion.cursor_siguiente!,
      })
    ).data;
    expect(next.eventos.map((e) => e.id)).toEqual([
      String(baseId),
      String(baseId + 2n),
    ]);
    expect(next.paginacion).toMatchObject({
      hay_mas: false,
      lectura_completa: true,
      corte_evento_id: String(baseId + 2n),
      total_en_lectura: 3,
    });
    expect((await readAll(f.service))[0]).toBe(String(baseId + 3n));
    expect(next.eventos[0].created_at).toBe('2026-11-14');
    expect(next.eventos[0].registrado_en).toBeNull();
  });

  it('mantiene filtros en todo el recorrido y rechaza cursores de otro lote/filtro o malformados', async () => {
    const f = fixture([
      event(0),
      event(1),
      event(2, { responsable_id: '88' }),
      event(3, { tipo_evento: E.MERMA }),
    ]);
    const filters = {
      limite: 1,
      responsable_id: '77',
      tipo_evento: E.ADAPTABILIDAD,
      fecha_inicio: '2026-11-13',
      fecha_fin: '2026-11-14',
    };
    const first = (await f.service.obtenerTimeline(lote, filters)).data;
    expect(first.paginacion.total_en_lectura).toBe(2);
    expect(await readAll(f.service, filters)).toEqual([
      String(baseId),
      String(baseId + 1n),
    ]);
    const cursor = first.paginacion.cursor_siguiente!;
    await expect(
      f.service.obtenerTimeline(lote, {
        ...filters,
        responsable_id: '88',
        cursor,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      f.service.obtenerTimeline('22', { ...filters, cursor }),
    ).rejects.toThrow(BadRequestException);
    for (const invalid of [
      '',
      'invalido',
      cursor + ',id.gt.0',
      'x'.repeat(2049),
    ])
      await expect(
        f.service.obtenerTimeline(lote, { cursor: invalid }),
      ).rejects.toThrow(BadRequestException);
  });

  it('exige reiniciar si confirma un ID reservado bajo el corte entre páginas o durante la primera página', async () => {
    const f = fixture([event(0), event(2)]);
    const first = (await f.service.obtenerTimeline(lote, { limite: 1 })).data;
    f.state.events.push(event(1, { fecha_evento: '2026-11-12' }));
    await expect(
      f.service.obtenerTimeline(lote, {
        cursor: first.paginacion.cursor_siguiente!,
      }),
    ).rejects.toThrow(ConflictException);
    expect(await readAll(f.service)).toEqual([
      String(baseId + 1n),
      String(baseId),
      String(baseId + 2n),
    ]);
    const concurrent = fixture([event(0), event(2)]);
    concurrent.state.afterEventRead = () => {
      concurrent.state.events.push(event(1, { fecha_evento: '2026-11-12' }));
      concurrent.state.afterEventRead = null;
    };
    await expect(
      concurrent.service.obtenerTimeline(lote, { limite: 1 }),
    ).rejects.toMatchObject({
      response: { error: { codigo: 'HISTORIAL_CAMBIO_DURANTE_LECTURA' } },
    });
  });

  it('no declara completitud si fallan el conteo o una página vacía truncada', async () => {
    const f = fixture([event(0)]);
    f.state.failCount = true;
    await expect(f.service.obtenerTimeline(lote, {})).rejects.toThrow(
      InternalServerErrorException,
    );
    const truncated = fixture([event(0)], [], 0);
    await expect(truncated.service.obtenerTimeline(lote, {})).rejects.toThrow(
      InternalServerErrorException,
    );
    const empty = (await fixture([]).service.obtenerTimeline(lote, {})).data;
    expect(empty.paginacion).toMatchObject({
      total_en_lectura: 0,
      hay_mas: false,
      cursor_siguiente: null,
      lectura_completa: true,
      corte_evento_id: null,
    });
  });

  it('proyecta vínculos exactos de despacho y devolución sin inventar relaciones o naturaleza de retorno', async () => {
    const links = {
      origen_despacho: 'ASIGNACION_SUBCAMPANIA',
      asignacion_id: '9007199254741993',
      subcampania_id: '9007199254742993',
      campania_id: '9007199254743993',
    };
    const f = fixture([
      event(0, { tipo_evento: E.DESPACHO, ...links }),
      event(1, { tipo_evento: E.DEVOLUCION_PLANTACION, ...links }),
      event(2, { tipo_evento: E.DESPACHO, origen_despacho: 'MANUAL' }),
    ]);
    const result = (await f.service.obtenerTimeline(lote, {})).data;
    expect(result.eventos[0].payload).toMatchObject({
      ...links,
      registro_plantacion_id: null,
    });
    expect(result.eventos[1].payload).toMatchObject({
      ...links,
      naturaleza_devolucion: 'NO_REGISTRADA',
    });
    expect(result.eventos[2].payload).toMatchObject({
      origen_despacho: 'MANUAL',
      asignacion_id: null,
      subcampania_id: null,
      campania_id: null,
      registro_plantacion_id: null,
    });
  });

  it('expone timestamp real sólo de incorporación y distingue snapshot de nombre actual o ausente', async () => {
    const f = fixture([
      event(0, {
        tipo_evento: E.INCORPORACION,
        incorporacion: {
          modalidad: 'SALDO_INICIAL',
          procedencia: 'DONACION',
          registrado_en: '2026-11-14T12:20:00Z',
        },
      }),
      event(1),
      event(2, { usuario: null }),
      event(3, { usuario: { nombre: null, apellido: null } }),
    ]);
    const { eventos } = (await f.service.obtenerTimeline(lote, {})).data;
    expect(eventos[0]).toMatchObject({
      registrado_en: '2026-11-14T12:20:00Z',
      responsable_nombre: 'Responsable histórico',
      responsable_nombre_fuente: 'SNAPSHOT_INCORPORACION',
    });
    expect(eventos[1]).toMatchObject({
      registrado_en: null,
      responsable_nombre: 'Nombre actual',
      responsable_nombre_fuente: 'CUENTA_ACTUAL',
    });
    for (const e of eventos.slice(2))
      expect(e).toMatchObject({
        responsable_nombre: null,
        responsable_nombre_fuente: 'NO_REGISTRADO',
      });
  });

  it('recorre más de1000 fotos legadas conservando metadata y firma privada TTL300', async () => {
    const f = fixture(
      [event(0)],
      Array.from({ length: 1007 }, (_, n) => photo(n)),
      73,
    );
    const result = (await f.service.obtenerTimeline(lote, {})).data.eventos[0];
    expect(result.estado_evidencias).toBe('CONSULTADAS');
    expect(result.evidencias).toHaveLength(1007);
    expect(result.evidencias[0]).toMatchObject({
      titulo: 'Conteo sintético',
      tamano_bytes: 120,
      tomado_en: '2026-11-14T08:00:00Z',
      estado_url: 'DISPONIBLE',
      url_expira_en_segundos: 300,
    });
    expect(f.getPublicUrl).not.toHaveBeenCalled();
    expect(f.createSignedUrl).toHaveBeenCalledTimes(1007);
    expect(f.state.photoQueries).toBe(14);
  });

  it('fallo de una firma conserva todos los eventos/fotos y el error no equivale a ausencia', async () => {
    const f = fixture(
      [event(0), event(1)],
      [photo(0), photo(1), photo(2, String(baseId + 1n))],
    );
    f.state.failSign.add('privada/1.jpg');
    const { eventos } = (await f.service.obtenerTimeline(lote, {})).data;
    expect(eventos).toHaveLength(2);
    expect(eventos[0].estado_evidencias).toBe('CONSULTADAS');
    expect(eventos[0].evidencias).toHaveLength(2);
    expect(eventos[0].evidencias[0]).toMatchObject({
      estado_url: 'DISPONIBLE',
    });
    expect(eventos[0].evidencias[1]).toMatchObject({
      estado_url: 'ERROR_FIRMA',
      signed_url: null,
      url_expira_en_segundos: null,
    });
    expect(eventos[1].evidencias[0]).toMatchObject({
      estado_url: 'DISPONIBLE',
    });
    f.state.photoQueries = 0;
    f.state.failPhotosAt = 0;
    const error = (await f.service.obtenerTimeline(lote, {})).data;
    expect(error.eventos).toHaveLength(2);
    expect(error.eventos[0]).toMatchObject({
      estado_evidencias: 'ERROR_CONSULTA',
      evidencias: [],
    });
  });

  it('fallo en una página posterior de fotos conserva las ya leídas y marca consulta incompleta', async () => {
    const f = fixture(
      [event(0)],
      Array.from({ length: 201 }, (_, n) => photo(n)),
    );
    f.state.failPhotosAt = 1;
    const result = (await f.service.obtenerTimeline(lote, {})).data.eventos[0];
    expect(result.estado_evidencias).toBe('ERROR_CONSULTA');
    expect(result.evidencias).toHaveLength(200);
  });

  it('revalida cuenta y permiso por lote antes de cada página; cursor no concede autoridad', async () => {
    const f = fixture([event(0), event(1)]);
    const getUserByAuthId = jest
      .fn()
      .mockResolvedValue({ id: '77', rol: 'GENERAL' });
    const assertLote = jest.fn().mockResolvedValue('1');
    const obtenerTimeline = jest.fn((id, filters) =>
      f.service.obtenerTimeline(id, filters),
    );
    const facade = Object.assign(Object.create(LotesViveroService.prototype), {
      authService: { getUserByAuthId, assertLote },
      consultasService: { obtenerTimeline },
    }) as LotesViveroService;
    const first = await facade.obtenerTimeline(
      lote,
      { limite: 1 },
      'sesion-verificada',
    );
    assertLote.mockRejectedValue(
      new ForbiddenException('CAPACIDAD_INSUFICIENTE'),
    );
    await expect(
      facade.obtenerTimeline(
        lote,
        { cursor: first.data.paginacion.cursor_siguiente! },
        'sesion-verificada',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(getUserByAuthId).toHaveBeenCalledTimes(2);
    expect(assertLote).toHaveBeenCalledTimes(2);
    expect(obtenerTimeline).toHaveBeenCalledTimes(1);
  });
});
