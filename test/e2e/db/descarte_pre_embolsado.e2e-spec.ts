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

type PendingEvidence = {
  id: number;
  tipoEntidadId: number;
};

function nuevoRegistro(): CreatedIds {
  return { evidenciaIds: [] };
}

describe('DESCARTE_PRE_EMBOLSADO - fn_vivero_registrar_descarte_pre_embolsado', () => {
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

  afterEach(async () => {
    await cleanupByPrefix(client);
  });

  it('registra el descarte total antes de EMBOLSADO y cierra el lote', async () => {
    const tag = `qa_descarte_pre_ok_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created = nuevoRegistro();

    try {
      Object.assign(
        created,
        await createLoteConInicio(client, ref, tag, 12, 'UNIDAD'),
      );

      const evidencia = await createPendingEvidence(client, ref, tag, 1);
      created.evidenciaIds.push(evidencia.id);

      const descarte = unwrapRpcRow(
        await client.rpc('fn_vivero_registrar_descarte_pre_embolsado', {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_material_afectado: 12,
          p_unidad_medida_evento: 'UNIDAD',
          p_causa_descarte_pre_embolsado: 'NO_GERMINACION',
          p_observaciones: `[${tag}] descarte`,
          p_evidencia_ids: [evidencia.id],
        }),
        'registrar DESCARTE_PRE_EMBOLSADO',
      ) as {
        evento_descarte_pre_embolsado_id: number;
        evento_cierre_id: number;
        lote_vivero_id: number;
        motivo_cierre: string;
      };

      expect(descarte.lote_vivero_id).toBe(created.loteId);
      expect(descarte.motivo_cierre).toBe('DESCARTE_PRE_EMBOLSADO');

      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select(
            'estado_lote,motivo_cierre,plantas_vivas_iniciales,saldo_vivo_actual',
          )
          .eq('id', created.loteId)
          .single(),
        'leer lote descartado',
      );

      expect(lote).toMatchObject({
        estado_lote: 'FINALIZADO',
        motivo_cierre: 'DESCARTE_PRE_EMBOLSADO',
        plantas_vivas_iniciales: null,
        saldo_vivo_actual: null,
      });

      const eventos = unwrap(
        await client
          .from('evento_lote_vivero')
          .select(
            'id,tipo_evento,cantidad_afectada,unidad_medida_evento,causa_descarte_pre_embolsado,saldo_vivo_antes,saldo_vivo_despues,motivo_cierre_calculado,ref_evento_trigger_id',
          )
          .eq('lote_id', created.loteId)
          .order('id', { ascending: true }),
        'leer eventos del lote descartado',
      );

      expect(eventos.map((evento) => evento.tipo_evento)).toEqual([
        'INICIO',
        'DESCARTE_PRE_EMBOLSADO',
        'CIERRE_AUTOMATICO',
      ]);

      const eventoDescarte = eventos.find(
        (evento) => evento.tipo_evento === 'DESCARTE_PRE_EMBOLSADO',
      );
      expect(eventoDescarte).toMatchObject({
        id: descarte.evento_descarte_pre_embolsado_id,
        cantidad_afectada: 12,
        unidad_medida_evento: 'UNIDAD',
        causa_descarte_pre_embolsado: 'NO_GERMINACION',
        saldo_vivo_antes: null,
        saldo_vivo_despues: null,
      });

      const cierre = eventos.find(
        (evento) => evento.tipo_evento === 'CIERRE_AUTOMATICO',
      );
      expect(cierre).toMatchObject({
        id: descarte.evento_cierre_id,
        motivo_cierre_calculado: 'DESCARTE_PRE_EMBOLSADO',
        ref_evento_trigger_id: descarte.evento_descarte_pre_embolsado_id,
      });

      const evidenciaFinal = unwrap(
        await client
          .from('evidencias_trazabilidad')
          .select('id,tipo_entidad_id,entidad_id,eliminado_en')
          .eq('id', evidencia.id)
          .single(),
        'leer evidencia vinculada',
      );

      expect(evidenciaFinal).toMatchObject({
        id: evidencia.id,
        tipo_entidad_id: evidencia.tipoEntidadId,
        entidad_id: descarte.evento_descarte_pre_embolsado_id,
        eliminado_en: null,
      });
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  it('bloquea evidencia faltante, causa faltante, cantidad parcial y unidad distinta', async () => {
    const tag = `qa_descarte_pre_invalid_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created = nuevoRegistro();

    try {
      Object.assign(
        created,
        await createLoteConInicio(client, ref, tag, 12, 'UNIDAD'),
      );

      const evidencia = await createPendingEvidence(client, ref, tag, 1);
      created.evidenciaIds.push(evidencia.id);

      const sinEvidencia = await client.rpc(
        'fn_vivero_registrar_descarte_pre_embolsado',
        {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_material_afectado: 12,
          p_unidad_medida_evento: 'UNIDAD',
          p_causa_descarte_pre_embolsado: 'NO_GERMINACION',
          p_observaciones: `[${tag}] sin evidencia`,
          p_evidencia_ids: [],
        },
      );
      expect(sinEvidencia.error?.message ?? '').toMatch(/evidencia/i);

      const sinCausa = await client.rpc(
        'fn_vivero_registrar_descarte_pre_embolsado',
        {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_material_afectado: 12,
          p_unidad_medida_evento: 'UNIDAD',
          p_causa_descarte_pre_embolsado: null,
          p_observaciones: `[${tag}] sin causa`,
          p_evidencia_ids: [evidencia.id],
        },
      );
      expect(sinCausa.error?.message ?? '').toMatch(/causa/i);

      const parcial = await client.rpc(
        'fn_vivero_registrar_descarte_pre_embolsado',
        {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_material_afectado: 11,
          p_unidad_medida_evento: 'UNIDAD',
          p_causa_descarte_pre_embolsado: 'NO_GERMINACION',
          p_observaciones: `[${tag}] parcial`,
          p_evidencia_ids: [evidencia.id],
        },
      );
      expect(parcial.error?.message ?? '').toMatch(/total|coincidir/i);

      const unidadDistinta = await client.rpc(
        'fn_vivero_registrar_descarte_pre_embolsado',
        {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_material_afectado: 12,
          p_unidad_medida_evento: 'G',
          p_causa_descarte_pre_embolsado: 'NO_GERMINACION',
          p_observaciones: `[${tag}] unidad distinta`,
          p_evidencia_ids: [evidencia.id],
        },
      );
      expect(unidadDistinta.error?.message ?? '').toMatch(/unidad/i);

      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select('estado_lote,motivo_cierre')
          .eq('id', created.loteId)
          .single(),
        'leer lote tras intentos invalidos',
      );
      expect(lote).toMatchObject({
        estado_lote: 'ACTIVO',
        motivo_cierre: null,
      });

      const eventosDescarte = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('id')
          .eq('lote_id', created.loteId)
          .eq('tipo_evento', 'DESCARTE_PRE_EMBOLSADO'),
        'leer descartes tras intentos invalidos',
      );
      expect(eventosDescarte).toHaveLength(0);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  it('bloquea DESCARTE_PRE_EMBOLSADO si el lote ya tiene EMBOLSADO', async () => {
    const tag = `qa_descarte_pre_embolsado_${Date.now()}`;
    const fechaEvento = new Date().toISOString().slice(0, 10);
    const created = nuevoRegistro();

    try {
      Object.assign(
        created,
        await createLoteConInicio(client, ref, tag, 12, 'UNIDAD'),
      );

      const evidenciaEmbolsado = await createPendingEvidence(
        client,
        ref,
        tag,
        1,
      );
      created.evidenciaIds.push(evidenciaEmbolsado.id);

      unwrap(
        await client.rpc('fn_vivero_registrar_embolsado', {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_plantas_vivas_iniciales: 12,
          p_observaciones: `[${tag}] embolsado`,
          p_evidencia_ids: [evidenciaEmbolsado.id],
        }),
        'registrar EMBOLSADO',
      );

      const evidenciaDescarte = await createPendingEvidence(
        client,
        ref,
        tag,
        2,
      );
      created.evidenciaIds.push(evidenciaDescarte.id);

      const descarte = await client.rpc(
        'fn_vivero_registrar_descarte_pre_embolsado',
        {
          p_lote_id: created.loteId,
          p_fecha_evento: fechaEvento,
          p_responsable_id: ref.userId,
          p_cantidad_material_afectado: 12,
          p_unidad_medida_evento: 'UNIDAD',
          p_causa_descarte_pre_embolsado: 'NO_GERMINACION',
          p_observaciones: `[${tag}] descarte post-embolsado`,
          p_evidencia_ids: [evidenciaDescarte.id],
        },
      );

      expect(descarte.error?.message ?? '').toMatch(/ya tiene EMBOLSADO/i);

      const eventosDescarte = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('id')
          .eq('lote_id', created.loteId)
          .eq('tipo_evento', 'DESCARTE_PRE_EMBOLSADO'),
        'leer descartes post-embolsado',
      );
      expect(eventosDescarte).toHaveLength(0);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);
});

async function createLoteConInicio(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  cantidad: number,
  unidad: 'UNIDAD' | 'G',
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
        latitud: -16.541587,
        longitud: -68.060916,
        pais_id: ref.paisId,
        division_id: ref.divisionId,
        nombre: `[${tag}]`,
        precision_m: 35,
        fuente: 'GPS_MOVIL',
        referencia: `[${tag}] referencia de prueba`,
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
        unidad_canonica: unidad,
        cantidad_inicial_canonica: cantidad,
        nombre_cientifico_snapshot: ref.plantaNombre,
        nombre_comercial_snapshot: ref.plantaNombre,
        variedad_snapshot: ref.plantaVariedad,
        nombre_comunidad_snapshot: `QA Comunidad ${tag}`,
        nombre_recolector_snapshot: ref.userName,
      })
      .select('id')
      .single(),
    'crear recoleccion',
  );

  const evidenciaInicio = await createPendingEvidence(client, ref, tag, 0);

  const inicio = unwrapRpcRow(
    await client.rpc('fn_vivero_crear_lote_desde_recoleccion', {
      p_recoleccion_id: recoleccion.id,
      p_vivero_id: ref.viveroId,
      p_responsable_id: ref.userId,
      p_fecha_inicio: fechaEvento,
      p_fecha_evento: fechaEvento,
      p_cantidad_inicial_en_proceso: cantidad,
      p_unidad_medida_inicial: unidad,
      p_observaciones: `[${tag}] inicio`,
      p_evidencia_ids: [evidenciaInicio.id],
    }),
    'crear lote desde recoleccion',
  ) as { lote_vivero_id: number };

  return {
    ubicacionId: ubicacion.id,
    recoleccionId: recoleccion.id,
    loteId: inicio.lote_vivero_id,
    evidenciaIds: [evidenciaInicio.id],
  };
}

