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

type PendingInicioEvidence = {
  id: number;
  tipoEntidadId: number;
};

describe('Migraciones DB - flujo mínimo vivero', () => {
  let client: SupabaseClient;

  beforeAll(() => {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY son obligatorias para las pruebas de integración.',
      );
    }

    client = createClient(url, key);
  });

  afterEach(async () => {
    await cleanupByTag(client);
  });

  it(
    'ejecuta el flujo mínimo completo sin inconsistencias',
    async () => {
      const tag = `qa_mig_vivero_${Date.now()}`;
      const fechaEvento = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString().slice(0, 10);
      const created: CreatedIds = {};
      const ref = await loadReferences(client);

      try {
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
          'crear ubicación de integración',
        );
        created.ubicacionId = ubicacion.id;

        const recoleccion = unwrap(
          await client
            .from('recoleccion')
            .insert({
              fecha: fechaEvento,
              tipo_material: 'SEMILLA',
              especie_nueva: false,
              observaciones: `[${tag}]`,
              usuario_id: ref.userId,
              ubicacion_id: created.ubicacionId,
              vivero_id: ref.viveroId,
              metodo_id: ref.metodoId,
              planta_id: ref.plantaId,
              codigo_trazabilidad: `QA-REC-${tag}`,
              estado_registro: 'VALIDADO',
              usuario_validacion_id: ref.userId,
              fecha_validacion: fechaEvento,
              unidad_canonica: 'UNIDAD',
              cantidad_inicial_canonica: 10,
              nombre_cientifico_snapshot: ref.plantaNombre,
              nombre_comercial_snapshot: ref.plantaNombre,
              variedad_snapshot: ref.plantaVariedad,
              nombre_comunidad_snapshot: `QA Comunidad ${tag}`,
              nombre_recolector_snapshot: ref.userName,
            })
            .select(
              'id,saldo_actual,estado_operativo,nombre_cientifico_snapshot,variedad_snapshot',
            )
            .single(),
          'crear recolección válida',
        );
        created.recoleccionId = recoleccion.id;

        expect(recoleccion.saldo_actual).toBe(10);
        expect(recoleccion.estado_operativo).toBe('ABIERTO');

        const evidenciaInicio = await createPendingInicioEvidence(client, {
          userId: ref.userId,
          tag,
        });
        created.evidenciaIds = [evidenciaInicio.id];

        const inicio = unwrapRpcRow(
          await client.rpc('fn_vivero_crear_lote_desde_recoleccion', {
            p_recoleccion_id: created.recoleccionId,
            p_vivero_id: ref.viveroId,
            p_responsable_id: ref.userId,
            p_fecha_inicio: fechaEvento,
            p_fecha_evento: fechaEvento,
            p_cantidad_inicial_en_proceso: 10,
            p_unidad_medida_inicial: 'UNIDAD',
            p_observaciones: `[${tag}] inicio`,
            p_evidencia_ids: [evidenciaInicio.id],
          }),
          'crear lote desde recolección con RPC atomica',
        );
        created.loteId = inicio.lote_vivero_id;

        expect(inicio.codigo_trazabilidad).toMatch(
          new RegExp(`^VIV-\\d{6}-QA-REC-${tag}$`),
        );
        expect(inicio).toMatchObject({
          saldo_recoleccion_antes: 10,
          saldo_recoleccion_despues: 0,
          evidencia_inicio_ids: [evidenciaInicio.id],
        });

        unwrap(
          await client.rpc('fn_vivero_registrar_embolsado', {
            p_lote_id: created.loteId,
            p_fecha_evento: fechaEvento,
            p_responsable_id: ref.userId,
            p_plantas_vivas_iniciales: 10,
            p_observaciones: `[${tag}] embolsado`,
          }),
          'registrar EMBOLSADO',
        );

        unwrap(
          await client.rpc('fn_vivero_registrar_adaptabilidad', {
            p_lote_id: created.loteId,
            p_fecha_evento: fechaEvento,
            p_responsable_id: ref.userId,
            p_subetapa_destino: 'SOMBRA',
            p_observaciones: `[${tag}] adaptabilidad`,
          }),
          'registrar ADAPTABILIDAD',
        );

        unwrap(
          await client.rpc('fn_vivero_registrar_merma', {
            p_lote_id: created.loteId,
            p_fecha_evento: fechaEvento,
            p_responsable_id: ref.userId,
            p_cantidad_perdida: 3,
            p_causa_merma: 'OTRO',
            p_observaciones: `[${tag}] merma`,
          }),
          'registrar MERMA',
        );

        const despachoId = unwrap(
          await client.rpc('fn_vivero_registrar_despacho', {
            p_lote_id: created.loteId,
            p_fecha_evento: fechaEvento,
            p_responsable_id: ref.userId,
            p_cantidad_despachada: 7,
            p_destino_tipo: 'OTRO',
            p_destino_referencia: `[${tag}] destino`,
            p_observaciones: `[${tag}] despacho`,
          }),
          'registrar DESPACHO',
        );

        const loteFinal = unwrap(
          await client
            .from('lote_vivero')
            .select(
              'id,codigo_trazabilidad,responsable_id,nombre_responsable_snapshot,estado_lote,motivo_cierre,saldo_vivo_actual,subetapa_actual,plantas_vivas_iniciales',
            )
            .eq('id', created.loteId)
            .single(),
          'leer estado final del lote',
        );

        const eventos = unwrap(
          await client
            .from('evento_lote_vivero')
            .select(
              'id,tipo_evento,fecha_evento,cantidad_afectada,unidad_medida_evento,subetapa_destino,causa_merma,destino_tipo,destino_referencia,saldo_vivo_antes,saldo_vivo_despues,motivo_cierre_calculado,ref_evento_trigger_id',
            )
            .eq('lote_id', created.loteId)
            .order('id', { ascending: true }),
          'leer historial de EVENTO_LOTE_VIVERO',
        );

        const movimientos = unwrap(
          await client
            .from('recoleccion_movimiento')
            .select(
              'id,recoleccion_id,tipo_movimiento,delta,unidad_medida_evento,motivo,lote_vivero_id,created_by',
            )
            .eq('recoleccion_id', created.recoleccionId)
            .order('id', { ascending: true }),
          'leer descuento en RECOLECCION_MOVIMIENTO',
        );

        const recoleccionFinal = unwrap(
          await client
            .from('recoleccion')
            .select('id,saldo_actual,estado_operativo')
            .eq('id', created.recoleccionId)
            .single(),
          'leer estado operativo final de la recolección',
        );

        const evidenciaInicioFinal = unwrap(
          await client
            .from('evidencias_trazabilidad')
            .select('id,tipo_entidad_id,entidad_id,codigo_trazabilidad,eliminado_en')
            .eq('id', evidenciaInicio.id)
            .single(),
          'leer evidencia vinculada al evento INICIO',
        );

        expect(loteFinal.codigo_trazabilidad).toBe(inicio.codigo_trazabilidad);
        expect(loteFinal.responsable_id).toBe(ref.userId);
        expect(loteFinal.nombre_responsable_snapshot).toBe(ref.userName);
        expect(loteFinal.estado_lote).toBe('FINALIZADO');
        expect(loteFinal.motivo_cierre).toBe('MIXTO');
        expect(loteFinal.saldo_vivo_actual).toBe(0);
        expect(loteFinal.subetapa_actual).toBe('SOMBRA');
        expect(loteFinal.plantas_vivas_iniciales).toBe(10);

        expect(eventos.map((evento) => evento.tipo_evento)).toEqual([
          'INICIO',
          'EMBOLSADO',
          'ADAPTABILIDAD',
          'MERMA',
          'DESPACHO',
          'CIERRE_AUTOMATICO',
        ]);

        const inicioEvento = eventos.find(
          (evento) => evento.tipo_evento === 'INICIO',
        );
        expect(inicioEvento).toMatchObject({
          id: inicio.evento_inicio_id,
          cantidad_afectada: 10,
          unidad_medida_evento: 'UNIDAD',
          saldo_vivo_antes: null,
          saldo_vivo_despues: null,
        });

        expect(evidenciaInicioFinal).toMatchObject({
          id: evidenciaInicio.id,
          tipo_entidad_id: evidenciaInicio.tipoEntidadId,
          entidad_id: inicio.evento_inicio_id,
          codigo_trazabilidad: inicio.codigo_trazabilidad,
          eliminado_en: null,
        });

        const cierreAutomatico = eventos.find(
          (evento) => evento.tipo_evento === 'CIERRE_AUTOMATICO',
        );
        expect(cierreAutomatico).toBeDefined();
        expect(cierreAutomatico?.ref_evento_trigger_id).toBe(despachoId);
        expect(cierreAutomatico?.motivo_cierre_calculado).toBe('MIXTO');

        expect(movimientos).toHaveLength(1);
        expect(movimientos[0]).toMatchObject({
          recoleccion_id: created.recoleccionId,
          tipo_movimiento: 'CONSUMO_A_VIVERO',
          delta: -10,
          unidad_medida_evento: 'UNIDAD',
          motivo: 'CONSUMO_PARA_VIVERO',
          lote_vivero_id: created.loteId,
          created_by: ref.userId,
        });
        expect(movimientos[0].id).toBe(inicio.recoleccion_movimiento_id);

        expect(recoleccionFinal.saldo_actual).toBe(0);
        expect(recoleccionFinal.estado_operativo).toBe('CERRADO');
      } finally {
        await cleanup(client, created);
      }
    },
    30000,
  );
});

