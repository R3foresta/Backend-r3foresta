/** Preview D de localhost para INT04. Solo lo inicia el runner aislado. */
import {
  startHarness as startHarnessD,
  token,
  controls,
  sql,
} from './pa-int02d-harness';
import { ParticipacionImagenService } from '../../src/participacion/cargas/participacion-imagen.service';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

async function main() {
  const check = process.argv.includes('--check');
  controls.initialWrites = true;
  const harness = await startHarnessD(
    check ? 0 : Number(process.env.PA_A_HTTP_PORT ?? '3303'),
    true,
  );
  const close = async () => {
    await harness.app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
  if (!check) {
    process.stdout.write(
      'Preview INT02-D SINTÉTICO en ' +
        harness.origin +
        '/api\n' +
        'Sesión: GET /_fixture/sesion/{800|801|802|803|804|805|901}. Inicial v1 habilitada.\n' +
        'Ámbitos820–824 con stock;825SIN_STOCK. FE07:901GENERAL/OPERARIO820,origen820000,mortandad5,asignación82099REPOSICION10.\n' +
        'Originales privados; Storage/DB efímeros. Ctrl+C detiene y elimina el fixture.\n',
    );
    return;
  }
  const checks: string[] = [];
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const endpoint = (path: string, actor?: number, init: RequestInit = {}) =>
    fetch(harness.origin + path, {
      ...init,
      headers: {
        ...(actor === undefined ? {} : { Authorization: token(actor) }),
        ...init.headers,
      },
    });
  const post = (path: string, data: unknown, actor = 800) =>
    endpoint(path, actor, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const json = async (
    response: Response,
    status: number,
    label: string,
  ): Promise<any> => {
    const body = await response.json();
    assert(
      response.status === status,
      label + ': HTTP ' + response.status + ' ' + JSON.stringify(body),
    );
    return body;
  };
  try {
    const session = await json(
      await endpoint('/_fixture/sesion/901'),
      200,
      'sesión internaD',
    );
    assert(
      session.sintetico && session.actor_id === '901',
      'sesión interna sintética',
    );
    const context = await json(
      await endpoint('/api/v1/subcampanias/820/contexto-registro', 801),
      200,
      'contexto',
    );
    assert(context.data.disponibilidad === 'DISPONIBLE', 'contexto con stock');
    const empty = await json(
      await endpoint('/api/v1/subcampanias/825/contexto-registro', 801),
      200,
      'sin stock',
    );
    assert(empty.data.disponibilidad === 'SIN_STOCK', 'stock cero');
    assert(
      (await endpoint('/api/subcampanias/820/plan')).status === 401,
      'plan exige JWT',
    );
    await json(
      await endpoint('/api/subcampanias/820/plan', 801),
      200,
      'plan voluntario',
    );
    checks.push(
      'guard/JWT, contexto PostGIS, SIN_STOCK y GETplan de VOLUNTARIO activo',
    );

    const legacy = await json(
      await endpoint('/api/subcampanias/820/plantacion/context', 800),
      409,
      'contexto antiguo',
    );
    assert(
      legacy.error.codigo === 'CLIENTE_INCOMPATIBLE',
      'código contrato antiguo',
    );
    const today = await sql(
      "SELECT (now() AT TIME ZONE 'America/La_Paz')::date",
    );
    const repo = (evidence: number, origin = 820000) => ({
      subcampania_id: 820,
      es_reposicion: true,
      registro_plantacion_origen_id: origin,
      fecha_plantacion: today,
      latitud: -16.5,
      longitud: -68.1,
      detalles: [
        { asignacion_id: 82099, lote_vivero_id: 81, planta_id: 8, cantidad: 1 },
      ],
      evidencia_ids: [evidence],
      coresponsable_ids: [],
    });
    const old = await json(
      await post('/api/registros-plantacion', {
        ...repo(1),
        es_reposicion: false,
        registro_plantacion_origen_id: undefined,
      }),
      409,
      'inicial antigua',
    );
    assert(
      old.error.codigo === 'CLIENTE_INCOMPATIBLE',
      'inicial usa motor único',
    );
    const bytes = await sharp({
      create: { width: 5, height: 4, channels: 3, background: '#228b22' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'SECRETO_PREVIEW_D' } } })
      .png()
      .toBuffer();
    const multipart = (scoped: boolean) => {
      const body = new FormData();
      if (scoped) {
        body.set('subcampania_id', '820');
        body.set('es_reposicion', 'true');
      }
      body.set(
        'fotos',
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
        'fixture.png',
      );
      return body;
    };
    const oldUpload = await json(
      await endpoint('/api/registros-plantacion/evidencias-pendientes', 901, {
        method: 'POST',
        body: multipart(false),
      }),
      409,
      'upload antiguo',
    );
    assert(
      oldUpload.error.codigo === 'CLIENTE_INCOMPATIBLE',
      'upload exige contexto',
    );
    checks.push(
      'contexto/inicial/upload legados devuelven409 CLIENTE_INCOMPATIBLE',
    );

    const upload = await json(
      await endpoint('/api/registros-plantacion/evidencias-pendientes', 901, {
        method: 'POST',
        body: multipart(true),
      }),
      201,
      'upload interno',
    );
    const evidence = Number(upload.evidencia_ids[0]);
    assert(Number.isSafeInteger(evidence) && evidence > 0, 'ID de evidencia');
    assert(
      (await endpoint('/api/v1/impact/imagenes/' + evidence)).status === 404,
      'pendiente privada',
    );
    assert(
      (await endpoint('/api/evidencias-trazabilidad/' + evidence, 800))
        .status === 404,
      'ruta general no abre pendiente',
    );
    const before = await sql(
      'SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=82099',
    );
    await json(
      await post('/api/registros-plantacion', repo(evidence, 821000), 901),
      400,
      'origen ajeno',
    );
    assert(
      (await sql(
        'SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=82099',
      )) === before,
      'origen ajeno sin consumo',
    );
    const saved = await json(
      await post('/api/registros-plantacion', repo(evidence), 901),
      201,
      'reposición propia',
    );
    assert(saved.data.cantidad_total_plantada === 1, 'una unidad repuesta');
    const image = await endpoint('/api/v1/impact/imagenes/' + evidence);
    assert(
      image.status === 200 &&
        image.headers.get('Content-Type')?.includes('image/jpeg'),
      'foto pública binaria',
    );
    const imageBytes = Buffer.from(await image.arrayBuffer());
    const metadata = await sharp(imageBytes).metadata();
    assert(
      metadata.format === 'jpeg' && metadata.exif === undefined,
      'derivado JPEG sin EXIF',
    );
    checks.push(
      'GENERAL/equipo820 sube foto privada; origen ajeno sin efectos; reposición propia consume1 y publica JPEG sanitizado sinJWT',
    );

    const command = randomUUID();
    const load = randomUUID();
    await json(
      await post(
        '/api/v1/participacion/comandos/preparaciones',
        {
          comando_id: command,
          operacion: 'REGISTRAR_PLANTACION_INICIAL',
          subcampania_id: '821',
        },
        801,
      ),
      200,
      'preparación v1',
    );
    const body = new FormData();
    body.set(
      'foto',
      new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      'fixture.png',
    );
    const initialUpload = await json(
      await endpoint(
        '/api/v1/participacion/comandos/' +
          command +
          '/cargas/' +
          load +
          '?operacion=REGISTRAR_PLANTACION_INICIAL',
        801,
        { method: 'PUT', body },
      ),
      201,
      'carga v1',
    );
    const payload = {
      comando_id: command,
      subcampania_id: '821',
      plan_revision_esperada: '0',
      fecha_plantacion: today,
      latitud: -16.5,
      longitud: -68.1,
      especies: [{ planta_id: '8', cantidad: 1 }],
      coresponsable_ids: [],
      evidencia_ids: [initialUpload.data.evidencia_id],
    };
    controls.initialWrites = false;
    const paused = await json(
      await post('/api/v1/plantaciones/iniciales', payload, 801),
      503,
      'pausa',
    );
    assert(
      paused.error.codigo === 'RESULTADO_NO_DETERMINADO' &&
        paused.resultado_concluyente === false,
      'pausa conserva incertidumbre',
    );
    await json(
      await endpoint(
        '/api/v1/participacion/comandos/' +
          command +
          '?operacion=REGISTRAR_PLANTACION_INICIAL',
        801,
      ),
      202,
      'consulta durante pausa',
    );
    controls.initialWrites = true;
    const receipt = await json(
      await post('/api/v1/plantaciones/iniciales', payload, 801),
      200,
      'confirmación v1',
    );
    assert(receipt.estado === 'CONFIRMADO', 'registro confirmado');
    controls.initialWrites = false;
    const replay = await json(
      await post('/api/v1/plantaciones/iniciales', payload, 801),
      200,
      'replay en pausa',
    );
    assert(
      JSON.stringify(replay) === JSON.stringify(receipt),
      'recibo idéntico durante pausa',
    );
    const changed = await json(
      await post(
        '/api/v1/plantaciones/iniciales',
        { ...payload, especies: [{ planta_id: '8', cantidad: 2 }] },
        801,
      ),
      409,
      'huella distinta',
    );
    assert(
      changed.error.codigo === 'COMANDO_REUTILIZADO',
      'clave terminal no reutilizable',
    );
    checks.push(
      'inicialv1: pausa503 sin terminal nuevo, GET202, misma clave confirma al habilitar y replay terminal en pausa; contenido distinto409',
    );

    const heic = readFileSync(
      resolve('test/db/fixtures/pa-int03a/sintetica.heic'),
    );
    assert(
      (await new ParticipacionImagenService().preparar(heic)).derivada.length >
        0,
      'decoder HEIC',
    );
    checks.push('decoder HEIC real');
    process.stdout.write(
      'PA_INT02D_PREVIEW_CHECKS=' + JSON.stringify(checks) + '\n',
    );
    process.stdout.write(
      'Preview INT02-D verificado con HTTP/RPC/PostGIS y Storage privado sintéticos.\n',
    );
  } finally {
    controls.initialWrites = true;
    await harness.app.close();
  }
}
void main().catch((error) => {
  process.stderr.write(
    'No se pudo iniciar/verificar preview INT02-D aislado: ' +
      String(error instanceof Error ? error.message : error).slice(0, 1000) +
      '\n',
  );
  process.exit(1);
});
