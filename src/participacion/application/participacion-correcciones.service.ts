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
} from '../dto/correcciones.dto';
import {
  correctionContext,
  observationsHistory,
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
    actor: VerifiedActor,
    name: string,
    args: Record<string, unknown>,
  ) {
    try {
      const { data, error } = await this.supabase.getAdminClient().rpc(name, {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
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
    const value = await this.lectura(actor, 'pa_correccion_contexto_leer', {
      p_registro_plantacion_id: registro,
    });
    try {
      const row = exact(value, ['data', 'observado_en']);
      return {
        data: correctionContext(row.data, registro),
        observado_en: instant(row.observado_en),
      };
    } catch {
      return this.inconcluso();
    }
  }

  private sign(value: string) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret?.trim()) return this.inconcluso();
    return createHmac('sha256', secret).update(value).digest();
  }

  async historial(
    actor: VerifiedActor,
    registro: string,
    query: CorrectionHistoryQuery,
  ) {
    const context = JSON.stringify([
      1,
      'HISTORIAL_CORRECCIONES_OBSERVACIONES',
      actor.usuario_id,
      actor.auth_id,
      registro,
      actor.rol === 'ADMIN' ? 'GLOBAL' : 'CONTEXTUAL',
    ]);
    let before: string | null = null;
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
        const parsed = exact(JSON.parse(content), ['context', 'before']);
        check(parsed.context === context);
        before = id(parsed.before);
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 503)
          throw error;
        invalidInput('cursor');
      }
    }
    const value = await this.lectura(actor, 'pa_correccion_historial_leer', {
      p_registro_plantacion_id: registro,
      p_antes_id: before,
      p_limite: query.limite,
    });
    try {
      const envelope = exact(value, ['data', 'observado_en', 'siguiente_id']);
      check(
        Array.isArray(envelope.data) && envelope.data.length <= query.limite,
      );
      const rows = envelope.data.map(observationsHistory);
      let previous = before === null ? 9223372036854775808n : BigInt(before);
      rows.forEach((row) => {
        const current = BigInt(row.correccion_id as string);
        check(current < previous);
        previous = current;
      });
      let next: string | null = null;
      if (envelope.siguiente_id !== null) {
        const nextId = id(envelope.siguiente_id);
        check(
          rows.length === query.limite && nextId === rows.at(-1)?.correccion_id,
        );
        const content = JSON.stringify({ context, before: nextId });
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