async function createPendingEvidence(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  index: number,
): Promise<PendingEvidence> {
  const tipoEntidad = unwrap(
    await client
      .from('tipos_entidad_evidencia')
      .select('id,codigo,activo')
      .ilike('codigo', 'EVENTO_LOTE_VIVERO')
      .eq('activo', true)
      .single(),
    'resolver tipo_entidad_evidencia EVENTO_LOTE_VIVERO',
  );

  const evidencia = unwrap(
    await client
      .from('evidencias_trazabilidad')
      .insert({
        tipo_entidad_id: tipoEntidad.id,
        entidad_id: 0,
        codigo_trazabilidad: `QA-EVI-${index}-${tag}`,
        bucket: 'recoleccion_fotos',
        ruta_archivo: `qa/${tag}/e${index}.jpg`,
        storage_object_id: null,
        tipo_archivo: 'FOTO',
        mime_type: 'image/jpeg',
        tamano_bytes: 1,
        hash_sha256: null,
        titulo: `[${tag}] evidencia ${index}`,
        descripcion: 'Evidencia QA pendiente de vincular a evento vivero',
        metadata: {
          tag,
          estado: 'PENDIENTE_VINCULACION',
          origen: 'QA_DESCARTE_PRE_EMBOLSADO',
        },
        es_principal: false,
        orden: index,
        creado_por_usuario_id: ref.userId,
      })
      .select('id')
      .single(),
    `crear evidencia pendiente ${index}`,
  );

  return {
    id: evidencia.id,
    tipoEntidadId: tipoEntidad.id,
  };
}

