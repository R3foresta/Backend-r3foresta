// E2E DB del contrato fisico M2 <-> M3 (tareas M2-M3-02/04/05/07).
// Requiere Supabase real con las migraciones 051-055 aplicadas.
//
// Cubre:
//   - guard EMBOLSADO (RN-VIV-61) — reemplaza reserva_requiere_embolsado.e2e-spec.ts
//   - asignacion fisica exitosa: descuenta saldo, evento M2 ASIGNACION_SUBCAMPANIA,
//     evento M3 ASIGNACION_VIVERO, evidencia vinculada (RN-VIV-47/54)
//   - evidencia obligatoria y saldo fisico insuficiente
//   - concurrencia: dos asignaciones simultaneas no dejan saldo negativo
//   - CHECKs: AUTOMATICO_PLANTACION bloqueado para nuevas escrituras (RN-VIV-55)
//     y DESPACHO MANUAL no puede usar PLANTACION_CAMPANIA
//   - devolucion fisica parcial y total (RN-VIV-48) con eventos M2/M3
//   - merma fisica: no toca asignaciones y bloquea si excede el saldo del lote
//     (reemplaza merma_lifo.e2e-spec.ts — la politica LIFO quedo obsoleta)

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

type AsignacionRpcRow = {
  asignacion_id: number;
  evento_lote_vivero_id: number;
  evento_plantacion_id: number;
  saldo_vivo_antes: number;
  saldo_vivo_despues: number;
  lote_finalizado: boolean;
};

function nuevoRegistro(): CreatedIds {
  return { evidenciaIds: [], subcampaniaIds: [], asignacionIds: [] };
}

const hoy = () => new Date().toISOString().slice(0, 10);

