import { ConfigService } from '@nestjs/config';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionRegistroService } from '../application/participacion-registro.service';
import { procedenciaPropia } from '../domain/policies/registro-proyeccion.policy';

const actor = {
  usuario_id: '9007199254740993',
  auth_id: 'auth-sintetico-t5',
} as VerifiedActor;
const observed = '2026-11-13T15:00:00.000000Z';
const consumption = {
  detalle_id: '9007199254740994',
  asignacion_id: '9007199254740995',
  lote_vivero_id: '9007199254740996',
  codigo_lote: 'VIV-INC-SINTETICO',
  planta_id: '9007199254740997',
  cantidad: 45,
  nombre_cientifico_snapshot: 'Nombre histórico',
  nombre_comercial_snapshot: 'Nombre comercial histórico',
  variedad_snapshot: 'Variedad histórica',
  origen: {
    tipo: 'INCORPORACION',
    recoleccion_id: null,
    modalidad: 'RECEPCION',
    procedencia: 'DONACION',
  },
};
const data = {
  registro_plantacion_id: '9007199254740998',
  cantidad_total_plantada: 45,
  criterio_atribucion: 'CONSUMOS_PERSISTIDOS',
  consumos: [consumption],
};

describe('T5: procedencia mínima del consumo propio', () => {
  const rpc = jest.fn();
  const service = new ParticipacionRegistroService(
    { getAdminClient: () => ({ rpc }) } as unknown as SupabaseService,
    { get: () => undefined } as unknown as ConfigService,
  );

  beforeEach(() => rpc.mockReset());

  it('lee consumos persistidos con actor verificado e IDs BIGINT exactos', async () => {
    rpc.mockResolvedValue({
      data: { data, observado_en: observed },
      error: null,
    });
    expect(
      await service.procedencia(actor, data.registro_plantacion_id),
    ).toEqual({
      data,
      observado_en: observed,
    });
    expect(rpc).toHaveBeenCalledWith('pa_registro_procedencia_propia_leer', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_registro_id: data.registro_plantacion_id,
    });
  });

  it('conserva separación entre origen M1, compra inicial y donación de misma especie', () => {
    const mixed = {
      ...data,
      cantidad_total_plantada: 51,
      consumos: [
        consumption,
        {
          ...consumption,
          detalle_id: '9007199254740999',
          lote_vivero_id: '9007199254741000',
          cantidad: 4,
          origen: {
            ...consumption.origen,
            modalidad: 'SALDO_INICIAL',
            procedencia: 'COMPRA',
          },
        },
        {
          ...consumption,
          detalle_id: '9007199254741001',
          lote_vivero_id: '9007199254741002',
          cantidad: 2,
          variedad_snapshot: null,
          origen: {
            tipo: 'RECOLECCION',
            recoleccion_id: '9007199254741003',
            modalidad: null,
            procedencia: null,
          },
        },
      ],
    };
    expect(procedenciaPropia(mixed, data.registro_plantacion_id)).toEqual(
      mixed,
    );
  });

  it('conserva ausencia histórica de origen y snapshots sin inventar REC-0', () => {
    const historical = {
      ...data,
      consumos: [
        {
          ...consumption,
          variedad_snapshot: null,
          origen: {
            tipo: 'HISTORICO_SIN_ORIGEN',
            recoleccion_id: null,
            modalidad: null,
            procedencia: null,
          },
        },
      ],
    };
    expect(procedenciaPropia(historical, data.registro_plantacion_id)).toEqual(
      historical,
    );
  });

  it.each([
    { ...data, registro_plantacion_id: '1' },
    { ...data, cantidad_total_plantada: 44 },
    {
      ...data,
      consumos: [consumption, consumption],
      cantidad_total_plantada: 90,
    },
    { ...data, consumos: [{ ...consumption, detalle_id: 9007199254740994 }] },
    { ...data, consumos: [{ ...consumption, tercero_origen: 'PRIVADO' }] },
    { ...data, consumos: [{ ...consumption, evidencia_ids: ['1'] }] },
    {
      ...data,
      consumos: [
        {
          ...consumption,
          origen: { ...consumption.origen, procedencia: 'PRODUCCION_PROPIA' },
        },
      ],
    },
    {
      ...data,
      consumos: [
        {
          ...consumption,
          origen: { ...consumption.origen, recoleccion_id: '1' },
        },
      ],
    },
  ])(
    'rechaza datos incompatibles sin filtrarlos ni recalcular fuentes',
    async (invalid) => {
      rpc.mockResolvedValue({
        data: { data: invalid, observado_en: observed },
        error: null,
      });
      await expect(
        service.procedencia(actor, data.registro_plantacion_id),
      ).rejects.toMatchObject({
        status: 503,
        response: { error: { codigo: 'RESULTADO_NO_DETERMINADO' } },
      });
    },
  );

  it('respeta la denegación de la audiencia propia sin permiso M2 implícito', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PT404',
        details: JSON.stringify({
          codigo: 'RECURSO_NO_VISIBLE',
          mensaje: 'El recurso no está disponible.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        }),
      },
    });
    await expect(
      service.procedencia(actor, data.registro_plantacion_id),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: { codigo: 'RECURSO_NO_VISIBLE' } },
    });
  });
});
