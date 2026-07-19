// E2E DB de fn_m3_registrar_plantacion bajo el contrato fisico (M2-M3-03/07).
// Requiere Supabase real con las migraciones 051-056 aplicadas.
//
// Cubre:
//   - plantar consume asignaciones (cantidad_consumida) SIN generar eventos M2
//     y SIN modificar LOTE_VIVERO.saldo_vivo_actual (RN-VIV-52)
//   - detalle con evento_lote_vivero_despacho_id = NULL
//   - contadores: subcampania.total_plantado_inicial / total_repuesto y
//     registro origen.cantidad_repuesta_acumulada
//   - meta por especie bloquea exceso (plantacion inicial)
//   - reposicion permitida en COMPLETADA y bloqueada si excede el pendiente
//     (muertas - repuestas) del grupo origen

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
  registroIds: number[];
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

const hoy = () => new Date().toISOString().slice(0, 10);

// Punto dentro del poligono QA definido en createSubcampaniaConPoligono.
const GPS = { lat: -16.5, lng: -68.1 };

describe('fn_m3_registrar_plantacion — consumo de asignaciones (RN-VIV-52)', () => {
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

  it('plantacion inicial: consume la asignacion, cero eventos M2, saldo del lote intacto y reposicion posterior con tope', async () => {
    const tag = `qa_plantacion_fisica_${Date.now()}`;
    const created: CreatedIds = {
      evidenciaIds: [],
      subcampaniaIds: [],
      registroIds: [],
    };

    try {
      // Lote 30 con EMBOLSADO + 6 evidencias pendientes de trabajo.
      Object.assign(created, await createLote(client, ref, tag, 30, 6));
      const sub = await createSubcampaniaConPoligono(client, ref, tag, 20);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      // Asignacion fisica PLANTACION_INICIAL de 15 (lote queda en 15).
      const asignacion = unwrapRpcRow(
        await client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 15,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [created.evidenciaIds[0]],
        }),
        'asignar stock inicial',
      ) as { asignacion_id: number; saldo_vivo_despues: number };

      expect(asignacion.saldo_vivo_despues).toBe(15);

      const eventosAntes = await contarEventosM2(client, created.loteId!);

      // Meta por especie: objetivo 20. Plantar 25 debe fallar; plantar 12 pasa.
      const excesoMeta = await client.rpc('fn_m3_registrar_plantacion', {
        p_subcampania_id: sub.subcampaniaId,
        p_es_reposicion: false,
        p_registro_plantacion_origen_id: null,
        p_fecha_plantacion: hoy(),
        p_responsable_id: ref.userId,
        p_latitud: GPS.lat,
        p_longitud: GPS.lng,
        p_observaciones: `[${tag}] exceso meta`,
        p_coresponsable_ids: [],
        p_detalles: [
          {
            asignacion_id: asignacion.asignacion_id,
            lote_vivero_id: created.loteId,
            planta_id: ref.plantaId,
            cantidad: 25,
          },
        ],
        p_evidencia_ids: [created.evidenciaIds[1]],
      });
      // Falla por meta (25 > 20) o por saldo asignado (25 > 15): ambas guardas
      // son del contrato; el mensaje debe mencionar alguna de las dos.
      expect(excesoMeta.error?.message ?? '').toMatch(/meta|saldo asignado/i);

      const inicial = unwrapRpcRow(
        await client.rpc('fn_m3_registrar_plantacion', {
          p_subcampania_id: sub.subcampaniaId,
          p_es_reposicion: false,
          p_registro_plantacion_origen_id: null,
          p_fecha_plantacion: hoy(),
          p_responsable_id: ref.userId,
          p_latitud: GPS.lat,
          p_longitud: GPS.lng,
          p_observaciones: `[${tag}] inicial`,
          p_coresponsable_ids: [],
          p_detalles: [
            {
              asignacion_id: asignacion.asignacion_id,
              lote_vivero_id: created.loteId,
              planta_id: ref.plantaId,
              cantidad: 12,
            },
          ],
          p_evidencia_ids: [created.evidenciaIds[1]],
        }),
        'registrar plantacion inicial',
      ) as {
        registro_plantacion_id: number;
        cantidad_total_plantada: number;
        consumos: Array<{
          asignacion_id: number;
          cantidad_consumida: number;
          saldo_asignado_despues: number;
        }>;
      };
      created.registroIds.push(inicial.registro_plantacion_id);

      expect(inicial.cantidad_total_plantada).toBe(12);
      expect(inicial.consumos).toHaveLength(1);
      expect(inicial.consumos[0].cantidad_consumida).toBe(12);
      expect(inicial.consumos[0].saldo_asignado_despues).toBe(3);

      // RN-VIV-52: cero eventos M2 nuevos y saldo fisico intacto.
      const eventosDespues = await contarEventosM2(client, created.loteId!);
      expect(eventosDespues).toBe(eventosAntes);

      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'saldo del lote tras plantar',
      );
      expect(lote.saldo_vivo_actual).toBe(15);

      // Consumo persistido y detalle sin despacho legado.
      const asigTrasPlantar = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select('cantidad_consumida, saldo_asignado_disponible, estado')
          .eq('id', asignacion.asignacion_id)
          .single(),
        'asignacion tras plantar',
      );
      expect(asigTrasPlantar.cantidad_consumida).toBe(12);
      expect(asigTrasPlantar.saldo_asignado_disponible).toBe(3);

      const detalles = unwrap(
        await client
          .from('registro_plantacion_detalle')
          .select('cantidad, evento_lote_vivero_despacho_id')
          .eq('registro_plantacion_id', inicial.registro_plantacion_id),
        'detalles del registro',
      );
      expect(detalles).toHaveLength(1);
      expect(detalles[0].cantidad).toBe(12);
      expect(detalles[0].evento_lote_vivero_despacho_id).toBeNull();

      const subTrasInicial = unwrap(
        await client
          .from('subcampania')
          .select('total_plantado_inicial, total_repuesto')
          .eq('id', sub.subcampaniaId)
          .single(),
        'contadores subcampania tras inicial',
      );
      expect(subTrasInicial.total_plantado_inicial).toBe(12);
      expect(subTrasInicial.total_repuesto).toBe(0);

      // ---------------- Reposicion sobre subcampania COMPLETADA ----------------
      unwrap(
        await client
          .from('subcampania')
          .update({
            estado: 'COMPLETADA',
            fecha_cierre_operativo: new Date().toISOString(),
            fecha_fin_mantenimiento: hoy(),
          })
          .eq('id', sub.subcampaniaId)
          .select('id')
          .single(),
        'cerrar subcampania como COMPLETADA',
      );

      // Mortandad simulada en el grupo origen: 5 muertas, 0 repuestas.
      unwrap(
        await client
          .from('registro_plantacion')
          .update({ cantidad_muerta_acumulada: 5 })
          .eq('id', inicial.registro_plantacion_id)
          .select('id')
          .single(),
        'registrar mortandad simulada',
      );

      // Asignacion fisica con proposito REPOSICION (aceptada en COMPLETADA).
      const asignacionRepo = unwrapRpcRow(
        await client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 8,
          p_proposito: 'REPOSICION',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [created.evidenciaIds[2]],
        }),
        'asignar stock de reposicion',
      ) as { asignacion_id: number; saldo_vivo_despues: number };
      expect(asignacionRepo.saldo_vivo_despues).toBe(7);

      // Exceso: reponer 6 > pendiente 5 debe fallar.
      const excesoRepo = await client.rpc('fn_m3_registrar_plantacion', {
        p_subcampania_id: sub.subcampaniaId,
        p_es_reposicion: true,
        p_registro_plantacion_origen_id: inicial.registro_plantacion_id,
        p_fecha_plantacion: hoy(),
        p_responsable_id: ref.userId,
        p_latitud: GPS.lat,
        p_longitud: GPS.lng,
        p_observaciones: `[${tag}] exceso reposicion`,
        p_coresponsable_ids: [],
        p_detalles: [
          {
            asignacion_id: asignacionRepo.asignacion_id,
            lote_vivero_id: created.loteId,
            planta_id: ref.plantaId,
            cantidad: 6,
          },
        ],
        p_evidencia_ids: [created.evidenciaIds[3]],
      });
      expect(excesoRepo.error?.message ?? '').toMatch(
        /pendiente de reposicion/i,
      );

      // Reposicion valida de 4 <= 5.
      const reposicion = unwrapRpcRow(
        await client.rpc('fn_m3_registrar_plantacion', {
          p_subcampania_id: sub.subcampaniaId,
          p_es_reposicion: true,
          p_registro_plantacion_origen_id: inicial.registro_plantacion_id,
          p_fecha_plantacion: hoy(),
          p_responsable_id: ref.userId,
          p_latitud: GPS.lat,
          p_longitud: GPS.lng,
          p_observaciones: `[${tag}] reposicion`,
          p_coresponsable_ids: [],
          p_detalles: [
            {
              asignacion_id: asignacionRepo.asignacion_id,
              lote_vivero_id: created.loteId,
              planta_id: ref.plantaId,
              cantidad: 4,
            },
          ],
          p_evidencia_ids: [created.evidenciaIds[3]],
        }),
        'registrar reposicion',
      ) as { registro_plantacion_id: number };
      created.registroIds.push(reposicion.registro_plantacion_id);

      // La reposicion tampoco genera eventos M2 ni toca el saldo del lote.
      expect(await contarEventosM2(client, created.loteId!)).toBe(
        eventosDespues + 1, // +1 por el DESPACHO de la asignacion REPOSICION
      );
      const loteFinal = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'saldo final del lote',
      );
      expect(loteFinal.saldo_vivo_actual).toBe(7);

      // Contadores: la reposicion avanza total_repuesto y el acumulado del
      // origen, pero NO la meta (total_plantado_inicial).
      const origenFinal = unwrap(
        await client
          .from('registro_plantacion')
          .select('cantidad_repuesta_acumulada')
          .eq('id', inicial.registro_plantacion_id)
          .single(),
        'acumulado de reposicion del origen',
      );
      expect(origenFinal.cantidad_repuesta_acumulada).toBe(4);

      const subFinal = unwrap(
        await client
          .from('subcampania')
          .select('total_plantado_inicial, total_repuesto')
          .eq('id', sub.subcampaniaId)
          .single(),
        'contadores finales subcampania',
      );
      expect(subFinal.total_plantado_inicial).toBe(12);
      expect(subFinal.total_repuesto).toBe(4);
    } finally {
      await cleanup(client, created);
    }
  }, 90000);
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function contarEventosM2(
  client: SupabaseClient,
  loteId: number,
): Promise<number> {
  const { count, error } = await client
    .from('evento_lote_vivero')
    .select('id', { count: 'exact', head: true })
    .eq('lote_id', loteId);
  if (error) throw new Error(`contar eventos M2: ${error.message}`);
  return count ?? 0;
}

