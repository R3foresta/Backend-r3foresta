import { SupabaseService } from '../../supabase/supabase.service';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroEvidenciasService } from '../application/vivero-evidencias.service';
import { ViveroSaldosService } from '../application/vivero-saldos.service';
import { ViveroAdaptabilidadService } from '../application/vivero-adaptabilidad.service';
import { ViveroMermaService } from '../application/vivero-merma.service';
import { ViveroDespachoService } from '../application/vivero-despacho.service';
import { ViveroAsignacionesService } from '../application/vivero-asignaciones.service';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { CrearAsignacionDto } from '../api/dto/crear-asignacion.dto';
import { DevolverAsignacionDto } from '../api/dto/devolver-asignacion.dto';

const lote = '9007199254740993';
const evento = '9007199254740995';
const asignacion = '9007199254740997';
const foto = '9007199254740999';
const subcampania = '9007199254741001';
const actor = '9007199254741003';

function fixture(row: Record<string, unknown>) {
  const rpc = jest.fn(() => {
    const result = Promise.resolve({ data: row, error: null });
    return Object.assign(result, { single: () => result });
  });
  const from = jest.fn((table: string) => {
    const value =
      table === 'lote_vivero'
        ? { id: lote, estado_lote: 'ACTIVO', planta_id: '1' }
        : table === 'subcampania'
          ? {
              id: subcampania,
              nombre: 'Subcampaña sintética',
              estado: 'ACTIVA',
            }
          : {
              id: asignacion,
              lote_vivero_id: lote,
              estado: 'ACTIVA',
              cantidad_asignada: 60,
              cantidad_consumida: 45,
            };
    const builder: any = {};
    for (const method of ['select', 'eq', 'is'])
      builder[method] = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: value, error: null }));
    return builder;
  });
  const supabase = {
    getAdminClient: () => ({ rpc, from }),
  } as unknown as SupabaseService;
  const auth = {
    getUserByAuthId: async () => ({
      id: actor,
      rol: 'GENERAL',
      nombre: 'Actor sintético',
    }),
    assertLote: async () => undefined,
  } as unknown as ViveroAuthService;
  const saldos = {
    leerSaldoFisico: async () => 100,
    assertCantidadNoExcedeSaldoFisico: () => undefined,
  } as unknown as ViveroSaldosService;
  return { rpc, from, supabase, auth, saldos };
}

