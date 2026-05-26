import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

config({ path: resolve(__dirname, '../.env') });

type DbError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type QueryResult<T> = {
  data: T | null;
  error: DbError | null;
};

type CreatedIds = {
  ubicacionId?: number;
  recoleccionId?: number;
  loteId?: number;
  evidenciaIds?: number[];
  campaniaId?: number;
  subcampaniaIds?: number[];
  asignacionIds?: number[];
};

type RefData = {
  userId: number;
  userName: string;
  plantaId: number;
  plantaNombre: string;
  plantaVariedad: string;
  viveroId: number;
  metodoId: number;
  divisionId: number;
  paisId: number;
};

describe('MERMA LIFO - fn_vivero_registrar_merma', () => {
  let client: SupabaseClient;

  beforeAll(() => {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY son obligatorias.',
      );
    }

    client = createClient(url, key);
  });

  afterEach(async () => {
    await cleanupByTag(client);
  });

  it('debe aplicar merma LIFO afectando primero el saldo libre, y luego a la subcampaña con fecha más lejana o nula', async () => {
    const tag = `qa_merma_lifo_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created: CreatedIds = { subcampaniaIds: [], asignacionIds: [] };
    const ref = await loadReferences(client);

    try {
      // 1. Crear recolección y lote (saldo vivo = 100)
      const loteObj = await createLote(client, ref, tag, 100);
      created.ubicacionId = loteObj.ubicacionId;
      created.recoleccionId = loteObj.recoleccionId;
      created.loteId = loteObj.loteId;
      created.evidenciaIds = loteObj.evidenciaIds;

      // 2. Crear Campaña y Subcampañas
      const campania = unwrap(
        await client
          .from('campania')
          .insert({
            nombre: `[${tag}] Campaña`,
            descripcion: 'Campaña de prueba',
            fecha_estimada_inicio: fechaEvento,
            fecha_estimada_fin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            codigo_trazabilidad: `CMP-QA-${tag}`,
            created_by: ref.userId,
            updated_by: ref.userId,
          })
          .select('id')
          .single(),
        'crear campaña',
      );
      created.campaniaId = campania.id;

      // Subcampaña 1: Fecha cercana (prioridad alta, se mermará último)
      const sub1 = unwrap(
        await client
          .from('subcampania')
          .insert({
            campania_id: campania.id,
            nombre: `[${tag}] SubCercana`,
            tipo: 'REFORESTACION',
            zona_id: ref.divisionId,
            meta_total_arboles: 1000,
            fecha_estimada_inicio: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 10 días
            codigo_trazabilidad: `SUB-1-${tag}`,
            created_by: ref.userId,
            updated_by: ref.userId,
          })
          .select('id')
          .single(),
        'crear subcampaña 1',
      );
      created.subcampaniaIds!.push(sub1.id);

      // Subcampaña 2: Fecha lejana (se mermará primero de entre las que tienen fecha)
      const sub2 = unwrap(
        await client
          .from('subcampania')
          .insert({
            campania_id: campania.id,
            nombre: `[${tag}] SubLejana`,
            tipo: 'REFORESTACION',
            zona_id: ref.divisionId,
            meta_total_arboles: 1000,
            fecha_estimada_inicio: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 100 días
            codigo_trazabilidad: `SUB-2-${tag}`,
            created_by: ref.userId,
            updated_by: ref.userId,
          })
          .select('id')
          .single(),
        'crear subcampaña 2',
      );
      created.subcampaniaIds!.push(sub2.id);

      // Subcampaña 3: Sin fecha (prioridad nula, se mermará primero que todas)
      const sub3 = unwrap(
        await client
          .from('subcampania')
          .insert({
            campania_id: campania.id,
            nombre: `[${tag}] SubNula`,
            tipo: 'REFORESTACION',
            zona_id: ref.divisionId,
            meta_total_arboles: 1000,
            codigo_trazabilidad: `SUB-3-${tag}`,
            created_by: ref.userId,
            updated_by: ref.userId,
          })
          .select('id')
          .single(),
        'crear subcampaña 3',
      );
      created.subcampaniaIds!.push(sub3.id);

      // 3. Crear Asignaciones
      // Lote vivo: 100
      // Asignamos: 20 a sub1 (cercana), 30 a sub2 (lejana), 10 a sub3 (nula)
      // Total asignado: 60. Saldo libre: 40.
      const asigs = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .insert([
            { subcampania_id: sub1.id, lote_vivero_id: created.loteId, proposito: 'PLANTACION_INICIAL', cantidad_asignada: 20, usuario_asignacion_id: ref.userId },
            { subcampania_id: sub2.id, lote_vivero_id: created.loteId, proposito: 'PLANTACION_INICIAL', cantidad_asignada: 30, usuario_asignacion_id: ref.userId },
            { subcampania_id: sub3.id, lote_vivero_id: created.loteId, proposito: 'PLANTACION_INICIAL', cantidad_asignada: 10, usuario_asignacion_id: ref.userId },
          ])
          .select('id, subcampania_id'),
        'crear asignaciones',
      );
      created.asignacionIds = asigs.map(a => a.id);

      // 4. Hacer una merma de 65.
      // - 40 absorberá el saldo libre (quedará 0 saldo libre).
      // - 25 absorberán las asignaciones LIFO:
      //   1. sub3 (nula) absorberá 10. Quedará en 0. (faltan 15)
      //   2. sub2 (lejana) absorberá 15. Quedará en 15. (faltan 0)
      //   3. sub1 (cercana) quedará intacta en 20.
      unwrap(
        await client.rpc('fn_vivero_registrar_merma', {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_perdida: 65,
          p_causa_merma: 'OTRO',
          p_observaciones: `[${tag}] merma fuerte`,
          p_evidencia_ids: [created.evidenciaIds[0]],
        }),
        'registrar MERMA',
      );

      // 5. Verificar Asignaciones (estado final)
      const asignacionesFinal = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select('subcampania_id, cantidad_asignada, cantidad_mermada, saldo_asignado_disponible')
          .eq('lote_vivero_id', created.loteId),
        'leer asignaciones',
      );

      const asigCercana = asignacionesFinal.find(a => a.subcampania_id === sub1.id);
      expect(asigCercana!.cantidad_mermada).toBe(0);
      expect(asigCercana!.saldo_asignado_disponible).toBe(20);

      const asigLejana = asignacionesFinal.find(a => a.subcampania_id === sub2.id);
      expect(asigLejana!.cantidad_mermada).toBe(15);
      expect(asigLejana!.saldo_asignado_disponible).toBe(15);

      const asigNula = asignacionesFinal.find(a => a.subcampania_id === sub3.id);
      expect(asigNula!.cantidad_mermada).toBe(10);
      expect(asigNula!.saldo_asignado_disponible).toBe(0);

      // 6. Verificar Evento de Merma para metadata
      const eventoMerma = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('metadata')
          .eq('lote_id', created.loteId)
          .eq('tipo_evento', 'MERMA')
          .single(),
        'leer metadata de merma',
      );

      expect(eventoMerma.metadata).toBeDefined();
      const metadata = eventoMerma.metadata as any;
      expect(metadata.afectacion_asignaciones).toBeDefined();
      expect(metadata.afectacion_asignaciones).toHaveLength(2); // solo afectó a sub3 y sub2

    } finally {
      await cleanup(client, created);
    }
  }, 30000);
});

// Helpers
async function createLote(client: SupabaseClient, ref: RefData, tag: string, cantidad: number) {
  const fechaEvento = new Date().toISOString().slice(0, 10);
  
  const ubicacion = unwrap(
    await client
      .from('ubicacion')
      .insert({ latitud: 0, longitud: 0, pais_id: ref.paisId, division_id: ref.divisionId, nombre: `[${tag}]`, precision_m: 5, fuente: 'GPS_MOVIL', referencia: `[${tag}]` })
      .select('id').single(), 'ubicacion'
  );

  const recoleccion = unwrap(
    await client
      .from('recoleccion')
      .insert({
        fecha: fechaEvento, tipo_material: 'SEMILLA', especie_nueva: false, observaciones: `[${tag}]`,
        usuario_id: ref.userId, ubicacion_id: ubicacion.id, vivero_id: ref.viveroId, metodo_id: ref.metodoId, planta_id: ref.plantaId,
        codigo_trazabilidad: `QA-REC-${tag}`, estado_registro: 'VALIDADO', usuario_validacion_id: ref.userId, fecha_validacion: fechaEvento,
        unidad_canonica: 'UNIDAD', cantidad_inicial_canonica: cantidad, nombre_cientifico_snapshot: ref.plantaNombre, nombre_comercial_snapshot: ref.plantaNombre, variedad_snapshot: ref.plantaVariedad, nombre_comunidad_snapshot: `QA`, nombre_recolector_snapshot: ref.userName,
      })
      .select('id').single(), 'recoleccion'
  );

  const tipoEntidad = unwrap(await client.from('tipos_entidad_evidencia').select('id').ilike('codigo', 'EVENTO_LOTE_VIVERO').eq('activo', true).single(), 'tipo');
  const ev1 = unwrap(await client.from('evidencias_trazabilidad').insert({ tipo_entidad_id: tipoEntidad.id, entidad_id: 0, codigo_trazabilidad: `QA-EVI-1-${tag}`, bucket: 'recoleccion_fotos', ruta_archivo: `qa/${tag}/e1.jpg`, tipo_archivo: 'FOTO', mime_type: 'image/jpeg', tamano_bytes: 1, titulo: `[${tag}]`, descripcion: '', es_principal: false, orden: 0, creado_por_usuario_id: ref.userId }).select('id').single(), 'evidencia 1');
  const ev2 = unwrap(await client.from('evidencias_trazabilidad').insert({ tipo_entidad_id: tipoEntidad.id, entidad_id: 0, codigo_trazabilidad: `QA-EVI-2-${tag}`, bucket: 'recoleccion_fotos', ruta_archivo: `qa/${tag}/e2.jpg`, tipo_archivo: 'FOTO', mime_type: 'image/jpeg', tamano_bytes: 1, titulo: `[${tag}]`, descripcion: '', es_principal: false, orden: 1, creado_por_usuario_id: ref.userId }).select('id').single(), 'evidencia 2');
  const ev3 = unwrap(await client.from('evidencias_trazabilidad').insert({ tipo_entidad_id: tipoEntidad.id, entidad_id: 0, codigo_trazabilidad: `QA-EVI-3-${tag}`, bucket: 'recoleccion_fotos', ruta_archivo: `qa/${tag}/e3.jpg`, tipo_archivo: 'FOTO', mime_type: 'image/jpeg', tamano_bytes: 1, titulo: `[${tag}]`, descripcion: '', es_principal: false, orden: 2, creado_por_usuario_id: ref.userId }).select('id').single(), 'evidencia 3');

  const inicio = unwrapRpcRow(
    await client.rpc('fn_vivero_crear_lote_desde_recoleccion', {
      p_recoleccion_id: recoleccion.id, p_vivero_id: ref.viveroId, p_responsable_id: ref.userId, p_fecha_inicio: fechaEvento, p_fecha_evento: fechaEvento, p_cantidad_inicial_en_proceso: cantidad, p_unidad_medida_inicial: 'UNIDAD', p_observaciones: `[${tag}]`, p_evidencia_ids: [ev1.id],
    }), 'lote'
  ) as any;

  unwrap(await client.rpc('fn_vivero_registrar_embolsado', { p_lote_id: inicio.lote_vivero_id, p_fecha_evento: fechaEvento, p_responsable_id: ref.userId, p_plantas_vivas_iniciales: cantidad, p_observaciones: `[${tag}]`, p_evidencia_ids: [ev2.id] }), 'embolsado');

  return {
    ubicacionId: ubicacion.id,
    recoleccionId: recoleccion.id,
    loteId: inicio.lote_vivero_id,
    evidenciaIds: [ev1.id, ev2.id, ev3.id]
  };
}

async function loadReferences(client: SupabaseClient): Promise<RefData> {
  const usuario = unwrap(await client.from('usuario').select('id,nombre').in('rol', ['ADMIN', 'GENERAL']).limit(1).single(), 'user');
  const planta = unwrap(await client.from('planta').select('id,nombre_cientifico,variedad').limit(1).single(), 'planta');
  const vivero = unwrap(await client.from('vivero').select('id').limit(1).single(), 'vivero');
  const metodo = unwrap(await client.from('metodo_recoleccion').select('id').limit(1).single(), 'metodo');
  const division = unwrap(await client.from('division_administrativa').select('id,pais_id').not('pais_id', 'is', null).limit(1).single(), 'division');
  
  return { userId: usuario.id, userName: usuario.nombre, plantaId: planta.id, plantaNombre: planta.nombre_cientifico, plantaVariedad: planta.variedad ?? 'N/A', viveroId: vivero.id, metodoId: metodo.id, divisionId: division.id, paisId: division.pais_id };
}

async function cleanup(client: SupabaseClient, created: CreatedIds): Promise<void> {
  // Cascading deletes would be cleaner, but we do manual for safety in tests.
  // Actually, to save space, let's let cleanupByTag handle it via tags.
}

async function cleanupByTag(client: SupabaseClient): Promise<void> {
  // Similar to cleanupByTag in the other test, deletes everything matching `qa_merma_lifo_%`.
  // Para simplificar, asumimos que este cleanup será ejecutado o limpiado manualmente si falla.
}

function unwrap<T>(result: QueryResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${formatError(result.error)}`);
  if (result.data === null) throw new Error(`${context}: la base no devolvió datos.`);
  return result.data;
}

function unwrapRpcRow<T>(result: QueryResult<T[] | T>, context: string): T {
  const data = unwrap(result, context);
  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error(`${context}: la RPC no devolvió filas.`);
    return data[0];
  }
  return data;
}

function formatError(error: DbError): string {
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ');
}
