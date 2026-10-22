import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionCorreccionesService } from '../application/participacion-correcciones.service';
import { canonicalCommand } from '../comando-canonical';
import { validateRpcReply } from '../comando-recibo';
import { parseRecovery } from '../dto/comandos.dto';
import {
  parseCorrectionHistoryQuery,
  parseCorrectionObservations,
} from '../dto/correcciones.dto';
import { ParticipacionComandosService } from '../participacion-comandos.service';

const command = '4ff8f9bb-4280-463d-95c8-97a3f11f122c';
const operation = 'CORREGIR_OBSERVACIONES_PLANTACION';
const actor = {
  usuario_id: '9007199254740993',
  auth_id: 'synthetic-admin',
  rol: 'ADMIN',
};
const body = {
  comando_id: command,
  revision_esperada: '2',
  motivo: 'Error de texto',
  observaciones: 'Texto correcto',
};
const result = {
  tipo: 'CORRECCION_PLANTACION',
  correccion_id: '5',
  registro_plantacion_id: '43',
  subcampania_id: '11',
  caso: 'OBSERVACIONES',
  revision_anterior: '2',
  revision_nueva: '3',
  revision_grupo_anterior: '7',
  revision_grupo_nueva: '7',
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
    finalizado_en: '2026-10-21T12:00:00Z',
  },
};
const context = {
  registro_plantacion_id: '43',
  subcampania_id: '11',
  campania_id: '2',
  estado_subcampania: 'ACTIVA',
  es_reposicion: false,
  estado_logico: 'VIGENTE',
  revision_registro: '3',
  revision_grupo: '7',
  original: { observaciones: 'Original' },
  efectivo: { observaciones: 'Texto correcto' },
  observaciones_visibles: true,
  capacidades: { corregir_observaciones: true },
};
const observed = '2026-10-21T12:00:00Z';
const history = (correccion_id = '5') => ({
  correccion_id,
  caso: 'OBSERVACIONES',
  actor: {
    usuario_id: actor.usuario_id,
    nombre_snapshot: 'Administración sintética',
  },
  fecha: observed,
  revision_anterior: '2',
  revision_nueva: '3',
  revision_grupo_anterior: '7',
  revision_grupo_nueva: '7',
  motivo: 'Error de texto',
  observaciones_visibles: true,
  antes: { observaciones: 'Original' },
  despues: { observaciones: 'Texto correcto' },
  efectos_consumo: [],
});

