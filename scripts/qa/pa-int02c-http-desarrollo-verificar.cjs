// Arranca la aplicación completa contra el desarrollo identificado y sólo prueba
// disponibilidad, OpenAPI, CORS y rechazos sin cuenta real. Nunca ejecuta dominio.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { parse } = require('dotenv');
const root = path.resolve(__dirname, '../..');
const index = process.argv.indexOf('--project-ref');
const ref = index >= 0 ? process.argv[index + 1] : null;
const env = parse(fs.readFileSync(path.join(root, '.env')));
if (
  ref !== 'vyrjlehkhabydkhjxagx' ||
  env.SUPABASE_URL !== `https://${ref}.supabase.co`
)
  throw new Error('El proyecto no coincide con el desarrollo autorizado.');
if (!env.JWT_SECRET?.trim())
  throw new Error('Falta configuración JWT del servidor.');
const entry = path.join(root, 'dist/main.js');
if (!fs.existsSync(entry))
  throw new Error('Ejecute npm run build antes de esta verificación.');
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/pa-int02c-openapi.json')),
);
const publicOrigin = 'http://localhost:5173';
function syntheticToken() {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: `qa-int02c-runtime-${crypto.randomUUID()}`,
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}
async function freePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  child.kill('SIGTERM');
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);
    const last = setTimeout(() => {
      clearTimeout(timer);
      resolve(false);
    }, 8000);
    child.once('exit', () => {
      clearTimeout(timer);
      clearTimeout(last);
      resolve(true);
    });
  });
}
(async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const probes = [];
  let child;
  let startupLog = '';
  let transportFailure = false;
  let stopped = false;
  try {
    child = spawn(process.execPath, [entry], {
      cwd: root,
      env: { ...process.env, ...env, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Logs no se entregan: módulos legados imprimen direcciones de wallet.
    const capture = (chunk) => {
      startupLog = (startupLog + chunk.toString()).slice(-64000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('ARRANQUE_NO_DISPONIBLE');
      try {
        const response = await fetch(base + '/health', {
          signal: AbortSignal.timeout(500),
        });
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('ARRANQUE_NO_DISPONIBLE');
    const check = async (caso, route, options, validate) => {
      const response = await fetch(base + route, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json().catch(() => null);
      probes.push({
        caso,
        metodo: options?.method ?? 'GET',
        ruta: route,
        status: response.status,
        aprobado: validate(response, body),
      });
    };
    await check(
      'proceso completo disponible',
      '/health',
      {},
      (response, body) => response.status === 200 && body?.status === 'ok',
    );
    await check(
      'Swagger contiene los DTO de las 14 rutas',
      '/api/docs-json',
      {},
      (response, body) =>
        response.status === 200 &&
        Object.entries(contract.paths).every(([route, methods]) =>
          Object.entries(methods).every(
            ([method, operation]) =>
              JSON.stringify(body?.paths?.[route]?.[method]) ===
              JSON.stringify(operation),
          ),
        ) &&
        Object.keys(contract.components.schemas).every(
          (name) => name in (body?.components?.schemas ?? {}),
        ),
    );
    for (const [route, methods] of Object.entries(contract.paths)) {
      for (const method of Object.keys(methods)) {
        const concrete = route
          .replaceAll('{id}', '1')
          .replaceAll('{usuario_id}', '1')
          .replaceAll('{comando_id}', '00000000-0000-4000-8000-000000000001');
        await check(
          'visitante rechazado antes de dominio',
          concrete,
          {
            method: method.toUpperCase(),
            headers: {
              Origin: publicOrigin,
              'Content-Type': 'application/json',
            },
            ...(method === 'post' ? { body: '{}' } : {}),
          },
          (response, body) =>
            response.status === 401 &&
            body?.error?.codigo === 'SESION_INVALIDA' &&
            body?.resultado_concluyente === false &&
            response.headers.get('cache-control') === 'private, no-store' &&
            response.headers.get('access-control-allow-origin') ===
              publicOrigin &&
            response.headers
              .get('access-control-expose-headers')
              ?.toLowerCase()
              .split(/,\s*/)
              .includes('retry-after'),
        );
      }
    }
    await check(
      'JWT sintético sin cuenta: guard consulta DB y devuelve sesión inválida',
      '/api/v1/participacion/capacidades',
      { headers: { Authorization: `Bearer ${syntheticToken()}` } },
      (response, body) =>
        response.status === 401 && body?.error?.codigo === 'SESION_INVALIDA',
    );
    await check(
      'preflight permite POST privado desde la PWA local',
      '/api/v1/participacion/accesos/otorgar-plantador',
      {
        method: 'OPTIONS',
        headers: {
          Origin: publicOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      },
      (response) =>
        response.status === 204 &&
        response.headers.get('access-control-allow-origin') === publicOrigin &&
        response.headers
          .get('access-control-allow-headers')
          ?.toLowerCase()
          .includes('authorization'),
    );
  } catch {
    transportFailure = true;
  } finally {
    if (child) stopped = await stop(child);
  }
  const evidence = {
    tarea: 'PA-T-INT02-C-BE06',
    proyecto: ref,
    entorno: 'BACKEND_LOCAL_CON_SUPABASE_DESARROLLO',
    observado_en: new Date().toISOString(),
    implementacion: {
      bootstrap_real: true,
      host: '127.0.0.1',
      puerto: port,
      proceso_detenido: stopped,
      supabase_inicializado: startupLog.includes(
        'Supabase client inicializado correctamente',
      ),
      fuentes: ['src/main.ts', 'src/participacion/participacion.module.ts'].map(
        (archivo) => ({
          archivo,
          sha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, archivo)))
            .digest('hex'),
        }),
      ),
    },
    pruebas: probes,
    ...(transportFailure
      ? { error: 'ARRANQUE_O_TRANSPORTE_NO_VERIFICADO' }
      : {}),
    limites: [
      'No crea ni modifica cuentas, permisos o comandos.',
      'JWT sintético sólo identifica un auth_id aleatorio sin cuenta.',
      'No acredita login WebAuthn, personas reales ni interfaz frontend.',
      'No compara cuerpos SQL remotos ni acredita despliegue externo.',
    ],
  };
  const passed =
    !transportFailure &&
    stopped &&
    probes.length === 18 &&
    probes.every((probe) => probe.aprobado);
  evidence.estado = passed ? 'CORRECTO' : 'FALLIDO';
  fs.writeFileSync(
    path.join(root, 'docs/evidencia/pa-int02c-http-desarrollo.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      estado: evidence.estado,
      aprobadas: probes.filter((probe) => probe.aprobado).length,
      total: probes.length,
      proceso_detenido: stopped,
    }),
  );
  process.exitCode = passed ? 0 : 1;
})().catch(() => {
  console.error('No se pudo verificar el arranque completo.');
  process.exitCode = 1;
});
