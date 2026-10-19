/** Preview INT05 aislado para frontend; solo lo inicia pa-int05-db-test.py. */
import { startHarness, token, controls, jwt } from './pa-int02d-harness';
import sharp from 'sharp';

async function main() {
  const check = process.argv.includes('--check');
  controls.initialWrites = true;
  const harness = await startHarness(
    check ? 0 : Number(process.env.PA_A_HTTP_PORT ?? '3305'),
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
  // Original privado real con EXIF; la ruta pública usa el sanitizador real deD.
  const photo = await sharp({
    create: { width: 5, height: 4, channels: 3, background: '#228b22' },
  })
    .withMetadata({ exif: { IFD0: { Artist: 'SECRETO_PREVIEW_INT05' } } })
    .png()
    .toBuffer();
  await harness
    .from('recoleccion_fotos')
    .upload('int05/elegible-original.png', photo);
  await harness
    .from('recoleccion_fotos')
    .upload('int05/pendiente-original.png', photo);
  if (!check) {
    process.stdout.write(
      'Preview INT05 SINTÉTICO en ' +
        harness.origin +
        '/api\n' +
        'Público: /api/v1/impact/global → /campanias/800 → /subcampanias/826 → /registros/826000. Campaña801=20;800=30;826=125%.\n' +
        'Sesión: GET /_fixture/sesion/{800|801|802|803|804|805|901}. Mis registros: /api/v1/plantaciones/mis-registros.\n' +
        '801 autor retirado826+participante827;802 participante826;804 ajeno;805 inactivo. Foto900050 pública sanitizada;900051 pendiente privada.\n' +
        'INT04: ámbitos820–824 con stock;825 SIN_STOCK. Inicial v1 habilitada.901 GENERAL/OPERARIO820; origen820000,mortandad5; asignación82099 REPOSICION10; origen ajeno827000.\n' +
        'DB/Storage privados efímeros; Ctrl+C detiene y elimina el fixture.\n',
    );
    return;
  }
  const checks: string[] = [];
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const endpoint = (path: string, actor?: number) =>
    fetch(harness.origin + path, {
      headers: actor === undefined ? {} : { Authorization: token(actor) },
    });
  const data = async (path: string, actor?: number) => {
    const response = await endpoint(path, actor);
    const body = await response.json();
    assert(
      response.status === 200,
      path + ': ' + response.status + ' ' + JSON.stringify(body),
    );
    return body;
  };
  try {
    for (const actor of [800, 801, 802, 803, 804, 805, 901]) {
      const session = await data('/_fixture/sesion/' + actor);
      assert(
        session.sintetico && session.actor_id === String(actor),
        'sesión sintética' + actor,
      );
    }
    const global = await data('/api/v1/impact/global');
    assert(
      global.data.indicadores.plantacion_inicial === 50 &&
        global.data.indicadores.reposiciones === 4 &&
        global.data.indicadores.bajas_reportadas === 11,
      '50/4/11 público',
    );
    assert(
      global.data.mapa.length === 4 && global.data.registros.length === 4,
      'cuatro hechos',
    );
    const scope = await data('/api/v1/impact/subcampanias/826');
    assert(
      scope.data.subcampanias[0].avance_porcentaje === 125 &&
        scope.data.subcampanias[0].faltantes === 0,
      '125%',
    );
    const own = await data('/api/v1/plantaciones/mis-registros', 801);
    assert(
      own.data.registros.find((row: any) => row.id === '826000').relaciones
        .length === 2,
      'autor+participante deduplicado',
    );
    assert(
      (await endpoint('/api/v1/plantaciones/mis-registros')).status === 401,
      'Mis registros exige JWT',
    );
    const expired = await fetch(
      harness.origin + '/api/v1/plantaciones/mis-registros',
      {
        headers: {
          Authorization:
            'Bearer ' + jwt.sign({ sub: 'a-http-801' }, { expiresIn: -1 }),
        },
      },
    );
    assert(expired.status === 401, 'sesión vencida');
    for (const id of [828, 829, 830, 831, 832])
      assert(
        (await endpoint('/api/v1/impact/subcampanias/' + id)).status === 404,
        'ámbito oculto' + id,
      );
    checks.push(
      'sesiones800–805/901; público50=30+20/reposiciones4/bajas11/mapa4;125%; Mis registros autor retirado y JWT vencido; ocultos404',
    );
    const image = await endpoint('/api/v1/impact/imagenes/900050');
    assert(
      image.status === 200 &&
        image.headers.get('Content-Type')?.includes('image/jpeg'),
      'foto elegible',
    );
    const metadata = await sharp(
      Buffer.from(await image.arrayBuffer()),
    ).metadata();
    assert(
      metadata.format === 'jpeg' && metadata.exif === undefined,
      'JPEG sin EXIF',
    );
    assert(
      (await endpoint('/api/v1/impact/imagenes/900051')).status === 404,
      'pendiente privada',
    );
    checks.push('foto900050 JPEG sanitizado sin EXIF;900051 pendiente404');
    assert(
      (await endpoint('/api/subcampanias/820/plan')).status === 401,
      'plan exige JWT',
    );
    assert(
      (await endpoint('/api/subcampanias/820/plan', 801)).status === 200,
      'plan con cuenta activa',
    );
    assert(
      (await data('/api/v1/subcampanias/820/contexto-registro', 801)).data
        .disponibilidad === 'DISPONIBLE',
      'contexto con stock',
    );
    assert(
      (await data('/api/v1/subcampanias/825/contexto-registro', 801)).data
        .disponibilidad === 'SIN_STOCK',
      'contexto sin stock',
    );
    checks.push(
      'regresión INT04: GET plan JWT/contexto820 DISPONIBLE/825 SIN_STOCK',
    );
    process.stdout.write(
      'PA_INT05_PREVIEW_CHECKS=' + JSON.stringify(checks) + '\n',
    );
    process.stdout.write(
      'Preview INT05 verificado con HTTP/RPC/PostGIS/Storage privados sintéticos.\n',
    );
  } finally {
    await harness.app.close();
  }
}
void main().catch((error) => {
  process.stderr.write(
    'No se pudo iniciar/verificar preview INT05: ' +
      String(error instanceof Error ? error.message : error).slice(0, 1200) +
      '\n',
  );
  process.exit(1);
});
