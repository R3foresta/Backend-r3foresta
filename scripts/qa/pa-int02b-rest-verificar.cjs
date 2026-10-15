// QA remoto acotado INT02-B. Sin filas privadas, claves ni inicializacion real.
// PATCH lleva un filtro contradictorio; RPC recibe manifest invalido y no escribe.
const fs = require('node:fs');
const { parse } = require('dotenv');
const env = parse(fs.readFileSync('.env'));
const index = process.argv.indexOf('--project-ref');
const ref = index >= 0 ? process.argv[index + 1] : null;
if (!ref || env.SUPABASE_URL !== `https://${ref}.supabase.co`) {
  throw new Error('Proyecto no identificado o distinto de .env');
}
for (const [key, role] of [[env.SUPABASE_KEY, 'anon'], [env.SUPABASE_SERVICE_ROLE_KEY, 'service_role']]) {
  // https://supabase.com/docs/guides/getting-started/api-keys
  // Publishable se envia solo en apikey, sin fingir un Bearer JWT.
  if (role === 'anon' && key?.startsWith('sb_publishable_')) continue;
  if (!key || key.split('.').length !== 3 ||
      JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role !== role) {
    throw new Error(`Cliente configurado incompatible con ${role}; no ejecutar`);
  }
}
async function call(path, key, method = 'GET', body) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, ...(key.split('.').length === 3 ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, value: await response.json().catch(() => null) };
}
(async () => {
  const probes = [];
  probes.push(async () => {
    const result = await call('organizacion?select=id&limit=0', env.SUPABASE_KEY);
    return { caso: 'control cliente publico aceptado sin filas', status: result.status,
      code: result.value?.code ?? null, aprobado: result.status === 200 && Array.isArray(result.value) && result.value.length === 0 };
  });
  probes.push(async () => {
    const result = await call('rpc/pa_privado_timeout_diagnostico', env.SUPABASE_SERVICE_ROLE_KEY, 'POST', { p_espera_segundos: 0 });
    return { caso: 'control rol privado service_role sin filas', status: result.status,
      code: result.value?.code ?? null, aprobado: result.status === 200 && result.value?.rol === 'service_role' };
  });
  for (const [table, column] of [['participacion_comando', 'id'], ['subcampania_permiso', 'id'],
    ['subcampania_permiso_revision', 'subcampania_id'], ['subcampania_historial', 'id']]) {
    probes.push(async () => {
      const result = await call(`${table}?select=${column}&limit=0`, env.SUPABASE_KEY);
      return { caso: `anon SELECT ${table} sin filas`, status: result.status,
        code: result.value?.code ?? null, aprobado: [401, 403].includes(result.status) && result.value?.code === '42501' };
    });
    probes.push(async () => {
      const result = await call(`${table}?select=${column}&limit=0`, env.SUPABASE_SERVICE_ROLE_KEY);
      return { caso: `service_role SELECT ${table} sin filas`, status: result.status,
        code: result.value?.code ?? null, aprobado: result.status === 200 && Array.isArray(result.value) && result.value.length === 0 };
    });
    probes.push(async () => {
      const result = await call(`${table}?and=(${column}.lt.0,${column}.gt.0)`, env.SUPABASE_KEY, 'PATCH', { [column]: 0 });
      return { caso: `anon UPDATE ${table} filtro imposible`, status: result.status,
        code: result.value?.code ?? null, aprobado: [401, 403].includes(result.status) && result.value?.code === '42501' };
    });
  }
  probes.push(async () => {
    const result = await call('subcampania?and=(id.lt.0,id.gt.0)', env.SUPABASE_KEY, 'PATCH', { participacion_inicializada_por: null });
    return { caso: 'anon UPDATE marca subcampania filtro imposible', status: result.status,
      code: result.value?.code ?? null, aprobado: [401, 403].includes(result.status) && result.value?.code === '42501' };
  });
  probes.push(async () => {
    const result = await call('subcampania?select=participacion_inicializada_en,participacion_inicializada_por&limit=0', env.SUPABASE_SERVICE_ROLE_KEY);
    return { caso: 'columnas inicializacion presentes sin leer filas', status: result.status,
      code: result.value?.code ?? null, aprobado: result.status === 200 && Array.isArray(result.value) && result.value.length === 0 };
  });
  for (const [key, role] of [[env.SUPABASE_KEY, 'anon'], [env.SUPABASE_SERVICE_ROLE_KEY, 'service_role']]) {
    probes.push(async () => {
      const result = await call('rpc/pa_inicializar_participacion_legada', key, 'POST', {
        p_actor_id: 0, p_comando_id: '00000000-0000-0000-0000-000000000000', p_manifest: {},
      });
      return { caso: `${role} RPC bootstrap con manifest invalido, sin efectos`, status: result.status,
        code: result.value?.code ?? null, aprobado: role === 'anon'
          ? [401, 403].includes(result.status) && result.value?.code === '42501'
          : result.value?.code === '22023' && result.value?.message === 'PA_MANIFEST_INVALIDO' };
    });
  }
  const settled = await Promise.allSettled(probes.map(probe => probe()));
  const results = settled.map((result, i) => result.status === 'fulfilled' ? result.value
    : { caso: `probe ${i + 1}`, aprobado: false, error: 'ERROR_TRANSPORTE' });
  console.log(JSON.stringify({ proyecto: ref, entorno_confirmado_por_Pablo: 'DESARROLLO',
    observado_en: new Date().toISOString(), pruebas: results,
    limites: ['sin filas privadas', 'sin bootstrap real', 'authenticated/FKs/RLS/sobrecargas requieren cotejo SQL'] }, null, 2));
  if (results.some(result => !result.aprobado)) process.exitCode = 1;
})().catch(() => { console.error('No se pudo completar el QA REST acotado'); process.exitCode = 1; });
