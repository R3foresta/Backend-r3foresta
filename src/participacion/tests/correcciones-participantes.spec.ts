import { HttpException, type ArgumentsHost } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionCorreccionesService } from '../application/participacion-correcciones.service';
import { canonicalCommand } from '../comando-canonical';
import { validateRpcReply } from '../comando-recibo';
import { parseRecovery } from '../dto/comandos.dto';
import {
  parseCorrectionParticipants,
  parseHistoricalParticipantsQuery,
} from '../dto/correcciones.dto';
import {
  correctionContext,
  correctionHistory,
  correctionParticipant,
  ownCorrectionHistory,
  ownCorrectionState,
  publicCorrectionState,
} from '../domain/policies/correcciones-proyeccion.policy';
import { ParticipacionComandosService } from '../participacion-comandos.service';
import { ParticipacionEstadoPublicoController } from '../participacion-correcciones.controller';
import { ParticipacionPublicExceptionFilter } from '../participacion-exception.filter';

const command = '4ff8f9bb-4280-463d-95c8-97a3f11f122c';
const operation = 'CORREGIR_PARTICIPANTES_PLANTACION';
const actor = {
  usuario_id: '9007199254740993',
  auth_id: 'synthetic-participant',
  rol: 'VOLUNTARIO',
};
const observed = '2026-10-22T12:00:00Z';
const originalPerson = (usuario_id: string, es_responsable = false) => ({
  usuario_id,
  nombre_snapshot: 'Nombre histórico sintético',
  afiliacion_snapshot: 'Organización histórica sintética',
  afiliacion_estado: 'DECLARADA',
  afiliacion_tipo: 'ORGANIZACION_REGISTRADA',
  organizacion_id_snapshot: '12',
  es_responsable,
  procedencia: 'ORIGINAL',
  capturado_en: null,
  nombre_capturado_correccion: null,
});
const owner = originalPerson('801', true);
const addedPerson = (usuario_id = actor.usuario_id) => ({
  usuario_id,
  nombre_snapshot: null,
  afiliacion_snapshot: null,
  afiliacion_estado: 'HISTORICA_NO_DISPONIBLE',
  afiliacion_tipo: null,
  organizacion_id_snapshot: null,
  es_responsable: false,
  procedencia: 'ALTA_CORRECCION',
  capturado_en: observed,
  nombre_capturado_correccion: 'Nombre capturado al corregir',
});
const body = {
  comando_id: command,
  revision_esperada: '1',
  motivo: 'Lista histórica errónea',
  coresponsable_ids: ['2', '10', actor.usuario_id],
};
const result = {
  tipo: 'CORRECCION_PLANTACION',
  correccion_id: '5',
  registro_plantacion_id: '43',
  subcampania_id: '11',
  caso: 'PARTICIPANTES',
  revision_anterior: '1',
  revision_nueva: '2',
  revision_grupo_anterior: '0',
  revision_grupo_nueva: '0',
  cambio: 'CAMBIO_APLICADO',
  estado_logico: 'VIGENTE',
  registro_vigente_id: null,
};
const receipt = {
  http_status: 200,
  body: {
    comando_id: command,
    operacion: operation,
    estado: 'CONFIRMADO',
    resultado: result,
    error: null,
    finalizado_en: observed,
  },
};
const ownState = (record = '43') => ({
  registro_plantacion_id: record,
  codigo_trazabilidad: 'SINTETICO-' + record,
  subcampania_id: '11',
  es_reposicion: false,
  registro_plantacion_origen_id: null,
  estado_logico: 'VIGENTE',
  tiene_correcciones: true,
  revision_registro: '2',
  revision_grupo: '0',
  relaciones: ['PARTICIPANTE'],
  cantidad_original: 10,
  cantidad_efectiva: 10,
  especies_originales: [{ planta_id: '2', cantidad: 10 }],
  especies_efectivas: [{ planta_id: '2', cantidad: 10 }],
  participantes: [owner, addedPerson()],
  registro_vigente_id: null,
  url_detalle_efectivo: '/api/v1/plantaciones/' + record + '/detalle-propio',
});
const history = (correccion_id = '5') => ({
  correccion_id,
  caso: 'PARTICIPANTES',
  actor: { usuario_id: '800', nombre_snapshot: 'Corrector sintético' },
  fecha: observed,
  revision_anterior: '1',
  revision_nueva: '2',
  revision_grupo_anterior: '0',
  revision_grupo_nueva: '0',
  motivo: body.motivo,
  antes: { participantes: [owner] },
  despues: { participantes: [owner, addedPerson()] },
  efectos_consumo: [],
});
const ownHistory = (correccion_id = '5') => ({
  correccion_id,
  caso: 'PARTICIPANTES',
  actor: { usuario_id: '800', nombre_snapshot: 'Corrector sintético' },
  fecha: observed,
  revision_anterior: '1',
  revision_nueva: '2',
});
const publicState = {
  registro_plantacion_id: '43',
  estado_logico: 'VIGENTE',
  tiene_correcciones: true,
  url_detalle_efectivo: '/api/v1/impact/registros/43',
  registro_vigente: null,
};

