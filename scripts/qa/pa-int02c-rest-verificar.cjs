// Verificación REST de desarrollo INT02-C, autorizada tras confirmar 072/073.
// Sólo SELECT limit=0 y entradas RPC imposibles/inválidas, sin identidades reales.
// Nunca imprime claves, mensajes SQL, cuerpos de respuesta o datos de personas.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parse } = require('dotenv');
const root = path.resolve(__dirname, '../..');
const expectedRef = 'vyrjlehkhabydkhjxagx';
const index = process.argv.indexOf('--project-ref');
const ref = index >= 0 ? process.argv[index + 1] : null;
const env = parse(fs.readFileSync(path.join(root, '.env')));
if (ref !== expectedRef || env.SUPABASE_URL !== `https://${expectedRef}.supabase.co`) {
  throw new Error('Proyecto no identificado o distinto del desarrollo autorizado; no ejecutar.');
}
for (const [key, role] of [[env.SUPABASE_KEY, 'anon'], [env.SUPABASE_SERVICE_ROLE_KEY, 'service_role']]) {
  if (role === 'anon' && key?.startsWith('sb_publishable_')) continue;
  let actual;
  try { actual = JSON.parse(Buffer.from(key?.split('.')[1] ?? '', 'base64url')).role; }
  catch { throw new Error(`Cliente configurado incompatible con ${role}; no ejecutar.`); }
  if (!key || key.split('.').length !== 3 || actual !== role)
    throw new Error(`Cliente configurado incompatible con ${role}; no ejecutar.`);
}