async function loadReferences(client: SupabaseClient): Promise<RefData> {
  const usuario = unwrap(
    await client
      .from('usuario')
      .select('id,nombre')
      .in('rol', ['ADMIN', 'GENERAL'])
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar usuario',
  );

  const planta = unwrap(
    await client
      .from('planta')
      .select('id,nombre_cientifico,variedad')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar planta',
  );

  const vivero = unwrap(
    await client
      .from('vivero')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar vivero',
  );

  const metodo = unwrap(
    await client
      .from('metodo_recoleccion')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar metodo',
  );

  const division = unwrap(
    await client
      .from('division_administrativa')
      .select('id,pais_id')
      .not('pais_id', 'is', null)
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar division administrativa',
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
  if (created.evidenciaIds.length > 0) {
    await client
      .from('evidencias_trazabilidad')
      .delete()
      .in('id', created.evidenciaIds);
  }

  if (created.loteId !== undefined) {
    await client
      .from('evento_lote_vivero')
      .delete()
      .eq('lote_id', created.loteId);
  }

  if (created.recoleccionId !== undefined) {
    await client
      .from('recoleccion_movimiento')
      .delete()
      .eq('recoleccion_id', created.recoleccionId);
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
}

async function cleanupByPrefix(client: SupabaseClient): Promise<void> {
  const { data: recolecciones } = await client
    .from('recoleccion')
    .select('id')
    .like('codigo_trazabilidad', 'QA-REC-qa_descarte_pre_%');

  const recoleccionIds =
    recolecciones?.map((recoleccion) => recoleccion.id) ?? [];

  const { data: lotes } = await client
    .from('lote_vivero')
    .select('id')
    .in('recoleccion_id', recoleccionIds.length > 0 ? recoleccionIds : [-1]);

  const loteIds = lotes?.map((lote) => lote.id) ?? [];

  const { data: ubicaciones } = await client
    .from('ubicacion')
    .select('id,nombre')
    .like('nombre', '[qa_descarte_pre_%');

  const ubicacionIds = ubicaciones?.map((ubicacion) => ubicacion.id) ?? [];

  await client
    .from('evidencias_trazabilidad')
    .delete()
    .or(
      [
        'codigo_trazabilidad.like.QA-EVI-%-qa_descarte_pre_%',
        'codigo_trazabilidad.like.VIV-%-QA-REC-qa_descarte_pre_%',
      ].join(','),
    );

  if (loteIds.length > 0) {
    await client.from('evento_lote_vivero').delete().in('lote_id', loteIds);
  }

  if (recoleccionIds.length > 0) {
    await client
      .from('recoleccion_movimiento')
      .delete()
      .in('recoleccion_id', recoleccionIds);
  }

  if (loteIds.length > 0) {
    await client.from('lote_vivero').delete().in('id', loteIds);
  }

  if (recoleccionIds.length > 0) {
    await client.from('recoleccion').delete().in('id', recoleccionIds);
  }

  if (ubicacionIds.length > 0) {
    await client.from('ubicacion').delete().in('id', ubicacionIds);
  }
}

function unwrap<T>(result: QueryResult<T>, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${formatError(result.error)}`);
  }

  if (result.data === null) {
    throw new Error(`${context}: la base no devolvio datos.`);
  }

  return result.data;
}

function unwrapRpcRow<T>(result: QueryResult<T[] | T>, context: string): T {
  const data = unwrap(result, context);
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error(`${context}: la RPC no devolvio filas.`);
    }
    return data[0];
  }

  return data;
}

function formatError(error: DbError): string {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' | ');
}