describe('INT07 entrada y recibo de participantes', () => {
  it('canoniza el set completo numéricamente y conserva BIGINT, motivo y objeto', () => {
    const parsed = parseCorrectionParticipants(
      {
        ...body,
        coresponsable_ids: [actor.usuario_id, '10', '2'],
        motivo: '  Lista histo\u0301rica  errónea  ',
      },
      '43',
    );
    expect(parsed.payload.coresponsable_ids).toEqual([
      '2',
      '10',
      actor.usuario_id,
    ]);
    expect(parsed.payload.motivo).toBe('Lista histórica  errónea');
    const other = parseCorrectionParticipants(
      { ...body, motivo: 'Lista histórica  errónea' },
      '43',
    );
    expect(canonicalCommand(operation, parsed.payload)).toEqual(
      canonicalCommand(operation, other.payload),
    );
    expect(canonicalCommand(operation, parsed.payload).contenido).toBe(
      '{"coresponsable_ids":["2","10","9007199254740993"],"motivo":"Lista histórica  errónea","registro_plantacion_id":"43","revision_esperada":"1"}',
    );
    expect(
      parseCorrectionParticipants({ ...body, coresponsable_ids: [] }, '43')
        .payload.coresponsable_ids,
    ).toEqual([]);
  });
  it.each([
    { coresponsable_ids: ['2', '2'] },
    { coresponsable_ids: ['01'] },
    { coresponsable_ids: [2] },
    { coresponsable_ids: undefined },
    { coresponsable_ids: Array.from({ length: 101 }, (_, i) => String(i + 1)) },
    { coresponsable_ids: ['9223372036854775808'] },
    { actor_id: '1' },
    { responsable_id: '2' },
    { afiliaciones: [] },
    { registro_plantacion_id: '43' },
    { observaciones: null },
    { motivo: '  ' },
    { motivo: 'x'.repeat(1001) },
    { motivo: 'Texto\u0000inválido' },
    { revision_esperada: 1 },
  ])(
    'rechaza set/forma fuera del contrato sin consultar el dominio %j',
    (variation) => {
      expect(() =>
        parseCorrectionParticipants({ ...body, ...variation }, '43'),
      ).toThrow(HttpException);
    },
  );
  it('habilita recuperación propia y valida caso/op, revisión, grupo y recibo sin listas', () => {
    expect(parseRecovery(command, { operacion: operation }).operacion).toBe(
      operation,
    );
    expect(validateRpcReply(receipt, command, operation)).toEqual(receipt);
    const unchanged = {
      ...receipt,
      body: {
        ...receipt.body,
        resultado: {
          ...result,
          correccion_id: null,
          cambio: 'SIN_CAMBIOS',
          revision_nueva: '1',
        },
      },
    };
    expect(validateRpcReply(unchanged, command, operation, true)).toEqual(
      unchanged,
    );
    for (const variation of [
      { caso: 'OBSERVACIONES' },
      { participantes: [] },
      { coresponsable_ids: [] },
      { motivo: 'privado' },
      { revision_grupo_nueva: '1' },
      { revision_nueva: '3' },
    ])
      expect(() =>
        validateRpcReply(
          {
            ...receipt,
            body: { ...receipt.body, resultado: { ...result, ...variation } },
          },
          command,
          operation,
        ),
      ).toThrow();
  });
  it('selector exige consulta acotada; distingue ID exacto y nombre literal', () => {
    expect(parseHistoricalParticipantsQuery({ q: '1' })).toEqual({
      modo: 'ID',
      consulta: '1',
      cursor: null,
      limite: 20,
    });
    expect(
      parseHistoricalParticipantsQuery({
        q: '  Histo\u0301rico_%  ',
        limite: '50',
      }),
    ).toEqual({
      modo: 'NOMBRE',
      consulta: 'Histórico_%',
      limite: 50,
      cursor: null,
    });
    expect(
      parseHistoricalParticipantsQuery({ q: actor.usuario_id }).consulta,
    ).toBe(actor.usuario_id);
    for (const query of [
      {},
      { q: '' },
      { q: 'ab' },
      { q: '01' },
      { q: '0' },
      { q: '9223372036854775808' },
      { q: 'x'.repeat(101) },
      { q: 'Texto\u0000nulo' },
      { q: 'abc', correo: 'private@example.test' },
      { q: 'abc', limite: '51' },
    ])
      expect(() => parseHistoricalParticipantsQuery(query)).toThrow();
  });
});