describe('T5: continuidad con IDs exactos después del transporte', () => {
  const base = {
    lote_vivero_id: lote,
    codigo_trazabilidad: 'INC-SINTETICO',
    evidencia_ids_vinculadas: [foto],
    saldo_vivo_antes: 100,
    saldo_vivo_despues: 90,
  };

  it('adaptabilidad conserva lote, evento y fotos grandes usando wrapper privado', async () => {
    const f = fixture({
      ...base,
      evento_adaptabilidad_id: evento,
      subetapa_destino: 'SOL_DIRECTO',
      saldo_vivo_actual: 100,
    });
    const service = new ViveroAdaptabilidadService(
      f.supabase,
      f.auth,
      {} as ViveroEvidenciasService,
    );
    const result = await service.registrar(
      lote,
      {
        fecha_evento: '2026-11-13',
        subetapa_destino: 'SOL_DIRECTO',
        evidencia_ids: [foto],
      } as RegistrarAdaptabilidadDto,
      'auth',
    );
    expect(result.data).toMatchObject({
      lote_vivero_id: lote,
      evento_adaptabilidad_id: evento,
      evidencia_ids_vinculadas: [foto],
    });
    expect(f.rpc.mock.calls[0][0]).toBe(
      'fn_vivero_registrar_adaptabilidad_exacto',
    );
  });

  it('merma y despacho devuelven el hecho confirmado sin redondear sus IDs', async () => {
    const m = fixture({
      ...base,
      evento_merma_id: evento,
      cantidad_perdida: 10,
    });
    const merma = new ViveroMermaService(
      m.supabase,
      m.auth,
      {} as ViveroEvidenciasService,
    );
    expect(
      (
        await merma.registrar(
          lote,
          {
            fecha_evento: '2026-11-13',
            cantidad_afectada: 10,
            causa_merma: 'OTRO',
            evidencia_ids: [foto],
          } as RegistrarMermaDto,
          'auth',
        )
      ).data,
    ).toMatchObject({
      lote_vivero_id: lote,
      evento_merma_id: evento,
      evidencia_ids_vinculadas: [foto],
    });
    const d = fixture({
      ...base,
      evento_despacho_id: evento,
      cantidad_despachada: 10,
      destino_tipo: 'OTRO',
      comunidad_destino_id: subcampania,
    });
    const despacho = new ViveroDespachoService(
      d.supabase,
      d.auth,
      {} as ViveroEvidenciasService,
      d.saldos,
    );
    expect(
      (
        await despacho.registrar(
          lote,
          {
            fecha_evento: '2026-11-13',
            cantidad_afectada: 10,
            destino_tipo: 'OTRO',
            destino_referencia: 'Salida sintética',
            evidencia_ids: [foto],
          } as RegistrarDespachoDto,
          'auth',
        )
      ).data,
    ).toMatchObject({
      lote_vivero_id: lote,
      evento_despacho_id: evento,
      comunidad_destino_id: subcampania,
      evidencia_ids_vinculadas: [foto],
    });
  });

  it('no presenta como rechazo de negocio un ID inexacto tras confirmar una mutación', async () => {
    const f = fixture({
      ...base,
      evento_merma_id: Number(evento),
      cantidad_perdida: 10,
    });
    const merma = new ViveroMermaService(
      f.supabase,
      f.auth,
      {} as ViveroEvidenciasService,
    );
    await expect(
      merma.registrar(
        lote,
        {
          fecha_evento: '2026-11-13',
          cantidad_afectada: 10,
          causa_merma: 'OTRO',
          evidencia_ids: [foto],
        } as RegistrarMermaDto,
        'auth',
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          resultado_concluyente: false,
        },
      },
    });
  });

  it('stock por especie no fusiona IDs distintos que colisionarían al convertir a Number', async () => {
    const rows = [
      {
        id: '9007199254740992',
        planta_id: '9007199254740996',
        codigo_trazabilidad: 'INC-A',
        saldo_vivo_actual: 25,
        estado_lote: 'ACTIVO',
        planta: {
          id: '9007199254740996',
          especie: 'A',
          nombre_cientifico: 'A',
          nombre_comun_principal: 'A',
        },
      },
      {
        id: '9007199254740993',
        planta_id: '9007199254740997',
        codigo_trazabilidad: 'INC-B',
        saldo_vivo_actual: 30,
        estado_lote: 'ACTIVO',
        planta: {
          id: '9007199254740997',
          especie: 'B',
          nombre_cientifico: 'B',
          nombre_comun_principal: 'B',
        },
      },
    ];
    const selections: string[] = [];
    const from = (table: string) => {
      const data =
        table === 'lote_vivero'
          ? rows
          : rows.map((r, i) => ({
              lote_id: r.id,
              saldo_vivo_actual: r.saldo_vivo_actual,
              saldo_asignado_subcampanias: i + 6,
            }));
      const builder: any = {};
      builder.select = (columns: string) => {
        selections.push(columns);
        return builder;
      };
      for (const method of ['eq', 'not', 'gt', 'in', 'order'])
        builder[method] = () => builder;
      builder.then = (
        yes: (result: unknown) => unknown,
        no: (error: unknown) => unknown,
      ) => Promise.resolve({ data, error: null }).then(yes, no);
      return builder;
    };
    const service = new ViveroSaldosService({
      getAdminClient: () => ({ from }),
    } as unknown as SupabaseService);
    const result = await service.listarStockDisponiblePorEspecie();
    expect(result.data).toHaveLength(2);
    expect(
      result.data.map((r) => [
        r.planta_id,
        r.lotes[0].lote_id,
        r.saldo_vivo_actual_total,
        r.saldo_asignado_subcampanias_total,
      ]),
    ).toEqual([
      ['9007199254740996', '9007199254740992', 25, 6],
      ['9007199254740997', '9007199254740993', 30, 7],
    ]);
    expect(selections[0]).toContain('planta_id::text');
    expect(selections[0]).toContain('planta:planta_id(id::text');
    expect(selections[1]).toContain('lote_id::text');
  });

  it('asignación y devolución conservan el mismo lote físico e identidad exacta', async () => {
    const f = fixture({
      ...base,
      asignacion_id: asignacion,
      evento_lote_vivero_id: evento,
      evento_plantacion_id: foto,
      subcampania_id: subcampania,
      campania_id: subcampania,
      cantidad_asignada: 60,
      cantidad_devuelta_delta: 15,
      cantidad_devuelta_total: 15,
      saldo_asignado_disponible: 0,
    });
    const service = new ViveroAsignacionesService(f.supabase, f.auth);
    expect(
      (
        await service.crearAsignacion(
          lote,
          {
            subcampania_id: subcampania,
            proposito: 'PLANTACION_INICIAL',
            fecha_asignacion: '2026-11-13',
            cantidad_asignada: 60,
            evidencia_ids: [foto],
          } as CrearAsignacionDto,
          'auth',
        )
      ).data,
    ).toMatchObject({
      lote_vivero_id: lote,
      asignacion_id: asignacion,
      evento_lote_vivero_id: evento,
      evento_plantacion_id: foto,
      subcampania_id: subcampania,
      evidencia_ids_vinculadas: [foto],
    });
    expect(
      (
        await service.devolverAsignacion(
          lote,
          asignacion,
          {
            cantidad_devuelta: 15,
            fecha_devolucion: '2026-11-13',
            motivo_devolucion: 'SOBRANTE_OPERATIVO',
          } as DevolverAsignacionDto,
          'auth',
        )
      ).data,
    ).toMatchObject({
      lote_vivero_id: lote,
      asignacion_id: asignacion,
      evento_lote_vivero_id: evento,
      evento_plantacion_id: foto,
    });
  });
});