describe('INT07 DTO e intención de observaciones', () => {
  it('normaliza NFC/trim, conserva BIGINT e incluye el objeto de ruta en los bytes', () => {
    const parsed = parseCorrectionObservations(
      {
        ...body,
        motivo: '  Correccio\u0301n  real  ',
        observaciones: '  Descripcio\u0301n  correcta  ',
      },
      actor.usuario_id,
    );
    expect(parsed.payload).toEqual({
      registro_plantacion_id: actor.usuario_id,
      revision_esperada: '2',
      motivo: 'Corrección  real',
      observaciones: 'Descripción  correcta',
    });
    const canonical = canonicalCommand(operation, parsed.payload);
    expect(canonical.contenido).toBe(
      '{"motivo":"Corrección  real","observaciones":"Descripción  correcta","registro_plantacion_id":"9007199254740993","revision_esperada":"2"}',
    );
    expect(
      canonicalCommand(operation, {
        ...parsed.payload,
        registro_plantacion_id: '42',
      }).huella,
    ).not.toBe(canonical.huella);
  });
  it('null y texto vacío normalizado tienen la misma intención; omitir la clave se rechaza', () => {
    const parsedNull = parseCorrectionObservations(
      { ...body, observaciones: null },
      '43',
    );
    const parsedBlank = parseCorrectionObservations(
      { ...body, observaciones: ' \t\n ' },
      '43',
    );
    expect(canonicalCommand(operation, parsedNull.payload)).toEqual(
      canonicalCommand(operation, parsedBlank.payload),
    );
    const { observaciones, ...missing } = body;
    expect(observaciones).toBeDefined();
    expect(() => parseCorrectionObservations(missing, '43')).toThrow();
  });
  it.each([
    { actor_id: '1' },
    { registro_plantacion_id: '43' },
    { asignaciones: [] },
    { revision_grupo_esperada: '0' },
    { motivo: 'no' },
    { motivo: 'x'.repeat(1001) },
    { observaciones: 'x'.repeat(2001) },
    { observaciones: false },
    { observaciones: undefined },
    { observaciones: 'Texto\u0000inválido' },
    { observaciones: 'Texto\uD800inválido' },
    { motivo: 'Motivo\u0000inválido' },
    { motivo: 'Motivo\uDC00inválido' },
    { revision_esperada: 2 },
    { revision_esperada: '00' },
    { revision_esperada: '9223372036854775808' },
    { comando_id: command.toUpperCase() },
  ])('rechaza campo adicional o valor fuera de contrato %j', (variation) => {
    expect(() =>
      parseCorrectionObservations({ ...body, ...variation }, '43'),
    ).toThrow(HttpException);
  });
  it('cuenta puntos Unicode y acepta límite normalizado', () => {
    expect(
      parseCorrectionObservations(
        { ...body, observaciones: '🌳'.repeat(2000) },
        '43',
      ).payload.observaciones,
    ).toHaveLength(4000);
    expect(() => parseCorrectionObservations(body, '01')).toThrow();
  });
  it('recupera solo la operación habilitada, sin admitir futuros casos ni actor', () => {
    expect(parseRecovery(command, { operacion: operation }).operacion).toBe(
      operation,
    );
    for (const operacion of [
      'CORREGIR_PARTICIPANTES_PLANTACION',
      'CORREGIR_CANTIDAD_PLANTACION',
      'REVERTIR_REGISTRO_PLANTACION',
      'REVERTIR_BAJA_PLANTACION',
    ])
      expect(() => parseRecovery(command, { operacion })).toThrow();
    expect(() =>
      parseRecovery(command, { operacion: operation, actor_id: '1' }),
    ).toThrow();
  });
  it('historial usa límite20/50 y DTO cerrado', () => {
    expect(parseCorrectionHistoryQuery({})).toEqual({
      limite: 20,
      cursor: null,
    });
    expect(
      parseCorrectionHistoryQuery({ limite: '50', cursor: 'signed' }),
    ).toEqual({ limite: 50, cursor: 'signed' });
    for (const query of [
      { limite: '51' },
      { limite: '01' },
      { limite: 20 },
      { cursor: '' },
      { cursor: 'x'.repeat(1025) },
      { actor_id: '1' },
    ])
      expect(() => parseCorrectionHistoryQuery(query)).toThrow();
  });
});

describe('INT07 recibo mínimo de observaciones', () => {
  it('acepta cambio y SIN_CAMBIOS sin fabricar auditoría o revisión', () => {
    expect(validateRpcReply(receipt, command, operation)).toEqual(receipt);
    const unchanged = {
      ...receipt,
      body: {
        ...receipt.body,
        resultado: {
          ...result,
          correccion_id: null,
          revision_nueva: '2',
          cambio: 'SIN_CAMBIOS',
        },
      },
    };
    expect(validateRpcReply(unchanged, command, operation, true)).toEqual(
      unchanged,
    );
  });
  it.each([
    { motivo: 'Texto privado' },
    { observaciones: 'Texto privado' },
    { caso: 'CANTIDAD' },
    { revision_grupo_nueva: '8' },
    { revision_nueva: '4' },
    { correccion_id: null },
    { estado_logico: 'REVERTIDO' },
    { registro_vigente_id: '99' },
    { registro_plantacion_id: 43 },
    { cambio: 'SIN_CAMBIOS' },
  ])(
    'rechaza recibo incompatible o con información privada %j',
    (variation) => {
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
    },
  );
});

