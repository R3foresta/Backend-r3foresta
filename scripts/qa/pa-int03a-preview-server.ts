/** Launcher local INT04; llamado únicamente por runner aislado con --serve. */
import { startHarness, token } from './pa-int03a-harness';
import { ParticipacionImagenService } from '../../src/participacion/cargas/participacion-imagen.service';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const check = process.argv.includes('--check');
  const harness = await startHarness(
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
  if (check) {
    const session = (await fetch(harness.origin + '/_fixture/sesion/801').then(
      (r) => r.json(),
    )) as { sintetico: boolean };
    if (!session.sintetico) throw new Error('sesión fixture');
    const response = await fetch(
      harness.origin + '/api/v1/subcampanias/820/contexto-registro',
      { headers: { Authorization: token(801) } },
    );
    const body = (await response.json()) as {
      data: { disponibilidad: string };
    };
    if (response.status !== 200 || body.data.disponibilidad !== 'DISPONIBLE')
      throw new Error(
        'contexto fixture: HTTP ' +
          response.status +
          ' ' +
          JSON.stringify(body),
      );
    const empty = (await fetch(
      harness.origin + '/api/v1/subcampanias/825/contexto-registro',
      { headers: { Authorization: token(801) } },
    ).then((r) => r.json())) as typeof body;
    if (empty.data.disponibilidad !== 'SIN_STOCK')
      throw new Error('saldo cero fixture');
    const decoder = new ParticipacionImagenService();
    const heic = readFileSync(
      resolve('test/db/fixtures/pa-int03a/sintetica.heic'),
    );
    if (!(await decoder.preparar(heic)).derivada.length)
      throw new Error('decoder HEIC');
    await harness.app.close();
    process.stdout.write(
      'Preview INT03-A verificado: HTTP/guard/contexto PostGIS/SIN_STOCK y decoder HEIC reales; fixture sintético.\n',
    );
    return;
  }
  process.stdout.write(
    'Preview INT03-A SINTÉTICO en ' +
      harness.origin +
      '/api/v1\n' +
      'Sesión de fixture: GET /_fixture/sesion/{800|801|802|803|804|805}; subcampañas 820–824 con stock, 825 SIN_STOCK.\n' +
      'Originales privados; Storage efímero local. Ctrl+C detiene API y elimina clúster/objetos del fixture.\n',
  );
}
void main().catch((error) => {
  process.stderr.write(
    'No se pudo iniciar/verificar el preview INT03-A aislado: ' +
      String(error instanceof Error ? error.message : error).slice(0, 300) +
      '\n',
  );
  process.exit(1);
});
