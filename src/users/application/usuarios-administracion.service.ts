import {
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { revision } from '../../participacion/dto/comandos.dto';
import { positiveId } from '../perfil-v1.dto';
import {
  ROLES_GLOBALES,
  type RolGlobal,
  type UsuariosAdministracionQuery,
} from '../dto/usuarios-administracion.dto';

type UsuarioAdministrable = {
  usuario_id: string;
  nombre: string;
  username: string | null;
  rol_global: RolGlobal;
  activo: true;
  revision_autoridad: string;
};
type RpcResult = {
  data: unknown;
  error: { code?: string; details?: string } | null;
};

@Injectable()
export class UsuariosAdministracionService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async listar(actor: VerifiedActor, query: UsuariosAdministracionQuery) {
    if (actor.rol !== 'ADMIN')
      throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
    const context = createHash('sha256')
      .update(
        JSON.stringify([
          'USUARIOS_ADMINISTRACION/1',
          actor.usuario_id,
          actor.auth_id,
          query.consulta,
          query.rol_global,
        ]),
      )
      .digest('hex');
    const after = this.decodeCursor(query.cursor, context);
    let result: RpcResult;
    try {
      result = (await this.supabase
        .getAdminClient()
        .rpc('pa_usuarios_administracion_leer', {
          p_actor_id: actor.usuario_id,
          p_auth_id: actor.auth_id,
          p_consulta: query.consulta,
          p_rol_global: query.rol_global,
          p_despues_id: after,
          p_limite: query.limite + 1,
        })) as RpcResult;
    } catch {
      return this.unavailable();
    }
    if (!result || typeof result !== 'object') return this.unavailable();
    if (result.error) this.rpcError(result.error);
    const envelope = this.readEnvelope(result.data, query, after);
    const page = envelope.data.slice(0, query.limite);
    return {
      data: page,
      observado_en: envelope.observado_en,
      siguiente_cursor:
        envelope.data.length > query.limite
          ? this.encodeCursor(context, page.at(-1)!.usuario_id)
          : null,
    };
  }

  private readEnvelope(
    value: unknown,
    query: UsuariosAdministracionQuery,
    after: string | null,
  ) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error();
      const envelope = value as Record<string, unknown>;
      if (
        Object.keys(envelope).some(
          (key) => !['data', 'observado_en'].includes(key),
        ) ||
        typeof envelope.observado_en !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(
          envelope.observado_en,
        ) ||
        !Number.isFinite(Date.parse(envelope.observado_en)) ||
        !Array.isArray(envelope.data) ||
        envelope.data.length > query.limite + 1
      )
        throw new Error();
      let previous = after === null ? 0n : BigInt(after);
      const data: UsuarioAdministrable[] = envelope.data.map(
        (value: unknown) => {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error();
          const row = value as Record<string, unknown>;
          if (
            Object.keys(row).some(
              (key) =>
                ![
                  'usuario_id',
                  'nombre',
                  'username',
                  'rol_global',
                  'activo',
                  'revision_autoridad',
                ].includes(key),
            ) ||
            typeof row.nombre !== 'string' ||
            !row.nombre.trim() ||
            (row.username !== null && typeof row.username !== 'string') ||
            row.activo !== true ||
            !ROLES_GLOBALES.includes(row.rol_global as RolGlobal) ||
            (query.rol_global !== null && row.rol_global !== query.rol_global)
          )
            throw new Error();
          const usuario_id = positiveId(row.usuario_id);
          if (BigInt(usuario_id) <= previous) throw new Error();
          previous = BigInt(usuario_id);
          return {
            usuario_id,
            nombre: row.nombre,
            username: row.username as string | null,
            rol_global: row.rol_global as RolGlobal,
            activo: true,
            revision_autoridad: revision(row.revision_autoridad),
          };
        },
      );
      return { data, observado_en: envelope.observado_en };
    } catch {
      return this.unavailable();
    }
  }

  private secret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret?.trim()) return this.unavailable();
    return secret;
  }
  private encodeCursor(context: string, after: string): string {
    const payload = Buffer.from(JSON.stringify([1, context, after])).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.secret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }
  private decodeCursor(raw: string | null, context: string): string | null {
    if (raw === null) return null;
    const secret = this.secret();
    try {
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
      const [payload, signature] = raw.split('.');
      const expected = createHmac('sha256', secret).update(payload).digest();
      const given = Buffer.from(signature, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        throw new Error();
      const decoded: unknown = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      if (
        !Array.isArray(decoded) ||
        decoded.length !== 3 ||
        decoded[0] !== 1 ||
        decoded[1] !== context
      )
        throw new Error();
      return positiveId(decoded[2]);
    } catch {
      throw new UnprocessableEntityException({
        codigo: 'ENTRADA_INVALIDA',
        message: 'Cursor inválido para esta consulta.',
      });
    }
  }
  private rpcError(error: NonNullable<RpcResult['error']>): never {
    const allowed: Record<string, string[]> = {
      PT401: ['SESION_INVALIDA'],
      PT403: ['CUENTA_INACTIVA', 'CAPACIDAD_INSUFICIENTE'],
      PT422: ['ENTRADA_INVALIDA'],
    };
    let detail: Record<string, unknown>;
    try {
      detail = JSON.parse(error.details ?? '') as Record<string, unknown>;
      if (
        !detail ||
        !allowed[error.code ?? '']?.includes(detail.codigo as string) ||
        typeof detail.mensaje !== 'string' ||
        !detail.mensaje ||
        !Array.isArray(detail.campos) ||
        detail.campos.length ||
        !Array.isArray(detail.ambitos) ||
        detail.ambitos.length ||
        !['NO_APLICA', 'RECUPERAR_SESION'].includes(detail.reintento as string)
      )
        throw new Error();
    } catch {
      return this.unavailable();
    }
    throw new HttpException(
      {
        error: {
          codigo: detail.codigo,
          mensaje: detail.mensaje,
          campos: [],
          ambitos: [],
          reintento: detail.reintento,
        },
        comando_id: null,
        resultado_concluyente: false,
      },
      Number(error.code!.slice(2)),
    );
  }
  private unavailable(): never {
    throw new ServiceUnavailableException({
      error: {
        codigo: 'RESULTADO_NO_DETERMINADO',
        mensaje: 'No se pudo consultar usuarios.',
        campos: [],
        ambitos: [],
        reintento: 'NO_APLICA',
      },
      comando_id: null,
      resultado_concluyente: false,
    });
  }
}
