import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { canonicalCommand } from '../comando-canonical';
import { validateRpcReply, validateStableError } from '../comando-recibo';
import { id, invalidInput } from '../dto/comandos.dto';
import type {
  ParticipantesQuery,
  RegistroInicialPayload,
} from '../dto/registro.dto';
import {
  check,
  contextoRegistro,
  detallePropio,
  exact,
  instant,
  personaMinima,
} from '../domain/policies/registro-proyeccion.policy';

@Injectable()
export class ParticipacionRegistroService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  private inconcluso(command: string | null): never {
    throw new HttpException(
      {
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          mensaje:
            'No se pudo determinar el resultado. Consulte la misma clave.',
          campos: [],
          ambitos: [],
          reintento: command ? 'MISMA_CLAVE' : 'NO_APLICA',
        },
        comando_id: command,
        resultado_concluyente: false,
      },
      503,
    );
  }
  private async rpc(
    actor: VerifiedActor,
    name: string,
    args: Record<string, unknown>,
    command: string | null = null,
  ): Promise<unknown> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .rpc(name, {
          p_actor_id: actor.usuario_id,
          p_auth_id: actor.auth_id,
          ...args,
        });
      if (error) {
        // Solo errores de lectura emitidos por las RPC privadas. Nunca publicar
        // detalles SQL ni convertir un fallo inesperado en terminal de negocio.
        if (
          !command &&
          /^PT(401|403|404|409|422|503)$/.test(error.code ?? '')
        ) {
          let stable: ReturnType<typeof validateStableError> | undefined;
          try {
            stable = validateStableError(JSON.parse(error.details));
          } catch {
            /* Fallo desconocido. */
          }
          if (stable)
            throw new HttpException(
              { error: stable, comando_id: null, resultado_concluyente: false },
              Number(error.code.slice(2)),
            );
        }
        return this.inconcluso(command);
      }
      if (data === null) return this.inconcluso(command);
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return this.inconcluso(command);
    }
  }
  private async lectura(
    actor: VerifiedActor,
    name: string,
    args: Record<string, unknown>,
  ) {
    const data = await this.rpc(actor, name, args);
    try {
      const row = exact(data, ['data', 'observado_en']);
      return { data: row.data, observado_en: instant(row.observado_en) };
    } catch {
      return this.inconcluso(null);
    }
  }
  async contexto(actor: VerifiedActor, scope: string) {
    const envelope = await this.lectura(actor, 'pa_registro_contexto_leer', {
      p_subcampania_id: scope,
    });
    try {
      return {
        ...envelope,
        data: contextoRegistro(
          envelope.data,
          actor.usuario_id,
          scope,
          this.config.get<string>('PARTICIPACION_CONTEXTO_AVANCE_REQUERIDO') === 'true',
        ),
      };
    } catch {
      return this.inconcluso(null);
    }
  }
  async detalle(actor: VerifiedActor, registro: string) {
    const envelope = await this.lectura(
      actor,
      'pa_registro_detalle_propio_leer',
      { p_registro_id: registro },
    );
    try {
      return {
        ...envelope,
        data: detallePropio(envelope.data, actor.usuario_id, registro),
      };
    } catch {
      return this.inconcluso(null);
    }
  }
  private sign(value: string): Buffer {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret?.trim()) return this.inconcluso(null);
    return createHmac('sha256', secret).update(value).digest();
  }
  private cursorContext(actor: VerifiedActor, scope: string, q: string | null) {
    return JSON.stringify([
      1,
      actor.usuario_id,
      actor.auth_id,
      'PARTICIPANTES_REGISTRO',
      scope,
      q?.toLowerCase() ?? null,
    ]);
  }
  async participantes(
    actor: VerifiedActor,
    scope: string,
    query: ParticipantesQuery,
  ) {
    const context = this.cursorContext(actor, scope, query.q);
    let after: string | null = null;
    if (query.cursor) {
      try {
        const [encoded, signature, extra] = query.cursor.split('.');
        check(!extra && encoded && signature);
        const content = Buffer.from(encoded, 'base64url').toString('utf8');
        const provided = Buffer.from(signature, 'base64url');
        const expected = this.sign(content);
        check(
          provided.length === expected.length &&
            timingSafeEqual(provided, expected),
        );
        const parsed = exact(JSON.parse(content), ['context', 'after']);
        check(parsed.context === context);
        after = id(parsed.after);
      } catch {
        invalidInput('cursor');
      }
    }
    const envelope = await this.lectura(
      actor,
      'pa_registro_participantes_leer',
      {
        p_subcampania_id: scope,
        p_consulta: query.q,
        p_despues_id: after,
        p_limite: query.limite + 1,
      },
    );
    try {
      check(
        Array.isArray(envelope.data) &&
          envelope.data.length <= query.limite + 1,
      );
      const rows = envelope.data.map(personaMinima);
      let previous = BigInt(after ?? '0');
      rows.forEach((row) => {
        check(
          BigInt(row.usuario_id) > previous &&
            row.usuario_id !== actor.usuario_id,
        );
        previous = BigInt(row.usuario_id);
      });
      const page = rows.slice(0, query.limite);
      const content = JSON.stringify({
        context,
        after: page.at(-1)?.usuario_id,
      });
      return {
        ...envelope,
        data: page,
        siguiente_cursor:
          rows.length > query.limite
            ? Buffer.from(content).toString('base64url') +
              '.' +
              this.sign(content).toString('base64url')
            : null,
      };
    } catch {
      return this.inconcluso(null);
    }
  }
  async registrar(
    actor: VerifiedActor,
    command: string,
    payload: RegistroInicialPayload,
  ) {
    const { contenido } = canonicalCommand(
      'REGISTRAR_PLANTACION_INICIAL',
      payload,
    );
    const enabled = this.config.get<string | boolean>(
      'PARTICIPACION_INICIAL_ESCRITURA_HABILITADA',
    );
    if (enabled !== true && enabled !== 'true') {
      // La pausa no crea un rechazo de negocio ni abre una clave nueva. El
      // helper de075 devuelve solo terminal propio y compara la misma huella.
      const huella = createHash('sha256')
        .update('PA-COMANDO/1\nREGISTRAR_PLANTACION_INICIAL\n' + contenido)
        .digest('hex');
      let replay: unknown;
      try {
        const { data, error } = await this.supabase.getAdminClient().rpc(
          'pa_c_replay',
          { p_actor_id: actor.usuario_id, p_auth_id: actor.auth_id,
            p_operacion: 'REGISTRAR_PLANTACION_INICIAL', p_comando_id: command,
            p_huella: '\\x' + huella },
        );
        if (error) return this.inconcluso(command);
        replay = data;
      } catch { return this.inconcluso(command); }
      if (replay !== null && replay !== undefined) {
        try { return validateRpcReply(replay, command, 'REGISTRAR_PLANTACION_INICIAL'); }
        catch { return this.inconcluso(command); }
      }
      return { http_status: 503, body: {
        error: { codigo: 'RESULTADO_NO_DETERMINADO', mensaje: 'El registro está pausado temporalmente. Conserve la misma clave.',
          campos: [], ambitos: [], reintento: 'MISMA_CLAVE' },
        comando_id: command, resultado_concluyente: false,
      }};
    }
    const data = await this.rpc(
      actor,
      'pa_registro_inicial_ejecutar',
      {
        p_comando_id: command,
        p_payload: payload,
        p_contenido_canonico: contenido,
      },
      command,
    );
    try {
      return validateRpcReply(data, command, 'REGISTRAR_PLANTACION_INICIAL');
    } catch {
      return this.inconcluso(command);
    }
  }
}