describe('Contrato fisico M2-M3: asignacion, devolucion y merma', () => {
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

  // -------------------------------------------------------------------
  // RN-VIV-61: guard de EMBOLSADO
  // -------------------------------------------------------------------
  it('rechaza asignar un lote ACTIVO con saldo positivo si no tiene EMBOLSADO', async () => {
    const tag = `qa_asig_sin_embolsado_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, false, 1));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      // Inconsistencia legacy simulada: saldo positivo sin EMBOLSADO.
      unwrap(
        await client
          .from('lote_vivero')
          .update({ saldo_vivo_actual: 20 })
          .eq('id', created.loteId)
          .select('id')
          .single(),
        'preparar lote sin EMBOLSADO con saldo positivo',
      );

      const result = await client.rpc('fn_vivero_asignar_stock_subcampania', {
        p_lote_vivero_id: created.loteId,
        p_subcampania_id: sub.subcampaniaId,
        p_cantidad_asignada: 5,
        p_proposito: 'PLANTACION_INICIAL',
        p_usuario_asignacion_id: ref.userId,
        p_fecha_asignacion: hoy(),
        p_evidencia_ids: [created.evidenciaIds[0]],
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

  // -------------------------------------------------------------------
  // RN-VIV-47/54: asignacion fisica exitosa
  // -------------------------------------------------------------------
  it('asignacion fisica: descuenta saldo del lote y registra eventos M2 + M3 con evidencia', async () => {
    const tag = `qa_asig_fisica_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, true, 3));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);
      const evidenciaAsignacion = created.evidenciaIds[2];

      const row = unwrapRpcRow(
        await client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 5,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [evidenciaAsignacion],
        }),
        'asignar stock fisicamente',
      ) as AsignacionRpcRow;
      created.asignacionIds.push(row.asignacion_id);

      // Descuento fisico inmediato (RN-VIV-47).
      expect(row.saldo_vivo_antes).toBe(20);
      expect(row.saldo_vivo_despues).toBe(15);

      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual, estado_lote')
          .eq('id', created.loteId)
          .single(),
        'leer lote tras asignar',
      );
      expect(lote.saldo_vivo_actual).toBe(15);
      expect(lote.estado_lote).toBe('ACTIVO');

      // Evento M2: DESPACHO por ASIGNACION_SUBCAMPANIA, sin registro_plantacion.
      const eventoM2 = unwrap(
        await client
          .from('evento_lote_vivero')
          .select(
            'tipo_evento, origen_despacho, destino_tipo, subcampania_id, campania_id, registro_plantacion_id, asignacion_id, cantidad_afectada, unidad_medida_evento, saldo_vivo_antes, saldo_vivo_despues',
          )
          .eq('id', row.evento_lote_vivero_id)
          .single(),
        'leer evento M2 de la asignacion',
      );
      expect(eventoM2.tipo_evento).toBe('DESPACHO');
      expect(eventoM2.origen_despacho).toBe('ASIGNACION_SUBCAMPANIA');
      expect(eventoM2.destino_tipo).toBe('PLANTACION_CAMPANIA');
      expect(eventoM2.subcampania_id).toBe(sub.subcampaniaId);
      expect(eventoM2.campania_id).toBe(sub.campaniaId);
      expect(eventoM2.registro_plantacion_id).toBeNull();
      expect(eventoM2.asignacion_id).toBe(row.asignacion_id);
      expect(eventoM2.cantidad_afectada).toBe(5);
      expect(eventoM2.unidad_medida_evento).toBe('UNIDAD');

      // Evento M3: ASIGNACION_VIVERO.
      const eventoM3 = unwrap(
        await client
          .from('evento_plantacion')
          .select('tipo_evento, subcampania_id, asignacion_id, cantidad_asignada_evento')
          .eq('id', row.evento_plantacion_id)
          .single(),
        'leer evento M3 de la asignacion',
      );
      expect(eventoM3.tipo_evento).toBe('ASIGNACION_VIVERO');
      expect(eventoM3.subcampania_id).toBe(sub.subcampaniaId);
      expect(eventoM3.asignacion_id).toBe(row.asignacion_id);
      expect(eventoM3.cantidad_asignada_evento).toBe(5);

      // Evidencia vinculada al evento M2 (RN-VIV-54).
      const evidencia = unwrap(
        await client
          .from('evidencias_trazabilidad')
          .select('entidad_id')
          .eq('id', evidenciaAsignacion)
          .single(),
        'leer evidencia vinculada',
      );
      expect(evidencia.entidad_id).toBe(row.evento_lote_vivero_id);

      // La validacion NO resta asignaciones previas: quedan 15 fisicas y
      // se pueden asignar 15 mas aunque ya haya 5 asignadas (RN-VIV-57).
      const segunda = unwrapRpcRow(
        await client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 15,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [created.evidenciaIds[1]],
        }),
        'asignar el resto del saldo fisico',
      ) as AsignacionRpcRow;
      created.asignacionIds.push(segunda.asignacion_id);

      expect(segunda.saldo_vivo_despues).toBe(0);
      expect(segunda.lote_finalizado).toBe(true);
    } finally {
      await cleanup(client, created);
    }
  }, 45000);

  // -------------------------------------------------------------------
  // RN-VIV-54: evidencia obligatoria / saldo fisico insuficiente
  // -------------------------------------------------------------------
  it('rechaza asignacion sin evidencia y asignacion que excede el saldo fisico', async () => {
    const tag = `qa_asig_guards_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 10, true, 2));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      const sinEvidencia = await client.rpc(
        'fn_vivero_asignar_stock_subcampania',
        {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 5,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [],
        },
      );
      expect(sinEvidencia.error?.message ?? '').toMatch(/evidencia/i);

      const excedeSaldo = await client.rpc(
        'fn_vivero_asignar_stock_subcampania',
        {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 11,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [created.evidenciaIds[1]],
        },
      );
      expect(excedeSaldo.error?.message ?? '').toMatch(/excede el saldo/i);

      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'saldo intacto tras rechazos',
      );
      expect(lote.saldo_vivo_actual).toBe(10);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  // -------------------------------------------------------------------
  // Concurrencia: el saldo fisico nunca queda negativo
  // -------------------------------------------------------------------
  it('dos asignaciones simultaneas no dejan saldo negativo', async () => {
    const tag = `qa_asig_concurrencia_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, true, 3));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      const llamada = (evidenciaId: number) =>
        client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 15,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [evidenciaId],
        });

      const [r1, r2] = await Promise.all([
        llamada(created.evidenciaIds[1]),
        llamada(created.evidenciaIds[2]),
      ]);

      const exitos = [r1, r2].filter((r) => !r.error);
      const fallos = [r1, r2].filter((r) => r.error);
      for (const exito of exitos) {
        const row = (Array.isArray(exito.data) ? exito.data[0] : exito.data) as
          | AsignacionRpcRow
          | undefined;
        if (row) created.asignacionIds.push(row.asignacion_id);
      }

      // 15 + 15 > 20: exactamente una debe fallar por saldo.
      expect(exitos).toHaveLength(1);
      expect(fallos).toHaveLength(1);
      expect(fallos[0].error?.message ?? '').toMatch(/excede el saldo/i);

      const lote = unwrap(
        await client
          .from('lote_vivero')
          .select('saldo_vivo_actual')
          .eq('id', created.loteId)
          .single(),
        'saldo tras concurrencia',
      );
      expect(lote.saldo_vivo_actual).toBe(5);
    } finally {
      await cleanup(client, created);
    }
  }, 45000);

  // -------------------------------------------------------------------
  // RN-VIV-55: AUTOMATICO_PLANTACION bloqueado / MANUAL no usa PLANTACION_CAMPANIA
  // -------------------------------------------------------------------
  it('la BD rechaza nuevas escrituras con AUTOMATICO_PLANTACION y despachos MANUAL hacia PLANTACION_CAMPANIA', async () => {
    const tag = `qa_checks_legado_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 10, true, 2));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      // Regresion RN-VIV-55: si algun codigo vuelve a emitir
      // AUTOMATICO_PLANTACION, este insert dejaria de fallar.
      const automatico = await client.from('evento_lote_vivero').insert({
        lote_id: created.loteId,
        tipo_evento: 'DESPACHO',
        fecha_evento: hoy(),
        responsable_id: ref.userId,
        cantidad_afectada: 1,
        unidad_medida_evento: 'UNIDAD',
        destino_tipo: 'PLANTACION_CAMPANIA',
        destino_referencia: `[${tag}] legado`,
        origen_despacho: 'AUTOMATICO_PLANTACION',
        subcampania_id: sub.subcampaniaId,
        campania_id: sub.campaniaId,
        registro_plantacion_id: null,
        saldo_vivo_antes: 10,
        saldo_vivo_despues: 9,
      });
      expect(automatico.error?.message ?? '').toMatch(
        /origen_despacho_consistency|check/i,
      );

      // DESPACHO MANUAL no puede apuntar a PLANTACION_CAMPANIA.
      const manualHaciaCampania = await client
        .from('evento_lote_vivero')
        .insert({
          lote_id: created.loteId,
          tipo_evento: 'DESPACHO',
          fecha_evento: hoy(),
          responsable_id: ref.userId,
          cantidad_afectada: 1,
          unidad_medida_evento: 'UNIDAD',
          destino_tipo: 'PLANTACION_CAMPANIA',
          destino_referencia: `[${tag}] manual invalido`,
          origen_despacho: 'MANUAL',
          saldo_vivo_antes: 10,
          saldo_vivo_despues: 9,
        });
      expect(manualHaciaCampania.error?.message ?? '').toMatch(
        /origen_despacho_consistency|check/i,
      );

      // Y la RPC de despacho manual tambien lo rechaza con mensaje claro.
      const rpcManual = await client.rpc('fn_vivero_registrar_despacho', {
        p_lote_id: created.loteId,
        p_fecha_evento: hoy(),
        p_responsable_id: ref.userId,
        p_cantidad_despachada: 1,
        p_destino_tipo: 'PLANTACION_CAMPANIA',
        p_destino_referencia: `[${tag}]`,
        p_evidencia_ids: [created.evidenciaIds[1]],
      });
      expect(rpcManual.error?.message ?? '').toMatch(/PLANTACION_CAMPANIA/);
    } finally {
      await cleanup(client, created);
    }
  }, 30000);

  // -------------------------------------------------------------------
  // RN-VIV-48: devolucion fisica parcial y total
  // -------------------------------------------------------------------
  it('devolucion fisica parcial y total: sube el saldo del lote y registra eventos', async () => {
    const tag = `qa_devolucion_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, true, 3));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      const asignacion = unwrapRpcRow(
        await client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 10,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [created.evidenciaIds[1]],
        }),
        'asignar para devolver',
      ) as AsignacionRpcRow;
      created.asignacionIds.push(asignacion.asignacion_id);

      // Parcial: devuelve 4 de 10.
      const parcial = unwrapRpcRow(
        await client.rpc('fn_m3_devolver_asignacion_vivero', {
          p_asignacion_id: asignacion.asignacion_id,
          p_cantidad_devuelta: 4,
          p_motivo_devolucion: 'SOBRANTE_OPERATIVO',
          p_usuario_devolucion_id: ref.userId,
          p_fecha_devolucion: hoy(),
        }),
        'devolucion parcial',
      ) as {
        estado_asignacion: string;
        saldo_vivo_antes: number;
        saldo_vivo_despues: number;
        evento_lote_vivero_id: number;
        evento_plantacion_id: number;
      };

      expect(parcial.estado_asignacion).toBe('ACTIVA');
      expect(parcial.saldo_vivo_antes).toBe(10);
      expect(parcial.saldo_vivo_despues).toBe(14);

      const eventoM2 = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('tipo_evento, asignacion_id, subcampania_id, cantidad_afectada, origen_despacho, registro_plantacion_id')
          .eq('id', parcial.evento_lote_vivero_id)
          .single(),
        'evento M2 de devolucion',
      );
      expect(eventoM2.tipo_evento).toBe('DEVOLUCION_PLANTACION');
      expect(eventoM2.asignacion_id).toBe(asignacion.asignacion_id);
      expect(eventoM2.origen_despacho).toBeNull();
      expect(eventoM2.cantidad_afectada).toBe(4);

      const eventoM3 = unwrap(
        await client
          .from('evento_plantacion')
          .select('tipo_evento, cantidad_devuelta, motivo_devolucion')
          .eq('id', parcial.evento_plantacion_id)
          .single(),
        'evento M3 de devolucion',
      );
      expect(eventoM3.tipo_evento).toBe('DEVOLUCION_A_VIVERO');
      expect(eventoM3.cantidad_devuelta).toBe(4);
      expect(eventoM3.motivo_devolucion).toBe('SOBRANTE_OPERATIVO');

      // Exceso: devolver mas que el saldo asignado disponible falla.
      const exceso = await client.rpc('fn_m3_devolver_asignacion_vivero', {
        p_asignacion_id: asignacion.asignacion_id,
        p_cantidad_devuelta: 7,
        p_motivo_devolucion: 'OTRO',
        p_usuario_devolucion_id: ref.userId,
        p_fecha_devolucion: hoy(),
      });
      expect(exceso.error?.message ?? '').toMatch(/excede el saldo asignado/i);

      // Total: devuelve los 6 restantes -> DEVUELTA por trigger.
      const total = unwrapRpcRow(
        await client.rpc('fn_m3_devolver_asignacion_vivero', {
          p_asignacion_id: asignacion.asignacion_id,
          p_cantidad_devuelta: 6,
          p_motivo_devolucion: 'CANCELACION_ACTIVIDAD',
          p_usuario_devolucion_id: ref.userId,
          p_fecha_devolucion: hoy(),
        }),
        'devolucion total',
      ) as { estado_asignacion: string; saldo_vivo_despues: number };

      expect(total.estado_asignacion).toBe('DEVUELTA');
      expect(total.saldo_vivo_despues).toBe(20);

      // Devolver de una asignacion DEVUELTA falla.
      const yaDevuelta = await client.rpc('fn_m3_devolver_asignacion_vivero', {
        p_asignacion_id: asignacion.asignacion_id,
        p_cantidad_devuelta: 1,
        p_motivo_devolucion: 'OTRO',
        p_usuario_devolucion_id: ref.userId,
        p_fecha_devolucion: hoy(),
      });
      expect(yaDevuelta.error?.message ?? '').toMatch(/DEVUELTA/);
    } finally {
      await cleanup(client, created);
    }
  }, 45000);

  // -------------------------------------------------------------------
  // Contrato 8.1: merma fisica no toca asignaciones
  // -------------------------------------------------------------------
  it('merma M2: nunca modifica asignaciones activas y bloquea si excede el saldo fisico', async () => {
    const tag = `qa_merma_fisica_${Date.now()}`;
    const created = nuevoRegistro();

    try {
      Object.assign(created, await createLote(client, ref, tag, 20, true, 4));
      const sub = await createSubcampaniaActiva(client, ref, tag);
      created.campaniaId = sub.campaniaId;
      created.subcampaniaIds.push(sub.subcampaniaId);

      // Asignacion fisica de 12: el lote queda con 8 fisicas.
      const asignacion = unwrapRpcRow(
        await client.rpc('fn_vivero_asignar_stock_subcampania', {
          p_lote_vivero_id: created.loteId,
          p_subcampania_id: sub.subcampaniaId,
          p_cantidad_asignada: 12,
          p_proposito: 'PLANTACION_INICIAL',
          p_usuario_asignacion_id: ref.userId,
          p_fecha_asignacion: hoy(),
          p_evidencia_ids: [created.evidenciaIds[1]],
        }),
        'asignar antes de merma',
      ) as AsignacionRpcRow;
      created.asignacionIds.push(asignacion.asignacion_id);

      // Con la identidad vieja esto habria "comido" asignaciones (LIFO).
      // Con el contrato fisico, merma de 9 > 8 fisicas simplemente bloquea.
      const mermaExcede = await client.rpc('fn_vivero_registrar_merma', {
        p_lote_id: created.loteId,
        p_fecha_evento: hoy(),
        p_responsable_id: ref.userId,
        p_cantidad_perdida: 9,
        p_causa_merma: 'PLAGA',
        p_evidencia_ids: [created.evidenciaIds[2]],
      });
      expect(mermaExcede.error?.message ?? '').toMatch(/saldo vivo fisico/i);

      // Merma valida de 8: consume el saldo fisico restante.
      const merma = unwrapRpcRow(
        await client.rpc('fn_vivero_registrar_merma', {
          p_lote_id: created.loteId,
          p_fecha_evento: hoy(),
          p_responsable_id: ref.userId,
          p_cantidad_perdida: 8,
          p_causa_merma: 'PLAGA',
          p_evidencia_ids: [created.evidenciaIds[3]],
        }),
        'registrar merma fisica',
      ) as {
        saldo_vivo_antes: number;
        saldo_vivo_despues: number;
        evento_merma_id: number;
      };

      expect(merma.saldo_vivo_antes).toBe(8);
      expect(merma.saldo_vivo_despues).toBe(0);

      // La asignacion entregada queda intacta.
      const asigFinal = unwrap(
        await client
          .from('asignacion_vivero_subcampania')
          .select('estado, cantidad_asignada, cantidad_mermada, saldo_asignado_disponible')
          .eq('id', asignacion.asignacion_id)
          .single(),
        'asignacion tras merma',
      );
      expect(asigFinal.estado).toBe('ACTIVA');
      expect(asigFinal.cantidad_mermada).toBe(0);
      expect(asigFinal.saldo_asignado_disponible).toBe(12);

      // El evento de merma no lleva metadata de afectacion de asignaciones.
      const eventoMerma = unwrap(
        await client
          .from('evento_lote_vivero')
          .select('metadata')
          .eq('id', merma.evento_merma_id)
          .single(),
        'metadata del evento de merma',
      );
      expect(eventoMerma.metadata).toBeNull();
    } finally {
      await cleanup(client, created);
    }
  }, 45000);
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function createCampania(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
) {
  return unwrap(
    await client
      .from('campania')
      .insert({
        nombre: `[${tag}] Campania`,
        descripcion: 'Campania de prueba',
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
        meta_total_arboles: 100,
        codigo_trazabilidad: `SUB-QA-${tag}`,
        created_by: ref.userId,
        updated_by: ref.userId,
      })
      .select('id')
      .single(),
    'crear subcampania activa',
  );

  // El usuario QA actua como COORDINADOR (permiso de asignacion/devolucion).
  unwrap(
    await client
      .from('subcampania_equipo')
      .insert({
        subcampania_id: subcampania.id,
        usuario_id: ref.userId,
        rol: 'COORDINADOR',
      })
      .select('id')
      .single(),
    'agregar coordinador al equipo',
  );

  return { campaniaId: campania.id, subcampaniaId: subcampania.id };
}

async function createLote(
  client: SupabaseClient,
  ref: RefData,
  tag: string,
  cantidad: number,
  conEmbolsado: boolean,
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

  // Las primeras `evidencias` quedan libres para el test; las ultimas
  // (1 o 2) se consumen en INICIO y EMBOLSADO.
  const totalEvidencias = evidencias + (conEmbolsado ? 2 : 1);
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
      p_evidencia_ids: [evidenciaIds[evidencias]],
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
        p_evidencia_ids: [evidenciaIds[evidencias + 1]],
      }),
      'registrar EMBOLSADO',
    );
  }

  // Devuelve TODAS las evidencias (para cleanup); los tests usan los
  // indices 0..evidencias-1, que quedaron libres.
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
  // Orden por FKs: eventos M3 -> eventos M2 (referencian asignacion_id) ->
  // asignaciones -> evidencias -> lote -> recoleccion -> ubicacion -> M3.
  if (created.subcampaniaIds.length > 0) {
    await client
      .from('evento_plantacion')
      .delete()
      .in('subcampania_id', created.subcampaniaIds);
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
  } else if (created.asignacionIds.length > 0) {
    await client
      .from('asignacion_vivero_subcampania')
      .delete()
      .in('id', created.asignacionIds);
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
