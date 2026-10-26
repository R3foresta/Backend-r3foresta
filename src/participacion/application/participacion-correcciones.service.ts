import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { validateStableError } from '../comando-recibo';
import { id, invalidInput } from '../dto/comandos.dto';
import type {
  CorrectionHistoryQuery,
  CorrectionObservationsPayload,
  CorrectionParticipantsPayload,
  HistoricalParticipantsQuery,
} from '../dto/correcciones.dto';
import {
  correctionContext,
  correctionHistory,
  historicalParticipant,
  ownCorrectionHistory,
  ownCorrectionState,
  publicCorrectionState,
} from '../domain/policies/correcciones-proyeccion.policy';
import {
  check,
  exact,
  instant,
} from '../domain/policies/registro-proyeccion.policy';
import { ParticipacionComandosService } from '../participacion-comandos.service';

@Injectable()
export class ParticipacionCorreccionesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly comandos: ParticipacionComandosService,
  ) {}

  corregirObservaciones(
    actor: VerifiedActor,
    command: string,
    payload: CorrectionObservationsPayload,
  ) {
    // La RPC conserva replay, autorización, overlay, revisión, auditoría y
    // terminal en una transacción; no consultar contexto antes de ejecutarla.
    return this.comandos.corregirObservaciones(actor, command, payload);
  }

  corregirParticipantes(
    actor: VerifiedActor,
    command: string,
    payload: CorrectionParticipantsPayload,
  ) {
    return this.comandos.corregirParticipantes(actor, command, payload);
  }

  private inconcluso(): never {
    throw new HttpException(
      {
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          mensaje: 'No se pudo consultar la corrección.',
          campos: [],
          ambitos: [],
          reintento: 'NO_APLICA',
        },
        comando_id: null,
        resultado_concluyente: false,
      },
      503,
    );
  }

  private async lectura(
    actor: VerifiedActor | null,
    name: string,
    args: Record<string, unknown>,
  ) {
    try {
      const { data, error } = await this.supabase.getAdminClient().rpc(name, {
        ...(actor
          ? { p_actor_id: actor.usuario_id, p_auth_id: actor.auth_id }
          : {}),
        ...args,
      });
      if (error) {
        const allowed: Record<string, string[]> = {
          PT401: ['SESION_INVALIDA'],
          PT403: ['CUENTA_INACTIVA', 'CAPACIDAD_INSUFICIENTE'],
          PT404: ['RECURSO_NO_VISIBLE'],
          PT422: ['ENTRADA_INVALIDA', 'CONTEXTO_INCOMPLETO'],
        };
        let stable: ReturnType<typeof validateStableError> | undefined;
        try {
          const parsed = validateStableError(JSON.parse(error.details ?? ''));
          if (
            allowed[error.code ?? '']?.includes(parsed.codigo) &&
            parsed.campos.length === 0 &&
            parsed.ambitos.length === 0 &&
            ['NO_APLICA', 'RECUPERAR_SESION'].includes(parsed.reintento)
          )
            stable = parsed;
        } catch {
          /* Los fallos SQL inesperados no son errores de negocio. */
        }
        if (stable)
          throw new HttpException(
            { error: stable, comando_id: null, resultado_concluyente: false },
            Number(error.code.slice(2)),
          );
        return this.inconcluso();
      }
      if (data === null) return this.inconcluso();
      return data as unknown;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return this.inconcluso();
    }
  }

  async contexto(actor: VerifiedActor, registro: string) {
    return this.simple(
      actor,
      'pa_correccion_contexto_leer',
      { p_registro_plantacion_id: registro },
      (value) => correctionContext(value, registro),
    );
  }

  private async simple(
    actor: VerifiedActor | null,
    rpc: string,
    args: Record<string, unknown>,
    parse: (value: unknown) => Record<string, unknown>,
  ) {
    const value = await this.lectura(actor, rpc, args);
    try {
      const row = exact(value, ['data', 'observado_en']);
      return { data: parse(row.data), observado_en: instant(row.observado_en) };
    } catch {
      return this.inconcluso();
    }
  }

  private sign(value: string) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret?.trim()) return this.inconcluso();
    return createHmac('sha256', secret).update(value).digest();
  }

  historial(
    actor: VerifiedActor,
    registro: string,
    query: CorrectionHistoryQuery,
  ) {
    // Conservar la identidad opaca del cursor084 para esta misma ruta.
    const context = JSON.stringify([
      1,
      'HISTORIAL_CORRECCIONES_OBSERVACIONES',
      actor.usuario_id,
      actor.auth_id,
      registro,
      actor.rol === 'ADMIN' ? 'GLOBAL' : 'CONTEXTUAL',
    ]);
    return this.pagina(
      actor,
      'pa_correccion_historial_leer',
      { p_registro_plantacion_id: registro },
      query,
      context,
      'DESC',
      correctionHistory,
      'correccion_id',
    );
  }

  participantesHistoricos(
    actor: VerifiedActor,
    registro: string,
    query: HistoricalParticipantsQuery,
  ) {
    const context = JSON.stringify([
      1,
      'PARTICIPANTES_HISTORICOS',
      actor.usuario_id,
      actor.auth_id,
      registro,
      actor.rol === 'ADMIN' ? 'GLOBAL' : 'CONTEXTUAL',
      query.modo,
      query.consulta.toLowerCase(),
    ]);
    return this.pagina(
      actor,
      'pa_correccion_participantes_historicos_leer',
      {
        p_registro_plantacion_id: registro,
        p_modo: query.modo,
        p_consulta: query.consulta,
      },
      query,
      context,
      'ASC',
      (value) => {
        const row = historicalParticipant(value);
        if (query.modo === 'ID') check(row.usuario_id === query.consulta);
        return row;
      },
      'usuario_id',
    );
  }

  estadoPropio(actor: VerifiedActor, registro: string) {
    return this.simple(
      actor,
      'pa_registro_estado_propio_leer',
      { p_registro_plantacion_id: registro },
      (value) => ownCorrectionState(value, actor.usuario_id, registro),
    );
  }

  historialPropio(
    actor: VerifiedActor,
    registro: string,
    query: CorrectionHistoryQuery,
  ) {
    const context = JSON.stringify([
      1,
      'HISTORIAL_PROPIO_REGISTRO',
      actor.usuario_id,
      actor.auth_id,
      registro,
      'PROPIO',
    ]);
    return this.pagina(
      actor,
      'pa_registro_historial_propio_leer',
      { p_registro_plantacion_id: registro },
      query,
      context,
      'DESC',
      ownCorrectionHistory,
      'correccion_id',
    );
  }

  estadosPropios(actor: VerifiedActor, query: CorrectionHistoryQuery) {
    const context = JSON.stringify([
      1,
      'ESTADOS_PROPIOS_REGISTROS',
      actor.usuario_id,
      actor.auth_id,
      'PROPIO',
    ]);
    return this.pagina(
      actor,
      'pa_mis_registros_estado_leer',
      {},
      query,
      context,
      'DESC',
      (value) => ownCorrectionState(value, actor.usuario_id),
      'registro_plantacion_id',
    );
  }

  estadoPublico(registro: string) {
    return this.simple(
      null,
      'pa_registro_estado_publico_leer',
      { p_registro_plantacion_id: registro },
      (value) => publicCorrectionState(value, registro),
    );
  }

  private async pagina(
    actor: VerifiedActor,
    rpc: string,
    args: Record<string, unknown>,
    query: CorrectionHistoryQuery,
    context: string,
    order: 'ASC' | 'DESC',
    parse: (value: unknown) => Record<string, unknown>,
    identity: string,
  ) {
    const cursorKey = order === 'ASC' ? 'after' : 'before';
    let boundary: string | null = null;
    if (query.cursor) {
      try {
        check(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(query.cursor));
        const [encoded, signature] = query.cursor.split('.');
        const content = Buffer.from(encoded, 'base64url').toString('utf8');
        const provided = Buffer.from(signature, 'base64url');
        const expected = this.sign(content);
        check(
          provided.length === expected.length &&
            timingSafeEqual(provided, expected),
        );
        const parsed = exact(JSON.parse(content), ['context', cursorKey]);
        check(parsed.context === context);
        boundary = id(parsed[cursorKey]);
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 503)
          throw error;
        invalidInput('cursor');
      }
    }
    const value = await this.lectura(actor, rpc, {
      ...args,
      [order === 'ASC' ? 'p_despues_id' : 'p_antes_id']: boundary,
      p_limite: query.limite,
    });
    try {
      const envelope = exact(value, ['data', 'observado_en', 'siguiente_id']);
      check(
        Array.isArray(envelope.data) && envelope.data.length <= query.limite,
      );
      const rows = envelope.data.map(parse);
      let previous =
        boundary === null
          ? order === 'ASC'
            ? 0n
            : 9223372036854775808n
          : BigInt(boundary);
      rows.forEach((row) => {
        const current = BigInt(id(row[identity]));
        check(order === 'ASC' ? current > previous : current < previous);
        previous = current;
      });
      let next: string | null = null;
      if (envelope.siguiente_id !== null) {
        const nextId = id(envelope.siguiente_id);
        check(
          rows.length === query.limite && nextId === rows.at(-1)?.[identity],
        );
        const content = JSON.stringify({ context, [cursorKey]: nextId });
        next =
          Buffer.from(content).toString('base64url') +
          '.' +
          this.sign(content).toString('base64url');
      }
      return {
        data: rows,
        observado_en: instant(envelope.observado_en),
        siguiente_cursor: next,
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 503)
        throw error;
      return this.inconcluso();
    }
  }
}
