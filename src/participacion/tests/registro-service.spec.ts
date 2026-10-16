import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionRegistroService } from '../application/participacion-registro.service';

const actor = {
  usuario_id: '9007199254740993',
  auth_id: 'sintetico',
  rol: 'VOLUNTARIO',
};
const observed = '2026-10-15T12:00:00Z';
const context = {
  subcampania: {
    id: '11',
    campania_id: '1',
    nombre: 'Ensayo',
    campania_nombre: 'Campaña sintética',
    estado: 'ACTIVA',
    plan_revision: '2',
    meta_total_arboles: 5,
    poligono: {
      type: 'Polygon',
      coordinates: [
        [
          [-68, -16],
          [-67, -16],
          [-67, -15],
          [-68, -16],
        ],
      ],
    },
  },
  actor: { usuario_id: actor.usuario_id, fuente_autoridad: 'CONTEXTUAL' },
  disponibilidad: 'SIN_STOCK',
  especies: [
    {
      planta_id: '8',
      nombre: 'Sintética',
      porcentaje_objetivo: 100,
      cantidad_objetivo: 5,
      saldo_elegible: 0,
    },
  ],
  reglas: {
    hoy_operativo: '2026-10-15',
    fecha_minima_ventana: '2026-10-05',
    fecha_maxima: '2026-10-15',
    zona_horaria: 'America/La_Paz',
    ventana_retroactiva_dias: 10,
    fotos_min: 1,
    fotos_max: 10,
    exterior_permitido: true,
  },
};
describe('Proyecciones privadas del registro', () => {
  const rpc = jest.fn();
  const publicClient = jest.fn();
  const service = new ParticipacionRegistroService(
    {
      getAdminClient: () => ({ rpc }),
      getClient: publicClient,
    } as unknown as SupabaseService,
    { get: () => 'clave-sintetica' } as unknown as ConfigService,
  );
  beforeEach(() => {
    rpc.mockReset();
    publicClient.mockReset();
  });
  it('saldo cero es contexto válido y conserva BIGINT/actor verificado sin fallback público', async () => {
    rpc.mockResolvedValue({
      data: { data: context, observado_en: observed },
      error: null,
    });
    expect(await service.contexto(actor, '11')).toEqual({
      data: context,
      observado_en: observed,
    });
    expect(rpc).toHaveBeenCalledWith('pa_registro_contexto_leer', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_subcampania_id: '11',
    });
    expect(publicClient).not.toHaveBeenCalled();
  });
  it.each([
    {
      data: {
        data: { ...context, asignaciones: [{ id: '2' }] },
        observado_en: observed,
      },
      error: null,
    },
    {
      data: {
        data: {
          ...context,
          actor: { usuario_id: '1', fuente_autoridad: 'GLOBAL' },
        },
        observado_en: observed,
      },
      error: null,
    },
    { data: null, error: { code: '55P03', details: 'sensitive SQL password' } },
  ])(
    'respuesta incompatible o timeout no filtra datos ni inventa terminal',
    async (result) => {
      rpc.mockResolvedValue(result);
      try {
        await service.contexto(actor, '11');
        throw new Error('No rechazó');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse();
        expect(response).toMatchObject({
          error: { codigo: 'RESULTADO_NO_DETERMINADO' },
          resultado_concluyente: false,
        });
        expect(JSON.stringify(response)).not.toMatch(
          /sensitive|asignaciones|password/,
        );
      }
    },
  );
  it('error estable de lectura conserva HTTP y código sin presentar rechazo durable', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PT409',
        message: 'SUBCAMPANIA_NO_OPERATIVA',
        details: JSON.stringify({
          codigo: 'SUBCAMPANIA_NO_OPERATIVA',
          mensaje: 'La subcampaña no está operativa.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        }),
      },
    });
    await expect(service.contexto(actor, '11')).rejects.toMatchObject({
      status: 409,
      response: {
        error: { codigo: 'SUBCAMPANIA_NO_OPERATIVA' },
        resultado_concluyente: false,
      },
    });
  });
  it('cursor firmado queda ligado al actor, ámbito y consulta', async () => {
    rpc.mockResolvedValue({
      data: {
        data: [
          { usuario_id: '2', nombre: 'Ana', organizacion: null },
          { usuario_id: '10', nombre: 'Beto', organizacion: null },
        ],
        observado_en: observed,
      },
      error: null,
    });
    const first = await service.participantes(actor, '11', {
      q: null,
      cursor: null,
      limite: 1,
    });
    expect(first.data).toHaveLength(1);
    expect(first.siguiente_cursor).toBeTruthy();
    await expect(
      service.participantes({ ...actor, usuario_id: '1' }, '11', {
        q: null,
        cursor: first.siguiente_cursor,
        limite: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.participantes(actor, '12', {
        q: null,
        cursor: first.siguiente_cursor,
        limite: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