describe('INT07 snapshots y proyecciones por audiencia', () => {
  it('distingue incorporación actual de nombre histórico y conserva procedencia al restaurar', () => {
    expect(correctionParticipant(addedPerson())).toEqual(addedPerson());
    expect(
      correctionParticipant({ ...addedPerson(), procedencia: 'RESTAURACION' }),
    ).toMatchObject({ capturado_en: observed, nombre_snapshot: null });
    expect(
      correctionParticipant({
        ...originalPerson('2'),
        procedencia: 'RESTAURACION',
      }),
    ).toMatchObject({ capturado_en: null, nombre_capturado_correccion: null });
    for (const variation of [
      { nombre_snapshot: 'Nombre actual presentado como histórico' },
      { afiliacion_estado: 'NO_DECLARADA' },
      { capturado_en: null },
      { es_responsable: true },
      { correo: 'private@example.test' },
    ])
      expect(() =>
        correctionParticipant({ ...addedPerson(), ...variation }),
      ).toThrow();
  });
  it('contexto conserva responsable, muestra ambas listas y redacta solo observaciones centrales', () => {
    const context = {
      registro_plantacion_id: '43',
      subcampania_id: '11',
      campania_id: '1',
      es_reposicion: false,
      estado_subcampania: 'ACTIVA',
      estado_logico: 'VIGENTE',
      revision_registro: '2',
      revision_grupo: '0',
      original: { observaciones: null, participantes: [owner] },
      efectivo: { observaciones: null, participantes: [owner, addedPerson()] },
      observaciones_visibles: false,
      capacidades: {
        corregir_observaciones: false,
        corregir_participantes: true,
      },
    };
    expect(correctionContext(context, '43')).toEqual(context);
    expect(() =>
      correctionContext({ ...context, estado_subcampania: 'COMPLETADA' }, '43'),
    ).toThrow();
    expect(() =>
      correctionContext(
        {
          ...context,
          original: { ...context.original, observaciones: 'Privado' },
        },
        '43',
      ),
    ).toThrow();
    expect(() =>
      correctionContext(
        {
          ...context,
          efectivo: {
            ...context.efectivo,
            participantes: [originalPerson('802', true)],
          },
        },
        '43',
      ),
    ).toThrow();
  });
  it('auditoría de participantes incluye motivo y listas; historia propia solo resume', () => {
    expect(correctionHistory(history())).toEqual(history());
    expect(ownCorrectionHistory(ownHistory())).toEqual(ownHistory());
    expect(() => correctionHistory({ ...history(), motivo: null })).toThrow();
    expect(() =>
      correctionHistory({ ...history(), observaciones_visibles: false }),
    ).toThrow();
    expect(() =>
      ownCorrectionHistory({ ...ownHistory(), motivo: 'Privado' }),
    ).toThrow();
    expect(() =>
      ownCorrectionHistory({ ...ownHistory(), antes: history().antes }),
    ).toThrow();
    expect(() =>
      correctionHistory({
        ...history(),
        despues: { participantes: [originalPerson('802', true)] },
      }),
    ).toThrow();
  });
  it('estado propio exige relación efectiva, snapshots seguros y totales coherentes', () => {
    expect(ownCorrectionState(ownState(), actor.usuario_id, '43')).toEqual(
      ownState(),
    );
    expect(
      ownCorrectionState(
        { ...ownState(), relaciones: ['AUTOR', 'PARTICIPANTE'] },
        '801',
        '43',
      ),
    ).toBeDefined();
    for (const variation of [
      { participantes: [owner] },
      { relaciones: ['AUTOR'] },
      { relaciones: ['PARTICIPANTE', 'PARTICIPANTE'] },
      { cantidad_efectiva: 11 },
      { especies_efectivas: [{ planta_id: '3', cantidad: 10 }] },
      { url_detalle_efectivo: 'https://untrusted.example.test/private' },
      { motivo: 'Privado' },
      {
        participantes: [
          owner,
          {
            ...addedPerson(),
            nombre_snapshot: 'Nombre actual falso histórico',
          },
        ],
      },
    ])
      expect(() =>
        ownCorrectionState({ ...ownState(), ...variation }, actor.usuario_id),
      ).toThrow();
    expect(() => ownCorrectionState(ownState(), '999')).toThrow();
  });
  it('señal pública es mínima y no admite motivos, actores o enlaces arbitrarios', () => {
    expect(publicCorrectionState(publicState, '43')).toEqual(publicState);
    for (const variation of [
      { actor: { usuario_id: '800' } },
      { participantes: [owner] },
      { motivo: 'Privado' },
      { observaciones: 'Privado' },
      { url_detalle_efectivo: 'https://untrusted.example.test' },
      { registro_plantacion_id: '44' },
    ])
      expect(() =>
        publicCorrectionState({ ...publicState, ...variation }, '43'),
      ).toThrow();
  });
});

