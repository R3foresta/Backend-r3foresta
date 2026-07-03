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

describe('Reserva de vivero - requiere EMBOLSADO', () => {
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

  it('rechaza asignar un lote ACTIVO con saldo positivo si no tiene EMBOLSADO', async () => {
    const tag = `qa_reserva_sin_embolsado_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, false));
      const subcampania = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = subcampania.campaniaId;
      created.subcampaniaIds.push(subcampania.subcampaniaId);

      // Simula una inconsistencia legacy: saldo vivo positivo sin EMBOLSADO.
      // La nueva guardia debe seguir bloqueando la reserva.
      unwrap(
        await client
          .from('lote_vivero')
          .update({ saldo_vivo_actual: 20 })
          .eq('id', created.loteId)
          .select('id')
          .single(),
        'preparar lote sin EMBOLSADO con saldo positivo',
      );

      const result = await client.rpc('fn_vivero_reservar_stock_lote', {
        p_lote_vivero_id: created.loteId,
        p_subcampania_id: subcampania.subcampaniaId,
        p_cantidad_asignada: 5,
        p_proposito: 'PLANTACION_INICIAL',
        p_usuario_asignacion_id: ref.userId,
      });

      expect(result.error?.message ?? '').toMatch(/EMBOLSADO/i);

      const asignaciones = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select('id')
          .eq('lote_vivero_id', created.loteId),
        'verificar que no se creo asignacion',
      );
      expect(asignaciones).toHaveLength(0);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  it('permite asignar con EMBOLSADO sin modificar saldo_vivo_actual ni crear evento M2', async () => {
    const tag = `qa_reserva_con_embolsado_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, true));
      const subcampania = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = subcampania.campaniaId;
      created.subcampaniaIds.push(subcampania.subcampaniaId);

      const loteAntes = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'leer saldo antes de reservar',
      );
      const eventosAntes = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('id')
          .eq('lote_id', created.loteId),
        'leer eventos antes de reservar',
      );

      const asignacion = unwrap(
        await client.rpc('fn_vivero_reservar_stock_lote', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: subcampania.subcampaniaId,
          p_cantidad_asignada: 5,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
        }),
        'crear reserva con EMBOLSADO',
      ) as { id: number; cantidad_asignada: number };
      created.asignacionIds.push(asignacion.id);

      const loteDespues = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'leer saldo despues de reservar',
      );
      const eventosDespues = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('id')
          .eq('lote_id', created.loteId),
        'leer eventos despues de reservar',
      );

      expect(asignacion.cantidad_asignada).toBe(5);
      expect(loteDespues.saldo_vivo_actual).toBe(
        loteAntes.saldo_vivo_actual,
      );
      expect(eventosDespues).toHaveLength(eventosAntes.length);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);
});

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
        nombre: `[${tag}] Campania`,
        descripcion: 'Campania de prueba',
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
    'crear campania',
  );
}

async function createSubcampaniaActiva(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
): Promise<{ campaniaId: number; subcampaniaId: number }> {
  const campania = await createCampania(client, ref, tag);
  const subcampania = unwrap(
    await client
      .from('subcampania')
      .insert({
        campania_id: campania.id,
        nombre: `[${tag}] Subcampania`,
        tipo: 'REFORESTACION',
        estado: 'ACTIVA',
        zona_id: ref.divisionId,
        meta_total_arboles: 20,
        codigo_trazabilidad: `SUB-QA-${tag}`,
        created_by: ref.userId,
        updated_by: ref.userId,
      })
      .select('id')
      .single(),
    'crear subcampania activa',
  );

  return { campaniaId: campania.id, subcampaniaId: subcampania.id };
}

async function createLote(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  cantidad: number,
  conEmbolsado: boolean,
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
    'crear ubicacion',
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
    'crear recoleccion',
  );

  const tipoEntidad = unwrap(
    await client
      .from('tipos_entidad_evidencia')
      .select('id')
      .ilike('codigo', 'EVENTO_LOTE_VIVERO')
      .eq('activo', true)
      .single(),
    'resolver tipo entidad evidencia',
  );

  const evidenciaIds: number[] = [];
  for (let i = 0; i < (conEmbolsado ? 2 : 1); i++) {
    const evidencia = unwrap(
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
      `crear evidencia ${i}`,
    );
    evidenciaIds.push(evidencia.id);
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
    'crear lote desde recoleccion',
  ) as { lote_vivero_id: number };

  if (conEmbolsado) {
    unwrap(
      await client.rpc('fn_vivero_registrar_embolsado', {
        p_lote_id: inicio.lote_vivero_id,
        p_fecha_evento: fechaEvento,
        p_responsable_id: ref.userId,
        p_plantas_vivas_iniciales: cantidad,
        p_observaciones: `[${tag}] embolsado`,
        p_evidencia_ids: [evidenciaIds[1]],
      }),
      'registrar EMBOLSADO',
    );
  }

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
    'cargar usuario',
  );
  const planta = unwrap(
    await client
      .from('planta')
      .select('id,nombre_cientifico,variedad')
      .limit(1)
      .single(),
    'cargar planta',
  );
  const vivero = unwrap(
    await client.from('vivero').select('id').limit(1).single(),
    'cargar vivero',
  );
  const metodo = unwrap(
    await client.from('metodo_recoleccion').select('id').limit(1).single(),
    'cargar metodo',
  );
  const division = unwrap(
    await client
      .from('division_administrativa')
      .select('id,pais_id')
      .not('pais_id', 'is', null)
      .limit(1)
      .single(),
    'cargar division',
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
    throw new Error(`${context}: la base no devolvio datos.`);
  return result.data;
}

function unwrapRpcRow<T>(result: QueryResult<T[] | T>, context: string): T {
  const data = unwrap(result, context);
  if (Array.isArray(data)) {
    if (data.length === 0)
      throw new Error(`${context}: la RPC no devolvio filas.`);
    return data[0];
  }
  return data;
}

function formatError(error: DbError): string {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' | ');
}
