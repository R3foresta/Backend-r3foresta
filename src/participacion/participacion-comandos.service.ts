import { HttpException, Injectable } from '@nestjs/common';
import type { VerifiedActor } from '../auth/verified-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { canonicalCommand } from './comando-canonical';
import {
  validateAuthorityReply,
  validateRpcReply,
  type RpcReply,
} from './comando-recibo';
import type {
  AccessOperation,
  AccessPayload,
  AuthorityPayload,
  CommandOperation,
  ReplacementPayload,
} from './dto/comandos.dto';

@Injectable()
export class ParticipacionComandosService {
  constructor(private readonly supabase: SupabaseService) {}

  acceso(
    actor: VerifiedActor,
    operation: AccessOperation,
    command: string,
    payload: AccessPayload | ReplacementPayload,
  ): Promise<RpcReply> {
    return this.execute(
      'pa_acceso_ejecutar',
      actor,
      operation,
      command,
      payload,
    );
  }
  autoridad(
    actor: VerifiedActor,
    operation: 'CAMBIAR_ROL_GLOBAL' | 'INACTIVAR_CUENTA',
    command: string,
    payload: AuthorityPayload,
  ): Promise<RpcReply> {
    return this.execute(
      'pa_autoridad_ejecutar',
      actor,
      operation,
      command,
      payload,
    );
  }
  async recuperar(
    actor: VerifiedActor,
    operation: CommandOperation,
    command: string,
  ): Promise<RpcReply> {
    const data = await this.rpc(
      'pa_comando_recuperar',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_operacion: operation,
        p_comando_id: command,
      },
      command,
    );
    try {
      return validateRpcReply(data, command, operation, true);
    } catch {
      return this.inconclusive(command);
    }
  }
  async leerAutoridad(actor: VerifiedActor, user: string): Promise<RpcReply> {
    const data = await this.rpc(
      'pa_autoridad_leer',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_usuario_id: user,
      },
      null,
    );
    try {
      return validateAuthorityReply(data);
    } catch {
      return this.inconclusive(null);
    }
  }
  private async execute(
    rpc: string,
    actor: VerifiedActor,
    operation: string,
    command: string,
    payload: unknown,
  ): Promise<RpcReply> {
    const { contenido } = canonicalCommand(operation, payload);
    const data = await this.rpc(
      rpc,
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_operacion: operation,
        p_comando_id: command,
        p_payload: payload,
        p_contenido_canonico: contenido,
      },
      command,
    );
    try {
      return validateRpcReply(data, command, operation);
    } catch {
      return this.inconclusive(command);
    }
  }
  private async rpc(
    name: string,
    args: Record<string, unknown>,
    command: string | null,
  ): Promise<unknown> {
    try {
      const { data, error } = (await this.supabase
        .getAdminClient()
        .rpc(name, args)) as { data: unknown; error: unknown };
      if (error || data === null) return this.inconclusive(command);
      return data;
    } catch {
      return this.inconclusive(command);
    }
  }
  private inconclusive(command: string | null): never {
    throw new HttpException(
      {
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          mensaje:
            'No se pudo determinar el resultado. Recupere el comando con la misma clave.',
          campos: [],
          ambitos: [],
          reintento: 'MISMA_CLAVE',
        },
        comando_id: command,
        resultado_concluyente: false,
      },
      503,
    );
  }
}