describe('INT07 servicios y cursores de participantes', () => {
  const rpc = jest.fn();
  const publicClient = jest.fn();
  const supabase = {
    getAdminClient: () => ({ rpc }),
    getClient: publicClient,
  } as unknown as SupabaseService;
  const commands = new ParticipacionComandosService(supabase);
  const service = new ParticipacionCorreccionesService(
    supabase,
    new ConfigService({ JWT_SECRET: 'synthetic-participants-secret' }),
    commands,
  );
  beforeEach(() => {
    rpc.mockReset();
    publicClient.mockReset();
  });

  it('envía intención a motor fijo sin consulta previa de elegibilidad y recupera recibo', async () => {
    rpc.mockResolvedValue({ data: receipt, error: null });
    const parsed = parseCorrectionParticipants(body, '43');
    expect(
      await service.corregirParticipantes(actor, command, parsed.payload),
    ).toEqual(receipt);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('pa_correccion_ejecutar', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_operacion: operation,
      p_comando_id: command,
      p_payload: parsed.payload,
      p_contenido_canonico: canonicalCommand(operation, parsed.payload)
        .contenido,
    });
    expect(await commands.recuperar(actor, operation, command)).toEqual(
      receipt,
    );
    expect(publicClient).not.toHaveBeenCalled();
  });
  it('selector pagina ASC con cuentas inactivas y vincula cursor a consulta/modo/actor/objeto', async () => {
    const person = (usuario_id: string) => ({
      usuario_id,
      nombre_actual: null,
      activo: false,
      relacion_historica: 'RETIRADO',
    });
    const query = parseHistoricalParticipantsQuery({
      q: 'Histórico',
      limite: '1',
    });
    rpc.mockResolvedValueOnce({
      data: { data: [person('2')], observado_en: observed, siguiente_id: '2' },
      error: null,
    });
    const first = await service.participantesHistoricos(actor, '43', query);
    expect(first.data[0]).toEqual(person('2'));
    rpc.mockResolvedValue({
      data: {
        data: [person('10')],
        observado_en: observed,
        siguiente_id: null,
      },
      error: null,
    });
    expect(
      (
        await service.participantesHistoricos(actor, '43', {
          ...query,
          cursor: first.siguiente_cursor,
        })
      ).data[0].usuario_id,
    ).toBe('10');
    expect(rpc).toHaveBeenLastCalledWith(
      'pa_correccion_participantes_historicos_leer',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_registro_plantacion_id: '43',
        p_modo: 'NOMBRE',
        p_consulta: 'Histórico',
        p_despues_id: '2',
        p_limite: 1,
      },
    );
    const calls = rpc.mock.calls.length;
    for (const [nextActor, record, variation] of [
      [actor, '43', { consulta: 'Distinto' }],
      [actor, '43', { modo: 'ID' as const, consulta: '1' }],
      [{ ...actor, auth_id: 'other-auth' }, '43', {}],
      [{ ...actor, usuario_id: '2' }, '43', {}],
      [actor, '44', {}],
    ])
      await expect(
        service.participantesHistoricos(
          nextActor as typeof actor,
          record as string,
          {
            ...query,
            cursor: first.siguiente_cursor,
            ...(variation as object),
          },
        ),
      ).rejects.toMatchObject({ status: 422 });
    expect(rpc).toHaveBeenCalledTimes(calls);
  });
  it('selector exacto no acepta otro ID ni campos de perfil del RPC', async () => {
    for (const value of [
      {
        usuario_id: '2',
        nombre_actual: 'Nombre',
        activo: true,
        relacion_historica: 'PRESENTE',
      },
      {
        usuario_id: '1',
        nombre_actual: 'Nombre',
        activo: true,
        relacion_historica: 'PRESENTE',
        username: 'oculto',
      },
    ]) {
      rpc.mockResolvedValue({
        data: { data: [value], observado_en: observed, siguiente_id: null },
        error: null,
      });
      await expect(
        service.participantesHistoricos(
          actor,
          '43',
          parseHistoricalParticipantsQuery({ q: '1' }),
        ),
      ).rejects.toMatchObject({ status: 503 });
    }
  });
  it('estado propio no usa permisos administrativos como sustituto de relación;404 queda uniforme', async () => {
    rpc.mockResolvedValue({
      data: { data: ownState(), observado_en: observed },
      error: null,
    });
    expect((await service.estadoPropio(actor, '43')).data).toEqual(ownState());
    const error = {
      codigo: 'RECURSO_NO_VISIBLE',
      mensaje: 'El recurso no está disponible.',
      campos: [],
      ambitos: [],
      reintento: 'NO_APLICA',
    };
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT404', details: JSON.stringify(error) },
    });
    await expect(
      service.estadoPropio({ ...actor, rol: 'ADMIN' }, '43'),
    ).rejects.toMatchObject({ status: 404, response: { error } });
    expect(publicClient).not.toHaveBeenCalled();
  });
  it('historia propia y lista de estados tienen cursores separados por objeto/audiencia y revalidan cada página', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        data: [ownHistory('5')],
        observado_en: observed,
        siguiente_id: '5',
      },
      error: null,
    });
    const first = await service.historialPropio(actor, '43', {
      cursor: null,
      limite: 1,
    });
    rpc.mockResolvedValue({
      data: {
        data: [ownHistory('4')],
        observado_en: observed,
        siguiente_id: null,
      },
      error: null,
    });
    // Perder rol global no invalida una lectura propia que conserva relación.
    expect(
      (
        await service.historialPropio({ ...actor, rol: 'ADMIN' }, '43', {
          cursor: first.siguiente_cursor,
          limite: 1,
        })
      ).data[0].correccion_id,
    ).toBe('4');
    await expect(
      service.historial(actor, '43', {
        cursor: first.siguiente_cursor,
        limite: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.historialPropio(actor, '44', {
        cursor: first.siguiente_cursor,
        limite: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.estadosPropios(actor, {
        cursor: first.siguiente_cursor,
        limite: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    rpc.mockResolvedValueOnce({
      data: {
        data: [ownState('43')],
        observado_en: observed,
        siguiente_id: '43',
      },
      error: null,
    });
    const states = await service.estadosPropios(actor, {
      cursor: null,
      limite: 1,
    });
    rpc.mockResolvedValueOnce({
      data: {
        data: [ownState('42')],
        observado_en: observed,
        siguiente_id: null,
      },
      error: null,
    });
    expect(
      (
        await service.estadosPropios(actor, {
          cursor: states.siguiente_cursor,
          limite: 1,
        })
      ).data[0].registro_plantacion_id,
    ).toBe('42');
    expect(rpc).toHaveBeenLastCalledWith('pa_mis_registros_estado_leer', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_antes_id: '43',
      p_limite: 1,
    });
  });
  it('público consulta una única proyección privada sin actor y falla cerrado ante datos adicionales', async () => {
    rpc.mockResolvedValue({
      data: { data: publicState, observado_en: observed },
      error: null,
    });
    expect(await service.estadoPublico('43')).toEqual({
      data: publicState,
      observado_en: observed,
    });
    expect(rpc).toHaveBeenCalledWith('pa_registro_estado_publico_leer', {
      p_registro_plantacion_id: '43',
    });
    rpc.mockResolvedValue({
      data: {
        data: { ...publicState, motivo: 'Privado' },
        observado_en: observed,
      },
      error: null,
    });
    await expect(service.estadoPublico('43')).rejects.toMatchObject({
      status: 503,
    });
    expect(publicClient).not.toHaveBeenCalled();
  });
});

describe('INT07 superficie pública sin cuenta', () => {
  it('no registra guard ni interceptor privado', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        ParticipacionEstadoPublicoController,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        ParticipacionEstadoPublicoController,
      ),
    ).toBeUndefined();
  });
  it('errores públicos conservan envelope yno-store sin VaryAuthorization', () => {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: jest.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ params: {} }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    new ParticipacionPublicExceptionFilter().catch(
      new HttpException('Recurso no visible', 404),
      host,
    );
    expect(headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        comando_id: null,
        resultado_concluyente: false,
        error: expect.objectContaining({ codigo: 'RECURSO_NO_VISIBLE' }),
      }),
    );
  });
});