async function call(endpoint, key, body) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: key, ...(key.split('.').length === 3 ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, value: await response.json().catch(() => null) };
}
function safeCode(value) {
  return typeof value === 'string' && /^[A-Z0-9_]{1,60}$/.test(value) ? value : null;
}
function localSources() {
  return ['072_pa_int02c_comandos_acceso.sql', '073_pa_int02c_lecturas.sql'].map(name => {
    const source = fs.readFileSync(path.join(root, 'migrations', name), 'utf8');
    const regex = /CREATE OR REPLACE FUNCTION\s+public\.([a-z_]+)\s*\([\s\S]*?\bAS\s+(\$\$)([\s\S]*?)\2;/gi;
    const funciones = [...source.matchAll(regex)].map(match => ({ nombre: match[1], md5_cuerpo: crypto.createHash('md5').update(match[3]).digest('hex') }));
    return { archivo: `migrations/${name}`, sha256: crypto.createHash('sha256').update(source).digest('hex'), funciones };
  });
}

(async () => {
  const probes = [];
  function add(name, endpoint, key, body, validate) {
    probes.push(async () => {
      const result = await call(endpoint, key, body);
      return { caso: name, status: result.status, code: safeCode(result.value?.code),
        error_estable: safeCode(result.value?.body?.error?.codigo), aprobado: validate(result),
        ...(endpoint === 'rpc/pa_privado_timeout_diagnostico' ? {
          configuracion_privada: {
            statement_timeout: /^\d+(ms|s|min|h)$/.test(result.value?.statement_timeout ?? '') ? result.value.statement_timeout : null,
            lock_timeout: /^\d+(ms|s|min|h)$/.test(result.value?.lock_timeout ?? '') ? result.value.lock_timeout : null,
            espera_segundos: 0,
          },
        } : {}) };
    });
  }
  const anonDenied = result => [401, 403].includes(result.status) && result.value?.code === '42501';
  const empty = result => result.status === 200 && Array.isArray(result.value) && result.value.length === 0;
  const raised = (status, code) => result => result.status === status && result.value?.code === code;
  const outside = (status, code) => result => result.status === 200 && result.value?.http_status === status
    && result.value?.body?.error?.codigo === code && result.value?.body?.resultado_concluyente === false;
  add('control cliente publico aceptado sin filas', 'organizacion?select=id&limit=0', env.SUPABASE_KEY, undefined, empty);
  add('control service_role sin filas', 'rpc/pa_privado_timeout_diagnostico', env.SUPABASE_SERVICE_ROLE_KEY,
    { p_espera_segundos: 0 }, result => result.status === 200 && result.value?.rol === 'service_role'
      && result.value?.statement_timeout === '30s' && result.value?.lock_timeout === '5s');
  for (const [table, column] of [['usuario_autoridad_historial', 'id'], ['participacion_comando', 'id'],
    ['subcampania_permiso', 'id'], ['subcampania_permiso_revision', 'subcampania_id'], ['subcampania_historial', 'id']]) {
    add(`anon SELECT ${table} limit0`, `${table}?select=${column}&limit=0`, env.SUPABASE_KEY, undefined, anonDenied);
    add(`service_role SELECT ${table} limit0`, `${table}?select=${column}&limit=0`, env.SUPABASE_SERVICE_ROLE_KEY, undefined, empty);
  }
  const uuid = '00000000-0000-4000-8000-000000000001';
  const actor = { p_actor_id: '0', p_auth_id: 'qa-int02c-actor-inexistente' };
  const rpcCases = [
    ['pa_capacidades_leer', { ...actor, p_campania_id: null, p_despues_id: null, p_limite: 1 }, raised(401, 'PT401')],
    ['pa_capacidades_leer', { ...actor, p_campania_id: null, p_despues_id: null, p_limite: 0 }, raised(422, 'PT422')],
    ['pa_miembros_participacion_leer', { ...actor, p_subcampania_id: '0', p_despues_id: null, p_limite: 0 }, raised(422, 'PT422')],
    ['pa_personas_buscar', { ...actor, p_modo: 'NOMBRE', p_consulta: '', p_accion: 'OTORGAR_PLANTADOR', p_subcampania_ids: [], p_despues_id: null, p_limite: 0 }, raised(422, 'PT422')],
    ['pa_accesos_revisar', { ...actor, p_usuario_destino_id: '0', p_subcampania_ids: [] }, raised(401, 'PT401')],
    ['pa_comando_recuperar', { ...actor, p_operacion: 'OTORGAR_PLANTADOR', p_comando_id: uuid }, outside(401, 'SESION_INVALIDA')],
    ['pa_acceso_ejecutar', { ...actor, p_operacion: 'OTORGAR_PLANTADOR', p_comando_id: uuid, p_payload: {}, p_contenido_canonico: '{}' }, outside(422, 'ENTRADA_INVALIDA')],
    ['pa_autoridad_ejecutar', { ...actor, p_operacion: 'CAMBIAR_ROL_GLOBAL', p_comando_id: uuid, p_payload: {}, p_contenido_canonico: '{}' }, outside(422, 'ENTRADA_INVALIDA')],
    ['pa_autoridad_leer', { ...actor, p_usuario_id: '0' }, outside(401, 'SESION_INVALIDA')],
  ];
  for (const [name, args, expected] of rpcCases) {
    add(`anon RPC ${name} sin efectos`, `rpc/${name}`, env.SUPABASE_KEY, args, anonDenied);
    add(`service_role RPC ${name} entrada sintética sin efectos`, `rpc/${name}`, env.SUPABASE_SERVICE_ROLE_KEY, args, expected);
  }
  // Muestras de helpers sólo con anon: no invocar helpers mutadores como servicio.
  for (const [name, args] of [
    ['pa_c_decimal', { p_valor: '0', p_cero: false }],
    ['pa_c_canon_coincide', { p_canon: '{}', p_payload: {} }],
    ['pa_c_error', { p_codigo: 'ENTRADA_INVALIDA', p_mensaje: 'Prueba sintética', p_reintento: 'NO_APLICA', p_campos: [], p_ambitos: [] }],
    ['pa_lecturas_actor', actor],
    ['pa_lecturas_ambitos_validar', { p_actor_id: '0', p_rol: 'VOLUNTARIO', p_ids: [], p_accion: 'GESTIONAR' }],
  ]) add(`anon helper ${name} denegado`, `rpc/${name}`, env.SUPABASE_KEY, args, anonDenied);
  const settled = await Promise.allSettled(probes.map(probe => probe()));
  const pruebas = settled.map((result, i) => result.status === 'fulfilled' ? result.value
    : { caso: `probe ${i + 1}`, aprobado: false, error: 'ERROR_TRANSPORTE' });
  const evidence = { proyecto: ref, entorno_confirmado_por_Pablo: 'DESARROLLO',
    migraciones_declaradas_aplicadas_por_usuario: ['072', '073'], observado_en: new Date().toISOString(),
    versiones: { node: process.version }, fuentes_locales_al_verificar: localSources(), pruebas,
    coincidencia_cuerpo_sql_remoto_verificada: false,
    limites: ['No lee filas ni personas; no ejecuta comandos válidos ni aplica migraciones.',
      'REST verifica superficie de firmas/grants y rechazo temprano; no certifica cuerpos SQL/md5 remotos.',
      'RLS/políticas/índices/locale/grants de authenticated/sobrecargas/continuidad requieren cotejo SQL.',
      'Aplicación072/073 declarada por usuario; igualdad con archivos locales requiere estado SQL.'] };
  const output = path.join(root, 'docs/evidencia/pa-int02c-rest-desarrollo.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ proyecto: ref, observado_en: evidence.observado_en, pruebas,
    evidencia: 'docs/evidencia/pa-int02c-rest-desarrollo.json', coincidencia_cuerpo_sql_remoto_verificada: false }, null, 2));
  if (pruebas.some(result => !result.aprobado)) process.exitCode = 1;
})().catch(() => { console.error('No se pudo completar el QA REST acotado INT02-C.'); process.exitCode = 1; });