async function loadReferences(client: SupabaseClient): Promise<RefData> {
  const usuario = unwrap(
    await client
      .from('usuario')
      .select('id,nombre')
      .in('rol', ['ADMIN', 'GENERAL'])
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar usuario de referencia',
  );

  const planta = unwrap(
    await client
      .from('planta')
      .select('id,nombre_cientifico,variedad')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar planta de referencia',
  );

  const vivero = unwrap(
    await client
      .from('vivero')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar vivero de referencia',
  );

  const metodo = unwrap(
    await client
      .from('metodo_recoleccion')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar método de referencia',
  );

  const division = unwrap(
    await client
      .from('division_administrativa')
      .select('id,pais_id')
      .not('pais_id', 'is', null)
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar división administrativa de referencia',
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

async function createPendingInicioEvidence(
  client: SupabaseClient,
  params: {
    userId: number;
    tag: string;
  },
): Promise<PendingInicioEvidence> {
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
        codigo_trazabilidad: `QA-EVI-${params.tag}`,
        bucket: 'recoleccion_fotos',
        ruta_archivo: `qa/${params.tag}/inicio.jpg`,
        storage_object_id: null,
        tipo_archivo: 'FOTO',
        mime_type: 'image/jpeg',
        tamano_bytes: 1,
        hash_sha256: null,
        titulo: `[${params.tag}] evidencia inicio`,
        descripcion: 'Evidencia QA pendiente de vincular a evento INICIO',
        metadata: {
          tag: params.tag,
          estado: 'PENDIENTE_VINCULACION',
          origen: 'QA_VIVERO_INICIO',
        },
        es_principal: true,
        orden: 0,
        creado_por_usuario_id: params.userId,
      })
      .select('id')
      .single(),
    'crear evidencia pendiente para INICIO',
  );

  return {
    id: evidencia.id,
    tipoEntidadId: tipoEntidad.id,
  };
}

