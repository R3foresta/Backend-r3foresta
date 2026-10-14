// QA remoto acotado: no imprime claves/JWT ni lee filas privadas.
// Las PATCH usan filtro imposible y no modifican filas ni siquiera si el permiso está abierto.
const fs = require('node:fs');
const { parse } = require('dotenv');
const env = parse(fs.readFileSync('.env'));
const i = process.argv.indexOf('--project-ref');
const ref = i >= 0 ? process.argv[i + 1] : null;
if (!ref || env.SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error('Proyecto no identificado o distinto de .env');
const publicKey = env.SUPABASE_KEY;
if (publicKey?.split('.').length === 3 && JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role !== 'anon') throw new Error('SUPABASE_KEY no es anon; no ejecutar una prueba pública con service_role');
if (!publicKey || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta configuración de clientes');
async function call(path, key, body, method = body ? 'POST' : 'GET') {
  const started = performance.now();
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000),
  });
  const value = await response.json().catch(() => null);
  return { status: response.status, ms: Math.round(performance.now() - started), code: value?.code ?? null, value };
}
(async () => {
  const results = [];
  for (const table of ['usuario', 'usuario_credencial']) {
    const r = await call(`${table}?select=id&limit=0`, publicKey);
    if (![401, 403].includes(r.status)) throw new Error(`SELECT público sigue accesible: ${table}, HTTP ${r.status}`);
    results.push({ caso: `anon SELECT ${table} sin filas`, status: r.status, code: r.code });
  }
  const write = await call('organizacion?and=(id.lt.0,id.gt.0)', publicKey, { nombre: 'PA_QA_SIN_FILAS' }, 'PATCH');
  if (![401, 403].includes(write.status)) throw new Error(`UPDATE público accesible: HTTP ${write.status}`);
  results.push({ caso: 'anon UPDATE organizacion filtro imposible', status: write.status, code: write.code });
  for (const rpc of ['pa_actor_verificar', 'pa_privado_timeout_diagnostico']) {
    const r = await call(`rpc/${rpc}`, publicKey, rpc === 'pa_actor_verificar' ? { p_auth_id: 'PA_QA_IDENTIDAD_INEXISTENTE' } : { p_espera_segundos: 0 });
    if (![401, 403].includes(r.status)) throw new Error(`RPC privada pública: ${rpc}, HTTP ${r.status}`);
    results.push({ caso: `anon RPC ${rpc}`, status: r.status, code: r.code });
  }
  const configuration = await call('rpc/pa_privado_timeout_diagnostico', env.SUPABASE_SERVICE_ROLE_KEY, { p_espera_segundos: 0 });
  if (configuration.status !== 200 || configuration.value?.rol !== 'service_role' || !['30s','30000ms'].includes(configuration.value.statement_timeout) || !['5s','5000ms'].includes(configuration.value.lock_timeout)) throw new Error('PostgREST no aplica los timeouts esperados');
  results.push({ caso: 'configuración efectiva antes del comando PostgREST', status: configuration.status, ...configuration.value });
  if (process.argv.includes('--medir-timeout')) {
    const r = await call('rpc/pa_privado_timeout_diagnostico', env.SUPABASE_SERVICE_ROLE_KEY, { p_espera_segundos: 31 });
    if (r.code !== '57014' || r.ms < 29000 || r.ms > 42000) throw new Error(`Cancelación incompatible: ${r.code}, ${r.ms}ms`);
    results.push({ caso: 'pg_sleep(31) interrumpido por PostgreSQL', status: r.status, code: r.code, ms: r.ms });
  }
  console.log(JSON.stringify({ proyecto: ref, entorno_confirmado_por_Pablo: 'DESARROLLO', observado_en: new Date().toISOString(), pruebas: results }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