describe('INT07 adaptador privado de observaciones y recuperación', () => {
  const rpc = jest.fn();
  const publicClient = jest.fn();
  const supabase = {
    getAdminClient: () => ({ rpc }),
    getClient: publicClient,
  } as unknown as SupabaseService;
  const commands = new ParticipacionComandosService(supabase);
  const service = new ParticipacionCorreccionesService(
    supabase,
    new ConfigService({ JWT_SECRET: 'synthetic-correction-secret' }),
    commands,
  );
  beforeEach(() => {
    rpc.mockReset();
    publicClient.mockReset();
  });

  it('ejecuta RPC fija sin consultar dominio antes del replay y recupera el mismo recibo', async () => {
    rpc.mockResolvedValue({ data: receipt, error: null });
    const parsed = parseCorrectionObservations(body, '43');
    expect(
      await service.corregirObservaciones(actor, command, parsed.payload),
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
    expect(
      await commands.recuperar(
        { ...actor, rol: 'VOLUNTARIO' },
        operation,
        command,
      ),
    ).toEqual(receipt);
    expect(rpc).toHaveBeenLastCalledWith('pa_comando_recuperar', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_operacion: operation,
      p_comando_id: command,
    });
    expect(publicClient).not.toHaveBeenCalled();
  });
  it('error SQL, respuesta inválida y pérdida de respuesta conservan503/MISMA_CLAVE', async () => {
    for (const response of [
      { data: null, error: { code: '40P01', message: 'SQL privado' } },
      {
        data: {
          ...receipt,
          body: {
            ...receipt.body,
            resultado: { ...result, motivo: 'privado' },
          },
        },
        error: null,
      },
    ]) {
      rpc.mockResolvedValue(response);
      await expect(
        service.corregirObservaciones(
          actor,
          command,
          parseCorrectionObservations(body, '43').payload,
        ),
      ).rejects.toMatchObject({
        response: {
          comando_id: command,
          resultado_concluyente: false,
          error: {
            codigo: 'RESULTADO_NO_DETERMINADO',
            reintento: 'MISMA_CLAVE',
          },
        },
      });
    }
    rpc.mockRejectedValue(new Error('respuesta perdida'));
    await expect(
      commands.recuperar(actor, operation, command),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('acepta rechazo durable GET200 y404 inconcluso sin confundirlos', async () => {
    const error = {
      codigo: 'REVISION_OBSOLETA',
      mensaje: 'Revisión obsoleta.',
      campos: [],
      ambitos: [],
      reintento: 'NUEVA_CONFIRMACION',
    };
    rpc.mockResolvedValue({
      data: {
        ...receipt,
        body: { ...receipt.body, estado: 'RECHAZADO', resultado: null, error },
      },
      error: null,
    });
    expect(
      (await commands.recuperar(actor, operation, command)).body.estado,
    ).toBe('RECHAZADO');
    rpc.mockResolvedValue({
      data: {
        http_status: 404,
        body: {
          error: {
            ...error,
            codigo: 'COMANDO_NO_CONFIRMADO',
            reintento: 'MISMA_CLAVE',
          },
          comando_id: command,
          resultado_concluyente: false,
        },
      },
      error: null,
    });
    expect(
      (await commands.recuperar(actor, operation, command)).http_status,
    ).toBe(404);
  });
  it('contexto valida objeto, redacción y forma cerrada', async () => {
    rpc.mockResolvedValue({
      data: { data: context, observado_en: observed },
      error: null,
    });
    expect(await service.contexto(actor, '43')).toEqual({
      data: context,
      observado_en: observed,
    });
    const redacted = {
      ...context,
      original: { observaciones: null },
      efectivo: { observaciones: null },
      observaciones_visibles: false,
      capacidades: { corregir_observaciones: false },
    };
    rpc.mockResolvedValue({
      data: { data: redacted, observado_en: observed },
      error: null,
    });
    expect(
      (await service.contexto({ ...actor, rol: 'VOLUNTARIO' }, '43')).data,
    ).toEqual(redacted);
    for (const variation of [
      { ...redacted, original: { observaciones: 'privado' } },
      { ...context, correo: 'private@example.test' },
      { ...context, registro_plantacion_id: '44' },
    ]) {
      rpc.mockResolvedValue({
        data: { data: variation, observado_en: observed },
        error: null,
      });
      await expect(service.contexto(actor, '43')).rejects.toMatchObject({
        status: 503,
      });
    }
  });
  it('historia descendente devuelve cursor firmado y lo vincula a cuenta, objeto y audiencia', async () => {
    rpc.mockResolvedValueOnce({
      data: { data: [history('5')], observado_en: observed, siguiente_id: '5' },
      error: null,
    });
    const first = await service.historial(actor, '43', {
      limite: 1,
      cursor: null,
    });
    expect(first.siguiente_cursor).toEqual(expect.any(String));
    expect(first).not.toHaveProperty('siguiente_id');
    rpc.mockResolvedValue({
      data: {
        data: [history('4')],
        observado_en: observed,
        siguiente_id: null,
      },
      error: null,
    });
    const second = await service.historial(actor, '43', {
      limite: 1,
      cursor: first.siguiente_cursor,
    });
    expect(second.data[0].correccion_id).toBe('4');
    expect(rpc).toHaveBeenLastCalledWith('pa_correccion_historial_leer', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_registro_plantacion_id: '43',
      p_antes_id: '5',
      p_limite: 1,
    });
    const count = rpc.mock.calls.length;
    for (const [otherActor, registro, cursor] of [
      [{ ...actor, auth_id: 'other-auth' }, '43', first.siguiente_cursor],
      [{ ...actor, usuario_id: '42' }, '43', first.siguiente_cursor],
      [{ ...actor, rol: 'VOLUNTARIO' }, '43', first.siguiente_cursor],
      [actor, '44', first.siguiente_cursor],
      [actor, '43', first.siguiente_cursor + 'x'],
    ] as const)
      await expect(
        service.historial(otherActor, registro, { limite: 1, cursor }),
      ).rejects.toMatchObject({ status: 422 });
    expect(rpc).toHaveBeenCalledTimes(count);
  });
  it('historia rechaza orden/revisión/redacción y cursor de continuidad incompatibles', async () => {
    for (const data of [
      {
        data: [history('4'), history('5')],
        observado_en: observed,
        siguiente_id: null,
      },
      {
        data: [{ ...history(), revision_nueva: '9' }],
        observado_en: observed,
        siguiente_id: null,
      },
      {
        data: [{ ...history(), observaciones_visibles: false }],
        observado_en: observed,
        siguiente_id: null,
      },
      { data: [], observado_en: observed, siguiente_id: '5' },
    ]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(
        service.historial(actor, '43', { limite: 20, cursor: null }),
      ).rejects.toMatchObject({ status: 503 });
    }
  });
  it('solo traduce errores de lectura reconocidos y nunca expone SQL inesperado', async () => {
    const error = {
      codigo: 'RECURSO_NO_VISIBLE',
      mensaje: 'Recurso no disponible.',
      campos: [],
      ambitos: [],
      reintento: 'NO_APLICA',
    };
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT404', details: JSON.stringify(error) },
    });
    await expect(service.contexto(actor, '43')).rejects.toMatchObject({
      status: 404,
      response: { error },
    });
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', details: 'SQL privado' },
    });
    await expect(service.contexto(actor, '43')).rejects.toMatchObject({
      status: 503,
      response: { error: { codigo: 'RESULTADO_NO_DETERMINADO' } },
    });
  });
});