async function createSubcampaniaConPoligono(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  metaEspecie: number,
): Promise<{ campaniaId: number; subcampaniaId: number }> {
  const campania = unwrap(
    await client
      .from('campania')
      .insert({
        nombre: `[${tag}] Campania`,
        descripcion: 'Campania de prueba',
        tipo: 'REFORESTACION',
        fecha_estimada_inicio: hoy(),
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

  const subcampania = unwrap(
    await client
      .from('subcampania')
      .insert({
        campania_id: campania.id,
        nombre: `[${tag}] Subcampania`,
        tipo: 'REFORESTACION',
        estado: 'ACTIVA',
        zona_id: ref.divisionId,
        meta_total_arboles: metaEspecie,
        codigo_trazabilidad: `SUB-QA-${tag}`,
        // Poligono QA que contiene el punto GPS (-16.5, -68.1).
        poligono_geom:
          'SRID=4326;POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',
        created_by: ref.userId,
        updated_by: ref.userId,
      })
      .select('id')
      .single(),
    'crear subcampania con poligono',
  );

  unwrap(
    await client
      .from('subcampania_equipo')
      .insert({
        subcampania_id: subcampania.id,
        usuario_id: ref.userId,
        rol: 'COORDINADOR',
        agregado_by: ref.userId,
      })
      .select('id')
      .single(),
    'agregar coordinador',
  );

  unwrap(
    await client
      .from('subcampania_meta_especie')
      .insert({
        subcampania_id: subcampania.id,
        planta_id: ref.plantaId,
        porcentaje_objetivo: 100,
        cantidad_objetivo: metaEspecie,
        created_by: ref.userId,
        updated_by: ref.userId,
      })
      .select('id')
      .single(),
    'crear meta por especie',
  );

  return { campaniaId: campania.id, subcampaniaId: subcampania.id };
}

async function createLote(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  cantidad: number,
  evidencias: number,
): Promise<{
  ubicacionId: number;
  recoleccionId: number;
  loteId: number;
  evidenciaIds: number[];
}> {
  const fechaEvento = hoy();

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

  const totalEvidencias = evidencias + 2; // + INICIO + EMBOLSADO
  const evidenciaIds: number[] = [];
  for (let i = 0; i < totalEvidencias; i++) {
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
      p_evidencia_ids: [evidenciaIds[totalEvidencias - 2]],
    }),
    'crear lote desde recoleccion',
  ) as { lote_vivero_id: number };

  unwrap(
    await client.rpc('fn_vivero_registrar_embolsado', {
      p_lote_id: inicio.lote_vivero_id,
      p_fecha_evento: fechaEvento,
      p_responsable_id: ref.userId,
      p_plantas_vivas_iniciales: cantidad,
      p_observaciones: `[${tag}] embolsado`,
      p_evidencia_ids: [evidenciaIds[totalEvidencias - 1]],
    }),
    'registrar EMBOLSADO',
  );

  // Devuelve TODAS las evidencias (para cleanup); los tests usan los
  // indices 0..evidencias-1, que quedaron libres (las dos ultimas fueron
  // consumidas por INICIO y EMBOLSADO).
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
      .order('rol', { ascending: true })
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
  if (created.subcampaniaIds.length > 0) {
    await client
      .from('evento_plantacion')
      .delete()
      .in('subcampania_id', created.subcampaniaIds);
  }
  if (created.registroIds.length > 0) {
    await client
      .from('registro_plantacion_detalle')
      .delete()
      .in('registro_plantacion_id', created.registroIds);
    await client
      .from('registro_plantacion_coresponsable')
      .delete()
      .in('registro_plantacion_id', created.registroIds);
    // Primero las reposiciones (referencian al origen), luego el resto.
    await client
      .from('registro_plantacion')
      .delete()
      .in('id', created.registroIds)
      .eq('es_reposicion', true);
    await client
      .from('registro_plantacion')
      .delete()
      .in('id', created.registroIds);
  }
  if (created.loteId !== undefined) {
    await client
      .from('evento_lote_vivero')
      .delete()
      .eq('lote_id', created.loteId);
    await client
      .from('asignacion_vivero_subcampania')
      .delete()
      .eq('lote_vivero_id', created.loteId);
  }
  if (created.evidenciaIds.length > 0) {
    // Incluye las evidencias que la RPC retipo a REGISTRO_PLANTACION:
    // todas fueron creadas en este spec y estan en created.evidenciaIds.
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
    await client
      .from('subcampania_meta_especie')
      .delete()
      .in('subcampania_id', created.subcampaniaIds);
    await client
      .from('subcampania_equipo')
      .delete()
      .in('subcampania_id', created.subcampaniaIds);
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
