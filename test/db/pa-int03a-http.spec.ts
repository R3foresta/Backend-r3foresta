import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import {
  startHarness,
  sql,
  rpc,
  faults,
  token,
} from '../../scripts/qa/pa-int03a-harness';

const base = '/api/v1';
const operation = 'REGISTRAR_PLANTACION_INICIAL';
const suffix = '?operacion=' + operation;
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const literal = (value: string) => "'" + value.replace(/'/g, "''") + "'";

describe('PA INT03-A HTTP → guard/service/RPC/PostGIS y objetos privados reales', () => {
  let harness: Awaited<ReturnType<typeof startHarness>>;
  let png: Buffer;
  let today: string;
  const cases: string[] = [];
  const examples: Record<string, unknown> = {};
  const capture = (
    name: string,
    response: { status: number; body: unknown },
  ) => {
    examples[name] = { http: response.status, body: response.body };
  };
  const get = (path: string, actor = 801) =>
    request(harness.app.getHttpServer())
      .get(base + path)
      .set('Authorization', token(actor));
  const post = (path: string, body: unknown, actor = 801) =>
    request(harness.app.getHttpServer())
      .post(base + path)
      .set('Authorization', token(actor))
      .send(body);
  const upload = (key: string, carga: string, bytes = png, actor = 801) =>
    request(harness.app.getHttpServer())
      .put(
        base + '/participacion/comandos/' + key + '/cargas/' + carga + suffix,
      )
      .set('Authorization', token(actor))
      .attach('foto', bytes, {
        filename: 'foto.png',
        contentType: 'image/png',
      });
  async function prepare(scope = '820', actor = 801) {
    const key = randomUUID();
    const reply = await post(
      '/participacion/comandos/preparaciones',
      { comando_id: key, operacion: operation, subcampania_id: scope },
      actor,
    );
    expect(reply.body).toMatchObject({
      data: { comando_id: key, estado: 'PREPARADO' },
    });
    expect(reply.status).toBe(200);
    return key;
  }
  async function ready(scope = '820', actor = 801) {
    const key = await prepare(scope, actor);
    const carga = randomUUID();
    const photo = await upload(key, carga, png, actor);
    expect(photo.body).toMatchObject({
      data: { carga_id: carga, estado: 'DISPONIBLE' },
    });
    expect(photo.status).toBe(201);
    return { key, carga, evidencia: photo.body.data.evidencia_id as string };
  }
  function payload(photo: { key: string; evidencia: string }, scope = '820') {
    return {
      comando_id: photo.key,
      subcampania_id: scope,
      plan_revision_esperada: '0',
      fecha_plantacion: today,
      latitud: -16.5,
      longitud: -68.1,
      especies: [{ planta_id: '8', cantidad: 1 }],
      coresponsable_ids: [],
      evidencia_ids: [photo.evidencia],
      observaciones: 'Nota privada HTTP',
    };
  }
  beforeAll(async () => {
    png = await sharp({
      create: { width: 4, height: 3, channels: 3, background: '#228b22' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'METADATA_PRIVADA_FIXTURE' } } })
      .png()
      .toBuffer();
    today = await sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date");
    harness = await startHarness();
  });
  afterEach(() => {
    cases.push(expect.getState().currentTestName ?? '');
    Object.assign(faults, {
      uploadAfterWriteOnce: false,
      uploadBeforeWriteOnce: false,
      removeOnce: false,
      finalizeAfterCommitOnce: false,
      registroAfterCommitOnce: false,
      blockUpload: null,
    });
  });
  afterAll(async () => {
    await harness?.app.close();
    const path = resolve('docs/evidencia/pa-int03a-local.json');
    const evidence = JSON.parse(readFileSync(path, 'utf8'));
    evidence.http_casos = cases;
    evidence.storage = {
      tipo: 'Archivos privados reales en directorio efímero 0700, objetos 0600; URLs HMAC verificadas por HTTP',
      original_sha256: hash(png),
      formatos: ['JPEG', 'PNG', 'WEBP', 'HEIC', 'HEIF'],
      fallos_inyectados: [
        'upload confirma objeto y pierde respuesta',
        'upload falla antes de escribir',
        'finalización DB confirma y pierde respuesta',
        'registro DB confirma y pierde respuesta',
        'upload bloqueado antes de escribir, cancelación/cleanup y aparición atrasada',
        'registro confirma una foto y omite otra reservada en tránsito, invalida lease y barre aparición atrasada',
        'remove falla una vez',
      ],
      limite:
        'No acredita políticas remotas del bucket Supabase ni red de producción',
    };
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
    writeFileSync(
      resolve('docs/pa-int03a-ejemplos.json'),
      JSON.stringify(
        {
          origen:
            'HTTP real contra fixture local sintético, sin tokens ni URLs firmadas persistidas',
          ejemplos: examples,
        },
        null,
        2,
      ) + '\n',
    );
  });

  it('rechaza visitante, cuenta inactiva y x-auth-id discordante; cache privada', async () => {
    const noAuth = await request(harness.app.getHttpServer())
      .get(base + '/subcampanias/820/contexto-registro')
      .set('x-user-role', 'ADMIN');
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers['cache-control']).toBe('private, no-store');
    expect((await get('/subcampanias/820/contexto-registro', 805)).status).toBe(
      403,
    );
    const mismatch = await get('/subcampanias/820/contexto-registro').set(
      'x-auth-id',
      'a-http-800',
    );
    expect(mismatch.status).toBe(401);
    expect((await get('/subcampanias/820/contexto-registro', 804)).status).toBe(
      404,
    );
  });
  it('contexto real y paginación de candidatos no exponen stock interno ni perfiles', async () => {
    const response = await get('/subcampanias/820/contexto-registro');
    expect(response.status).toBe(200);
    expect(response.body.data.actor.fuente_autoridad).toBe('CONTEXTUAL');
    expect(response.body.data.subcampania.poligono.type).toBe('Polygon');
    expect(JSON.stringify(response.body)).not.toMatch(
      /asignacion_id|lote_vivero_id|contacto|auth_id|equipo/,
    );
    const first = await get(
      '/subcampanias/820/participantes-seleccionables?limite=1',
    );
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.siguiente_cursor).toEqual(expect.any(String));
    const second = await get(
      '/subcampanias/820/participantes-seleccionables?limite=1&cursor=' +
        encodeURIComponent(first.body.siguiente_cursor),
    );
    expect(second.status).toBe(200);
    expect(second.body.data[0].usuario_id).not.toBe(
      first.body.data[0].usuario_id,
    );
    expect(
      (
        await get(
          '/subcampanias/821/participantes-seleccionables?cursor=' +
            encodeURIComponent(first.body.siguiente_cursor),
        )
      ).status,
    ).toBe(422);
    capture('contexto_autorizado', response);
    capture('seleccionables_pagina', first);
  });
  it('PREPARADO recupera 202 y exige DTO estricto, multipart y bytes realmente decodificables', async () => {
    const key = await prepare();
    const recovery = await get('/participacion/comandos/' + key + suffix);
    expect(recovery.status).toBe(202);
    expect(recovery.body.estado).toBe('SIN_RESULTADO');
    expect(
      (
        await post('/participacion/comandos/preparaciones', {
          comando_id: randomUUID(),
          operacion: operation,
          subcampania_id: '820',
          actor_id: '800',
        })
      ).status,
    ).toBe(422);
    const malformed = await upload(key, randomUUID(), Buffer.from('no-imagen'));
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.codigo).toBe('FOTO_NO_DECODIFICABLE');
    const base64 = await request(harness.app.getHttpServer())
      .put(
        base +
          '/participacion/comandos/' +
          key +
          '/cargas/' +
          randomUUID() +
          suffix,
      )
      .set('Authorization', token(801))
      .send({ foto: png.toString('base64') });
    expect(base64.status).toBe(422);
    const bigCarga = randomUUID();
    const tooBig = await upload(
      key,
      bigCarga,
      Buffer.alloc(10 * 1024 * 1024 + 1),
    );
    expect(tooBig.status).toBe(422);
    expect(tooBig.body.error.codigo).toBe('ENTRADA_INVALIDA');
    expect(
      await sql(
        'SELECT count(*) FROM public.participacion_carga WHERE carga_id=' +
          literal(bigCarga),
      ),
    ).toBe('0');
    capture('preparacion_inconclusa', recovery);
  });
  it.each(['jpeg', 'png', 'webp', 'heic', 'heif'])(
    'decodifica %s real y elimina metadata del derivado JPEG',
    async (format) => {
      const key = await prepare();
      let bytes: Buffer;
      if (format === 'heic' || format === 'heif') {
        bytes = await readFile(
          resolve('test/db/fixtures/pa-int03a/sintetica.heic'),
        );
        if (format === 'heif') {
          bytes = Buffer.from(bytes);
          bytes.write('mif1', 8, 'ascii');
        }
      } else
        bytes = await sharp(png)
          .withMetadata()
          .toFormat(format as 'jpeg' | 'png' | 'webp')
          .toBuffer();
      const carga = randomUUID();
      const response = await upload(key, carga, bytes);
      expect(response.body).toMatchObject({ data: { estado: 'DISPONIBLE' } });
      expect(response.status).toBe(201);
      const rows = JSON.parse(
        await sql(
          'SELECT to_jsonb(c) FROM public.participacion_carga c WHERE carga_id=' +
            literal(carga),
        ),
      );
      const original = await readFile(
        resolve(harness.storage, rows.bucket, rows.ruta_original),
      );
      const derived = await readFile(
        resolve(harness.storage, rows.bucket, rows.ruta_derivada),
      );
      expect(hash(original)).toBe(hash(bytes));
      expect(rows.hash_original_sha256).toBe('\\x' + hash(bytes));
      const decoded = await sharp(derived).metadata();
      expect(decoded.format).toBe('jpeg');
      expect(decoded.width).toBeGreaterThan(0);
      expect(decoded.exif).toBeUndefined();
      expect(decoded.xmp).toBeUndefined();
      expect(rows.hash_derivada_sha256).toBe('\\x' + hash(derived));
    },
  );
  it('preview propio firmado 5 minutos; ADMIN ajeno y objeto directo permanecen privados', async () => {
    const photo = await ready();
    const preview = await get(
      '/participacion/cargas/' + photo.carga + '/preview',
    );
    expect(preview.status).toBe(200);
    expect(preview.headers['cache-control']).toBe('private, no-store');
    const expires = Date.parse(preview.body.data.expira_en) - Date.now();
    expect(expires).toBeGreaterThan(290000);
    expect(expires).toBeLessThanOrEqual(300000);
    const signed = await request(harness.origin).get(
      new URL(preview.body.data.url).pathname +
        new URL(preview.body.data.url).search,
    );
    expect(signed.status).toBe(200);
    expect((await sharp(signed.body).metadata()).format).toBe('jpeg');
    expect(
      (
        await request(harness.origin).get(
          '/_fixture/storage?bucket=participacion_evidencias&path=1/original',
        )
      ).status,
    ).toBe(404);
    expect(
      (await get('/participacion/cargas/' + photo.carga + '/preview', 803))
        .status,
    ).toBe(404);
    expect(
      (
        await request(harness.origin).get(
          base + '/impact/fotos/' + photo.evidencia,
        )
      ).status,
    ).toBe(404);
    examples.preview_propio = {
      http: 200,
      body: {
        ...preview.body,
        data: {
          url: '<URL_FIRMADA_LOCAL_5_MIN>',
          expira_en: preview.body.data.expira_en,
        },
      },
    };
  });
  it('mismos bytes recuperan misma evidencia; otros bytes 409 y máximo diez cargas', async () => {
    const photo = await ready();
    const again = await upload(photo.key, photo.carga);
    expect(again.status).toBe(200);
    expect(again.body.data.evidencia_id).toBe(photo.evidencia);
    const other = await sharp(png).negate().png().toBuffer();
    expect((await upload(photo.key, photo.carga, other)).status).toBe(409);
    for (let index = 1; index < 10; index++)
      expect((await upload(photo.key, randomUUID())).status).toBe(201);
    const overflow = await upload(photo.key, randomUUID());
    expect(overflow.status).toBe(422);
    expect(overflow.body.error.codigo).toBe('LIMITE_CARGAS');
  });
  it('reconcilia respuesta perdida Storage y finalización DB sin duplicar evidencia ni objetos', async () => {
    const key = await prepare();
    const carga = randomUUID();
    faults.uploadAfterWriteOnce = true;
    expect((await upload(key, carga)).status).toBe(201);
    expect((await upload(key, carga)).status).toBe(200);
    const key2 = await prepare();
    const carga2 = randomUUID();
    faults.finalizeAfterCommitOnce = true;
    expect((await upload(key2, carga2)).status).toBe(503);
    const recovered = await upload(key2, carga2);
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.estado).toBe('DISPONIBLE');
    expect(
      await sql(
        'SELECT count(*) FROM public.evidencias_trazabilidad WHERE id=(SELECT evidencia_id FROM public.participacion_carga WHERE carga_id=' +
          literal(carga2) +
          ')',
      ),
    ).toBe('1');
  });
  it('Storage antes de escritura deja 202 recuperable y nueva generación invalida lease anterior', async () => {
    const key = await prepare();
    const carga = randomUUID();
    faults.uploadBeforeWriteOnce = true;
    const pending = await upload(key, carga);
    expect(pending.status).toBe(202);
    expect(pending.body.data.estado).toBe('RESERVADA');
    const old = JSON.parse(
      await sql(
        'SELECT to_jsonb(c) FROM public.participacion_carga c WHERE carga_id=' +
          literal(carga),
      ),
    );
    await sql(
      "UPDATE public.participacion_carga SET lease_hasta=clock_timestamp()-interval '1 second' WHERE carga_id=" +
        literal(carga),
    );
    const stale = await rpc('pa_cargas_operar', {
      p_actor_id: '801',
      p_auth_id: 'a-http-801',
      p_accion: 'FINALIZAR',
      p_comando_id: key,
      p_payload: {
        carga_id: carga,
        hash_original: hash(png),
        hash_derivada: old.hash_derivada_sha256.slice(2),
        generacion: 1,
        lease_token: old.lease_token,
        objetos_verificados: true,
      },
    });
    expect(stale.data.http_status).toBe(409);
    expect(stale.data.body.error.codigo).toBe('LEASE_CARGA_INVALIDO');
    const recovered = await upload(key, carga);
    expect(recovered.status).toBe(200);
    expect(
      await sql(
        'SELECT generacion FROM public.participacion_carga WHERE carga_id=' +
          literal(carga),
      ),
    ).toBe('2');
    const invalid = await rpc('pa_cargas_operar', {
      p_actor_id: '801',
      p_auth_id: 'a-http-801',
      p_accion: 'FINALIZAR',
      p_comando_id: key,
      p_payload: {
        carga_id: carga,
        hash_original: hash(png),
        hash_derivada: old.hash_derivada_sha256.slice(2),
        generacion: 1,
        lease_token: old.lease_token,
        objetos_verificados: true,
      },
    });
    // La identidad ya DISPONIBLE se recupera sin escribir, y el ledger viejo nunca vuelve a VALIDA.
    expect(invalid.data.body.data.estado).toBe('DISPONIBLE');
    expect(
      await sql(
        'SELECT estado FROM public.participacion_carga_generacion WHERE carga_interna_id=' +
          old.id +
          ' AND generacion=1',
      ),
    ).toBe('OBSOLETA');
  });
  it('upload atrasado tras cancelar/limpiar reaparece y el ledger durable lo vuelve a borrar', async () => {
    const key = await prepare();
    const carga = randomUUID();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    faults.blockUpload = { entered, wait };
    const pending = upload(key, carga).then((response) => response);
    await Promise.race([
      started,
      pending.then(() => {
        throw new Error('Upload terminó antes de llegar a Storage bloqueado.');
      }),
    ]);
    const row = JSON.parse(
      await sql(
        'SELECT to_jsonb(c) FROM public.participacion_carga c WHERE carga_id=' +
          literal(carga),
      ),
    );
    try {
      const discarded = await post(
        '/participacion/comandos/' + key + '/descarte-preparacion',
        { operacion: operation },
      );
      expect(discarded.status).toBe(200);
      expect(discarded.body.error.codigo).toBe('PREPARACION_CANCELADA');
      await harness.cargas.limpiar();
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          (await sql(
            'SELECT limpieza_estado FROM public.participacion_carga_generacion WHERE carga_interna_id=' +
              row.id,
          )) === 'BORRADO_VERIFICADO'
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(
        await sql(
          'SELECT limpieza_estado FROM public.participacion_carga_generacion WHERE carga_interna_id=' +
            row.id,
        ),
      ).toBe('BORRADO_VERIFICADO');
    } finally {
      release();
    }
    const late = await pending;
    expect(late.status).toBe(409);
    expect(
      (await harness.from(row.bucket).download(row.ruta_original)).data,
    ).not.toBeNull();
    await sql(
      'UPDATE public.participacion_carga_generacion SET proximo_intento_en=clock_timestamp() WHERE carga_interna_id=' +
        row.id,
    );
    faults.removeOnce = true;
    await harness.cargas.limpiar();
    expect(
      await sql(
        'SELECT limpieza_estado FROM public.participacion_carga_generacion WHERE carga_interna_id=' +
          row.id,
      ),
    ).toBe('PENDIENTE');
    await sql(
      'UPDATE public.participacion_carga_generacion SET proximo_intento_en=clock_timestamp() WHERE carga_interna_id=' +
        row.id,
    );
    await harness.cargas.limpiar();
    expect(
      (await harness.from(row.bucket).download(row.ruta_original)).data,
    ).toBeNull();
    expect(
      await sql(
        'SELECT estado FROM public.participacion_carga WHERE id=' + row.id,
      ),
    ).toBe('DESCARTADA');
    expect(
      await sql(
        'SELECT count(*) FROM public.participacion_carga_generacion WHERE carga_interna_id=' +
          row.id,
      ),
    ).toBe('1');
  });
  it('confirma hecho/fotos/recibo; público ve solo derivado, cleanup protege VINCULADA y falta temporal no revierte stock', async () => {
    const photo = await ready('821');
    const body = payload(photo, '821');
    body.coresponsable_ids = ['802'] as never[];
    const confirmed = await post('/plantaciones/iniciales', body);
    expect(confirmed.body.estado).toBe('CONFIRMADO');
    expect(confirmed.status).toBe(200);
    const id = confirmed.body.resultado.registro_plantacion_id;
    const own = await get('/plantaciones/' + id + '/detalle-propio');
    expect(own.status).toBe(200);
    expect(own.body.data.observaciones_autor).toBe('Nota privada HTTP');
    expect(
      (await get('/plantaciones/' + id + '/detalle-propio', 802)).body.data
        .observaciones_autor,
    ).toBeNull();
    expect(
      (await get('/plantaciones/' + id + '/detalle-propio', 803)).status,
    ).toBe(404);
    const publicPhoto = await request(harness.origin).get(
      base + '/impact/fotos/' + photo.evidencia,
    );
    expect(publicPhoto.status).toBe(200);
    const url = new URL(publicPhoto.body.data.url);
    expect(url.searchParams.get('path')).toMatch(/derivada\.jpg$/);
    expect(
      (await request(harness.origin).get(url.pathname + url.search)).status,
    ).toBe(200);
    await post(
      '/participacion/comandos/' + photo.key + '/descarte-preparacion',
      { operacion: operation },
    );
    await harness.cargas.limpiar();
    const row = JSON.parse(
      await sql(
        'SELECT to_jsonb(c) FROM public.participacion_carga c WHERE carga_id=' +
          literal(photo.carga),
      ),
    );
    expect(row.estado).toBe('VINCULADA');
    expect(
      (await harness.from(row.bucket).download(row.ruta_original)).data,
    ).not.toBeNull();
    const consumed = await sql(
      'SELECT sum(cantidad_consumida) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=821',
    );
    await harness.from(row.bucket).remove([row.ruta_derivada]);
    expect(
      (
        await request(harness.origin).get(
          base + '/impact/fotos/' + photo.evidencia,
        )
      ).status,
    ).toBe(503);
    expect(
      await sql(
        'SELECT sum(cantidad_consumida) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=821',
      ),
    ).toBe(consumed);
    expect((await post('/plantaciones/iniciales', body)).body).toEqual(
      confirmed.body,
    );
    capture('registro_confirmado', confirmed);
    capture('detalle_autor', own);
  });
  it('confirmar omitiendo upload en tránsito clausura su generación y cleanup conserva la foto vinculada', async () => {
    const photo = await ready('822');
    const omittedId = randomUUID();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    faults.blockUpload = { entered, wait };
    const pending = upload(photo.key, omittedId).then((response) => response);
    let omitted: Record<string, any>;
    try {
      await Promise.race([
        started,
        pending.then(() => {
          throw new Error('El upload omitido terminó antes de la barrera.');
        }),
      ]);
      omitted = JSON.parse(
        await sql(
          'SELECT to_jsonb(c) FROM public.participacion_carga c WHERE carga_id=' +
            literal(omittedId),
        ),
      );
      const confirmed = await post(
        '/plantaciones/iniciales',
        payload(photo, '822'),
      );
      expect(confirmed.body.estado).toBe('CONFIRMADO');
      expect(confirmed.status).toBe(200);
      expect(
        await sql(
          'SELECT estado FROM public.participacion_carga WHERE carga_id=' +
            literal(photo.carga),
        ),
      ).toBe('VINCULADA');
      expect(
        await sql(
          'SELECT estado FROM public.participacion_carga WHERE carga_id=' +
            literal(omittedId),
        ),
      ).toBe('DESCARTE_PENDIENTE');
      expect(
        await sql(
          'SELECT estado FROM public.participacion_carga_generacion WHERE carga_interna_id=' +
            omitted.id,
        ),
      ).toBe('OBSOLETA');
      expect(
        await sql(
          'SELECT lease_token IS NULL FROM public.participacion_carga WHERE carga_id=' +
            literal(omittedId),
        ),
      ).toBe('t');
    } finally {
      release();
    }
    const late = await pending;
    expect(late.status).toBe(409);
    expect(
      (await harness.from(omitted!.bucket).download(omitted!.ruta_original))
        .data,
    ).not.toBeNull();
    await harness.cargas.limpiar();
    expect(
      (await harness.from(omitted!.bucket).download(omitted!.ruta_original))
        .data,
    ).toBeNull();
    expect(
      (await harness.from(omitted!.bucket).download(omitted!.ruta_derivada))
        .data,
    ).toBeNull();
    const linked = JSON.parse(
      await sql(
        'SELECT to_jsonb(c) FROM public.participacion_carga c WHERE carga_id=' +
          literal(photo.carga),
      ),
    );
    expect(
      (await harness.from(linked.bucket).download(linked.ruta_original)).data,
    ).not.toBeNull();
    expect(
      (await harness.from(linked.bucket).download(linked.ruta_derivada)).data,
    ).not.toBeNull();
    expect(
      await sql(
        'SELECT estado FROM public.participacion_carga WHERE carga_id=' +
          literal(photo.carga),
      ),
    ).toBe('VINCULADA');
  });

  it('pérdida de respuesta después de commit permite recuperar recibo tras retiro sin nuevo consumo', async () => {
    const photo = await ready('826');
    const body = payload(photo, '826');
    faults.registroAfterCommitOnce = true;
    const uncertain = await post('/plantaciones/iniciales', body);
    expect(uncertain.status).toBe(503);
    expect(uncertain.body.resultado_concluyente).toBe(false);
    const withdraw = await post(
      '/participacion/accesos/retirar-plantador',
      {
        comando_id: randomUUID(),
        usuario_destino_id: '801',
        ambitos: [{ subcampania_id: '826', revision_esperada: '1' }],
      },
      800,
    );
    expect(withdraw.body.estado).toBe('CONFIRMADO');
    const recovered = await get(
      '/participacion/comandos/' + photo.key + suffix,
    );
    expect(recovered.status).toBe(200);
    expect(recovered.body.estado).toBe('CONFIRMADO');
    expect((await post('/plantaciones/iniciales', body)).body).toEqual(
      recovered.body,
    );
    expect((await get('/subcampanias/826/contexto-registro')).status).toBe(404);
    expect(
      (await get('/participacion/comandos/' + photo.key + suffix, 803)).status,
    ).toBe(404);
    expect(
      await sql(
        'SELECT sum(cantidad_consumida) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=826',
      ),
    ).toBe('1');
    capture('respuesta_perdida_inconclusa', uncertain);
    capture('recibo_recuperado_tras_retiro', recovered);
  });
});