async function cleanup(client: SupabaseClient, created: CreatedIds): Promise<void> {
  if (created.evidenciaIds?.length) {
    await client
      .from('evidencias_trazabilidad')
      .delete()
      .in('id', created.evidenciaIds);
  }

  if (created.loteId) {
    await client.from('evento_lote_vivero').delete().eq('lote_id', created.loteId);
  }

  if (created.recoleccionId) {
    await client
      .from('recoleccion_movimiento')
      .delete()
      .eq('recoleccion_id', created.recoleccionId);
  }

  if (created.loteId) {
    await client.from('lote_vivero').delete().eq('id', created.loteId);
  }

  if (created.recoleccionId) {
    await client.from('recoleccion').delete().eq('id', created.recoleccionId);
  }

  if (created.ubicacionId) {
    await client.from('ubicacion').delete().eq('id', created.ubicacionId);
  }
}

async function cleanupByTag(client: SupabaseClient): Promise<void> {
  const { data: ubicaciones } = await client
    .from('ubicacion')
    .select('id,nombre')
    .like('nombre', '[qa_mig_vivero_%');

  if (!ubicaciones?.length) {
    return;
  }

  const ubicacionIds = ubicaciones.map((ubicacion) => ubicacion.id);

  const { data: recolecciones } = await client
    .from('recoleccion')
    .select('id')
    .like('codigo_trazabilidad', 'QA-REC-qa_mig_vivero_%');

  const recoleccionIds = recolecciones?.map((recoleccion) => recoleccion.id) ?? [];

  const { data: lotes } = await client
    .from('lote_vivero')
    .select('id')
    .in('recoleccion_id', recoleccionIds.length > 0 ? recoleccionIds : [-1]);

  const loteIds = lotes?.map((lote) => lote.id) ?? [];

  await client
    .from('evidencias_trazabilidad')
    .delete()
    .or(
      [
        'codigo_trazabilidad.like.QA-EVI-qa_mig_vivero_%',
        'codigo_trazabilidad.like.VIV-%-QA-REC-qa_mig_vivero_%',
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
    throw new Error(`${context}: la base no devolvió datos.`);
  }

  return result.data;
}

function unwrapRpcRow<T>(result: QueryResult<T[] | T>, context: string): T {
  const data = unwrap(result, context);
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error(`${context}: la RPC no devolvió filas.`);
    }
    return data[0] as T;
  }

  return data as T;
}

function formatError(error: DbError): string {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' | ');
}
