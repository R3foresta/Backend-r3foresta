import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env') });

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
  evidenciaIds: number[];
  campaniaId?: number;
  subcampaniaIds: number[];
  asignacionIds: number[];
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

function nuevoRegistro(): CreatedIds {
  return { evidenciaIds: [], subcampaniaIds: [], asignacionIds: [] };
}

describe('MERMA LIFO - fn_vivero_registrar_merma', () => {
  let client: SupabaseClient;
  let ref: RefData;

  beforeAll(async () => {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY son obligatorias.',
      );
    }

    client = createClient(url, key);
    ref = await loadReferences(client);
  });

  it('caso simple: merma menor o igual al saldo libre no afecta asignaciones', async () => {
    const tag = `qa_merma_lifo_simple_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created = nuevoRegistro();

    try {
      const loteObj = await createLote(client, ref, tag, 100, 3);
      Object.assign(created, loteObj);

      const subcampania = await createSubcampania(
        client,
        ref,
        tag,
        'Cercana',
        10,
      );
      created.campaniaId = subcampania.campaniaId;
      created.subcampaniaIds.push(subcampania.subcampaniaId);

      // Asigno 60: queda saldo libre = 40
      const asig = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .insert({
            subcampania_id: subcampania.subcampaniaId,
            lote_vivero_id: created.loteId,
            proposito: 'PLANTACION_INICIAL',
            cantidad_asignada: 60,
            usuario_asignacion_id: ref.userId,
          })
          .select('id')
          .single(),
        'asignacion simple',
      );
      created.asignacionIds.push(asig.id);

      // Merma 30 (< 40 libre)
      unwrap(
        await client.rpc('fn_vivero_registrar_merma', {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_perdida: 30,
          p_causa_merma: 'OTRO',
          p_observaciones: `[${tag}] merma simple`,
          p_evidencia_ids: [created.evidenciaIds[2]],
        }),
        'registrar MERMA simple',
      );

      // La asignación no debe haber cambiado
      const asigFinal = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select(
            'cantidad_asignada, cantidad_mermada, saldo_asignado_disponible',
          )
          .eq('id', asig.id)
          .single(),
        'leer asignación simple',
      );
      expect(asigFinal.cantidad_asignada).toBe(60);
      expect(asigFinal.cantidad_mermada).toBe(0);
      expect(asigFinal.saldo_asignado_disponible).toBe(60);

      // Metadata del evento no debe poblarse (no hubo afectación)
      const evento = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('metadata, saldo_vivo_antes, saldo_vivo_despues')
          .eq('lote_id', created.loteId)
          .eq('tipo_evento', 'MERMA')
          .single(),
        'leer evento simple',
      );
      expect(evento.metadata).toBeNull();
      expect(evento.saldo_vivo_antes).toBe(100);
      expect(evento.saldo_vivo_despues).toBe(70);

      await assertInvariante(client, created.loteId!, 70);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  it('caso complejo: merma 65 sobre lote 100 con 60 asignados — LIFO por fecha y NULL primero', async () => {
    const tag = `qa_merma_lifo_complejo_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created = nuevoRegistro();

    try {
      const loteObj = await createLote(client, ref, tag, 100, 3);
      Object.assign(created, loteObj);

      const campania = await createCampania(client, ref, tag);
      created.campaniaId = campania.id;

      // Sub1 cercana (10d) — protegida
      const sub1 = await insertSubcampania(
        client,
        ref,
        tag,
        campania.id,
        'Cercana',
        10,
      );
      // Sub2 lejana (100d) — absorbe después de NULL
      const sub2 = await insertSubcampania(
        client,
        ref,
        tag,
        campania.id,
        'Lejana',
        100,
      );
      // Sub3 sin fecha — absorbe primero
      const sub3 = await insertSubcampania(
        client,
        ref,
        tag,
        campania.id,
        'Nula',
        null,
      );
      created.subcampaniaIds.push(sub1, sub2, sub3);

      // 20 cercana, 30 lejana, 10 nula → asignado total = 60, libre = 40
      const asigs = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .insert([
            {
              subcampania_id: sub1,
              lote_vivero_id: created.loteId,
              proposito: 'PLANTACION_INICIAL',
              cantidad_asignada: 20,
              usuario_asignacion_id: ref.userId,
            },
            {
              subcampania_id: sub2,
              lote_vivero_id: created.loteId,
              proposito: 'PLANTACION_INICIAL',
              cantidad_asignada: 30,
              usuario_asignacion_id: ref.userId,
            },
            {
              subcampania_id: sub3,
              lote_vivero_id: created.loteId,
              proposito: 'PLANTACION_INICIAL',
              cantidad_asignada: 10,
              usuario_asignacion_id: ref.userId,
            },
          ])
          .select('id, subcampania_id'),
        'crear asignaciones complejo',
      );
      created.asignacionIds.push(...asigs.map((a) => a.id));

      // Merma 65: 40 libre + 10 nula + 15 lejana; cercana intacta
      unwrap(
        await client.rpc('fn_vivero_registrar_merma', {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_perdida: 65,
          p_causa_merma: 'OTRO',
          p_observaciones: `[${tag}] merma fuerte`,
          p_evidencia_ids: [created.evidenciaIds[2]],
        }),
        'registrar MERMA complejo',
      );

      const asignacionesFinal = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select(
            'subcampania_id, cantidad_asignada, cantidad_mermada, saldo_asignado_disponible',
          )
          .eq('lote_vivero_id', created.loteId),
        'leer asignaciones',
      );

      const asigCercana = asignacionesFinal.find(
        (a) => a.subcampania_id === sub1,
      )!;
      expect(asigCercana.cantidad_asignada).toBe(20);
      expect(asigCercana.cantidad_mermada).toBe(0);
      expect(asigCercana.saldo_asignado_disponible).toBe(20);

      const asigLejana = asignacionesFinal.find(
        (a) => a.subcampania_id === sub2,
      )!;
      expect(asigLejana.cantidad_asignada).toBe(30);
      expect(asigLejana.cantidad_mermada).toBe(15);
      expect(asigLejana.saldo_asignado_disponible).toBe(15);

      const asigNula = asignacionesFinal.find(
        (a) => a.subcampania_id === sub3,
      )!;
      expect(asigNula.cantidad_asignada).toBe(10);
      expect(asigNula.cantidad_mermada).toBe(10);
      expect(asigNula.saldo_asignado_disponible).toBe(0);

      const eventoMerma = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('metadata')
          .eq('lote_id', created.loteId)
          .eq('tipo_evento', 'MERMA')
          .single(),
        'leer metadata',
      );
      const metadata = eventoMerma.metadata as {
        afectacion_asignaciones: Array<{
          subcampania_id: number;
          cantidad: number;
        }>;
      };
      expect(metadata.afectacion_asignaciones).toHaveLength(2);

      const porSub = new Map(
        metadata.afectacion_asignaciones.map((x) => [
          x.subcampania_id,
          x.cantidad,
        ]),
      );
      expect(porSub.get(sub3)).toBe(10);
      expect(porSub.get(sub2)).toBe(15);

      await assertInvariante(client, created.loteId!, 35);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  it('rollback: merma mayor que saldo vivo total del lote falla y no altera asignaciones', async () => {
    const tag = `qa_merma_lifo_rollback_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created = nuevoRegistro();

    try {
      const loteObj = await createLote(client, ref, tag, 50, 3);
      Object.assign(created, loteObj);

      const subcampania = await createSubcampania(client, ref, tag, 'Sub', 20);
      created.campaniaId = subcampania.campaniaId;
      created.subcampaniaIds.push(subcampania.subcampaniaId);

      const asig = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .insert({
            subcampania_id: subcampania.subcampaniaId,
            lote_vivero_id: created.loteId,
            proposito: 'PLANTACION_INICIAL',
            cantidad_asignada: 30,
            usuario_asignacion_id: ref.userId,
          })
          .select('id')
          .single(),
        'asignación rollback',
      );
      created.asignacionIds.push(asig.id);

      // Merma 60 > saldo vivo 50 → debe fallar
      const result = await client.rpc('fn_vivero_registrar_merma', {
        p_lote_id: created.loteId,
        p_fecha_evento: fechaEvento,
        p_responsable_id: ref.userId,
        p_cantidad_perdida: 60,
        p_causa_merma: 'OTRO',
        p_observaciones: `[${tag}] merma inválida`,
        p_evidencia_ids: [created.evidenciaIds[2]],
      });
      expect(result.error).not.toBeNull();
      expect(result.error?.message ?? '').toMatch(
        /no puede exceder el saldo vivo total/,
      );

      // El saldo del lote permanece igual
      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'leer lote rollback',
      );
      expect(lote.saldo_vivo_actual).toBe(50);

      // La asignación no cambió
      const asigFinal = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select('cantidad_asignada, cantidad_mermada')
          .eq('id', asig.id)
          .single(),
        'leer asignación rollback',
      );
      expect(asigFinal.cantidad_asignada).toBe(30);
      expect(asigFinal.cantidad_mermada).toBe(0);

      // No debe haber evento MERMA registrado
      const eventos = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('id')
          .eq('lote_id', created.loteId)
          .eq('tipo_evento', 'MERMA'),
        'leer eventos rollback',
      );
      expect(eventos).toHaveLength(0);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);
});

// ============================================================================
// Helpers
// ============================================================================

async function assertInvariante(
  client: SupabaseClient,
  loteId: number,
  saldoEsperado: number,
): Promise<void> {
  const lote = unwrap(
    await client
      .from('lote_vivero')
      .select('saldo_vivo_actual')
      .eq('id', loteId)
      .single(),
    'leer lote invariante',
  );
  const asigs = unwrap(
    await client
      .from('asignacion_vivero_subcampania')
      .select('saldo_asignado_disponible')
      .eq('lote_vivero_id', loteId)
      .eq('estado', 'ACTIVA'),
    'leer asignaciones invariante',
  );
  const sumaAsignaciones = asigs.reduce(
    (acc: number, row: { saldo_asignado_disponible: number }) =>
      acc + Number(row.saldo_asignado_disponible ?? 0),
    0,
  );
  expect(lote.saldo_vivo_actual).toBe(saldoEsperado);
  // Σ saldos de asignaciones activas <= saldo_vivo_actual (saldo libre = diferencia)
  expect(sumaAsignaciones).toBeLessThanOrEqual(lote.saldo_vivo_actual);
}

async function createCampania(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
) {
  const hoy = new Date().toISOString().slice(0, 10);
  return unwrap(
    await client
      .from('campania')
      .insert({
        nombre: `[${tag}] Campaña`,
        descripcion: 'Campaña de prueba',
        fecha_estimada_inicio: hoy,
        fecha_estimada_fin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        codigo_trazabilidad: `CMP-QA-${tag}`,
        created_by: ref.userId,
        updated_by: ref.userId,
      })
      .select('id')
      .single(),
    'crear campaña',
  );
}

async function insertSubcampania(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  campaniaId: number,
  etiqueta: string,
  diasOffset: number | null,
): Promise<number> {
  const fechaInicio =
    diasOffset !== null
      ? new Date(Date.now() + diasOffset * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;
  const row = unwrap(
    await client
      .from('subcampania')
      .insert({
        campania_id: campaniaId,
        nombre: `[${tag}] ${etiqueta}`,
        tipo: 'REFORESTACION',
        zona_id: ref.divisionId,
        meta_total_arboles: 1000,
        fecha_estimada_inicio: fechaInicio,
        codigo_trazabilidad: `SUB-${etiqueta}-${tag}`,
        created_by: ref.userId,
        updated_by: ref.userId,
      })
      .select('id')
      .single(),
    `crear subcampaña ${etiqueta}`,
  );
  return row.id as number;
}

async function createSubcampania(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  etiqueta: string,
  diasOffset: number | null,
): Promise<{ campaniaId: number; subcampaniaId: number }> {
  const campania = await createCampania(client, ref, tag);
  const subcampaniaId = await insertSubcampania(
    client,
    ref,
    tag,
    campania.id,
    etiqueta,
    diasOffset,
  );
  return { campaniaId: campania.id, subcampaniaId };
}

async function createLote(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  cantidad: number,
  nEvidencias: number,
): Promise<{
  ubicacionId: number;
  recoleccionId: number;
  loteId: number;
  evidenciaIds: number[];
}> {
  const fechaEvento = new Date().toISOString().slice(0, 10);

  const ubicacion = unwrap(
    await client
      .from('ubicacion')
      .insert({
        latitud: 0,
        longitud: 0,
        pais_id: ref.paisId,
        division_id: ref.divisionId,
        nombre: `[${tag}]`,
        precision_m: 5,
        fuente: 'GPS_MOVIL',
        referencia: `[${tag}]`,
      })
      .select('id')
      .single(),
    'ubicacion',
  );

  const recoleccion = unwrap(
    await client
      .from('recoleccion')
      .insert({
        fecha: fechaEvento,
        tipo_material: 'SEMILLA',
        especie_nueva: false,
        observaciones: `[${tag}]`,
        usuario_id: ref.userId,
        ubicacion_id: ubicacion.id,
        vivero_id: ref.viveroId,
        metodo_id: ref.metodoId,
        planta_id: ref.plantaId,
        codigo_trazabilidad: `QA-REC-${tag}`,
        estado_registro: 'VALIDADO',
        usuario_validacion_id: ref.userId,
        fecha_validacion: fechaEvento,
        unidad_canonica: 'UNIDAD',
        cantidad_inicial_canonica: cantidad,
        nombre_cientifico_snapshot: ref.plantaNombre,
        nombre_comercial_snapshot: ref.plantaNombre,
        variedad_snapshot: ref.plantaVariedad,
        nombre_comunidad_snapshot: 'QA',
        nombre_recolector_snapshot: ref.userName,
      })
      .select('id')
      .single(),
    'recoleccion',
  );

  const tipoEntidad = unwrap(
    await client
      .from('tipos_entidad_evidencia')
      .select('id')
      .ilike('codigo', 'EVENTO_LOTE_VIVERO')
      .eq('activo', true)
      .single(),
    'tipo entidad',
  );

  const evidenciaIds: number[] = [];
  for (let i = 0; i < nEvidencias; i++) {
    const ev = unwrap(
      await client
        .from('evidencias_trazabilidad')
        .insert({
          tipo_entidad_id: tipoEntidad.id,
          entidad_id: 0,
          codigo_trazabilidad: `QA-EVI-${i}-${tag}`,
          bucket: 'recoleccion_fotos',
          ruta_archivo: `qa/${tag}/e${i}.jpg`,
          tipo_archivo: 'FOTO',
          mime_type: 'image/jpeg',
          tamano_bytes: 1,
          titulo: `[${tag}]`,
          descripcion: '',
          es_principal: false,
          orden: i,
          creado_por_usuario_id: ref.userId,
        })
        .select('id')
        .single(),
      `evidencia ${i}`,
    );
    evidenciaIds.push(ev.id);
  }

  const inicio = unwrapRpcRow(
    await client.rpc('fn_vivero_crear_lote_desde_recoleccion', {
      p_recoleccion_id: recoleccion.id,
      p_vivero_id: ref.viveroId,
      p_responsable_id: ref.userId,
      p_fecha_inicio: fechaEvento,
      p_fecha_evento: fechaEvento,
      p_cantidad_inicial_en_proceso: cantidad,
      p_unidad_medida_inicial: 'UNIDAD',
      p_observaciones: `[${tag}]`,
      p_evidencia_ids: [evidenciaIds[0]],
    }),
    'lote',
  ) as { lote_vivero_id: number };

  unwrap(
    await client.rpc('fn_vivero_registrar_embolsado', {
      p_lote_id: inicio.lote_vivero_id,
      p_fecha_evento: fechaEvento,
      p_responsable_id: ref.userId,
      p_plantas_vivas_iniciales: cantidad,
      p_observaciones: `[${tag}]`,
      p_evidencia_ids: [evidenciaIds[1]],
    }),
    'embolsado',
  );

  return {
    ubicacionId: ubicacion.id,
    recoleccionId: recoleccion.id,
    loteId: inicio.lote_vivero_id,
    evidenciaIds,
  };
}

async function loadReferences(client: SupabaseClient): Promise<RefData> {
  const usuario = unwrap(
    await client
      .from('usuario')
      .select('id,nombre')
      .in('rol', ['ADMIN', 'GENERAL'])
      .limit(1)
      .single(),
    'user',
  );
  const planta = unwrap(
    await client
      .from('planta')
      .select('id,nombre_cientifico,variedad')
      .limit(1)
      .single(),
    'planta',
  );
  const vivero = unwrap(
    await client.from('vivero').select('id').limit(1).single(),
    'vivero',
  );
  const metodo = unwrap(
    await client.from('metodo_recoleccion').select('id').limit(1).single(),
    'metodo',
  );
  const division = unwrap(
    await client
      .from('division_administrativa')
      .select('id,pais_id')
      .not('pais_id', 'is', null)
      .limit(1)
      .single(),
    'division',
  );

  return {
    userId: usuario.id,
    userName: usuario.nombre,
    plantaId: planta.id,
    plantaNombre: planta.nombre_cientifico,
    plantaVariedad: planta.variedad ?? 'N/A',
    viveroId: vivero.id,
    metodoId: metodo.id,
    divisionId: division.id,
    paisId: division.pais_id,
  };
}

async function cleanup(
  client: SupabaseClient,
  created: CreatedIds,
): Promise<void> {
  // Orden inverso a las dependencias FK
  if (created.asignacionIds.length > 0) {
    await client
      .from('asignacion_vivero_subcampania')
      .delete()
      .in('id', created.asignacionIds);
  }
  if (created.loteId !== undefined) {
    await client
      .from('evento_lote_vivero')
      .delete()
      .eq('lote_id', created.loteId);
  }
  if (created.evidenciaIds.length > 0) {
    await client
      .from('evidencias_trazabilidad')
      .delete()
      .in('id', created.evidenciaIds);
  }
  if (created.loteId !== undefined) {
    await client.from('lote_vivero').delete().eq('id', created.loteId);
  }
  if (created.recoleccionId !== undefined) {
    await client.from('recoleccion').delete().eq('id', created.recoleccionId);
  }
  if (created.ubicacionId !== undefined) {
    await client.from('ubicacion').delete().eq('id', created.ubicacionId);
  }
  if (created.subcampaniaIds.length > 0) {
    await client.from('subcampania').delete().in('id', created.subcampaniaIds);
  }
  if (created.campaniaId !== undefined) {
    await client.from('campania').delete().eq('id', created.campaniaId);
  }
}

function unwrap<T>(result: QueryResult<T>, context: string): T {
  if (result.error) throw new Error(`${context}: ${formatError(result.error)}`);
  if (result.data === null)
    throw new Error(`${context}: la base no devolvió datos.`);
  return result.data;
}

function unwrapRpcRow<T>(result: QueryResult<T[] | T>, context: string): T {
  const data = unwrap(result, context);
  if (Array.isArray(data)) {
    if (data.length === 0)
      throw new Error(`${context}: la RPC no devolvió filas.`);
    return data[0];
  }
  return data;
}

function formatError(error: DbError): string {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' | ');
}
