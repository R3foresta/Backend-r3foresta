#!/usr/bin/env node
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseArgs } = require('node:util');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('dotenv');

const DESTINO = 'https://vyrjlehkhabydkhjxagx.supabase.co';
const BUCKETS = [
  'RECOLECCION_FOTOS',
  'participacion_evidencias',
  'r3foresta-conciliacion',
  'recoleccion_fotos',
  'vivero_evidencias',
  'vivero_incorporaciones',
];
const TAMANO_LOTE = 100;

async function inventariar(storage) {
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw new Error('No se pudieron listar los buckets de dev.');
  const disponibles = new Set(buckets.map(({ id }) => id));
  const inventario = [];

  for (const bucket of BUCKETS) {
    const presente = disponibles.has(bucket);
    const objetos = new Map();
    if (presente) {
      const pendientes = [''];
      while (pendientes.length) {
        const carpeta = pendientes.pop();
        let offset = 0;
        for (;;) {
          const { data, error } = await storage.from(bucket).list(carpeta, {
            limit: TAMANO_LOTE,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          });
          if (error) throw new Error(`No se pudo inventariar ${bucket}.`);
          for (const entrada of data) {
            const ruta = carpeta ? `${carpeta}/${entrada.name}` : entrada.name;
            if (entrada.id === null) pendientes.push(ruta);
            else objetos.set(ruta, [ruta, entrada.id, entrada.updated_at]);
          }
          if (data.length < TAMANO_LOTE) break;
          offset += data.length;
        }
      }
    }
    inventario.push({ bucket, presente, objetos: [...objetos.values()].sort() });
  }
  return inventario;
}

function resumir(inventario) {
  return inventario.map(({ bucket, presente, objetos }) => ({
    bucket,
    presente,
    archivos: objetos.length,
  }));
}

async function resetStorage(storage, execute) {
  const inventario = await inventariar(storage);
  const huella = createHash('sha256')
    .update(JSON.stringify([DESTINO, inventario]))
    .digest('hex');
  if (execute === undefined) {
    return { estado: 'PLAN', destino: DESTINO, huella, buckets: resumir(inventario) };
  }
  if (execute !== huella) throw new Error('La huella cambió. Revisa un plan nuevo.');

  for (const { bucket, objetos } of inventario) {
    for (let i = 0; i < objetos.length; i += TAMANO_LOTE) {
      const rutas = objetos.slice(i, i + TAMANO_LOTE).map(([ruta]) => ruta);
      const { error } = await storage.from(bucket).remove(rutas);
      if (error) {
        throw new Error(`Falló el borrado en ${bucket}. Genera un plan para los archivos restantes.`);
      }
    }
  }

  const restantes = resumir(await inventariar(storage));
  if (restantes.some(({ archivos }) => archivos !== 0)) {
    throw new Error('Quedan archivos en los buckets operativos. Genera un plan nuevo.');
  }
  return { estado: 'STORAGE_VACIO', destino: DESTINO, antes: resumir(inventario), despues: restantes };
}

async function main() {
  const { values } = parseArgs({
    options: { execute: { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log('node scripts/qa/reset-operativo-storage.cjs [--execute HUELLA]');
    return;
  }
  const config = parse(readFileSync(resolve(__dirname, '../../.env.local')));
  if (config.SUPABASE_URL !== DESTINO || !config.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('.env.local debe identificar el proyecto dev y configurar su clave privada.');
  }
  const client = createClient(DESTINO, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
  });
  console.log(JSON.stringify(await resetStorage(client.storage, values.execute), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { resetStorage };
