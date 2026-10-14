import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import type { VerifiedActor } from '../auth/verified-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { ActualizarPerfil, parseSelector, positiveId } from './perfil-v1.dto';

type PerfilPropio = {
  usuario_id: string;
  nombre: string;
  apellido: string | null;
  afiliacion: {
    tipo: 'ORGANIZACION_REGISTRADA' | 'OTRA';
    organizacion_id: string | null;
    nombre: string;
  } | null;
  rol_global: string;
};

function perfilOutput(value: unknown): PerfilPropio {
  try {
    const row = value as Record<string, unknown>;
    if (
      !row ||
      typeof row.nombre !== 'string' ||
      (row.apellido !== null && typeof row.apellido !== 'string') ||
      typeof row.rol_global !== 'string' ||
      !['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'].includes(row.rol_global)
    )
      throw new Error();
    let affiliation: PerfilPropio['afiliacion'] = null;
    if (row.afiliacion !== null) {
      const a = row.afiliacion as Record<string, unknown>;
      if (!a || typeof a.nombre !== 'string') throw new Error();
      if (a.tipo === 'ORGANIZACION_REGISTRADA') {
        affiliation = {
          tipo: a.tipo,
          organizacion_id: positiveId(a.organizacion_id),
          nombre: a.nombre,
        };
      } else if (a.tipo === 'OTRA' && a.organizacion_id === null) {
        affiliation = { tipo: a.tipo, organizacion_id: null, nombre: a.nombre };
      } else throw new Error();
    }
    return {
      usuario_id: positiveId(row.usuario_id),
      nombre: row.nombre,
      apellido: row.apellido,
      afiliacion: affiliation,
      rol_global: row.rol_global,
    };
  } catch {
    throw new InternalServerErrorException(
      'La base devolvió un perfil incompatible.',
    );
  }
}

function cursorEncode(id: string): string {
  return Buffer.from(JSON.stringify([1, id]), 'utf8').toString('base64url');
}

function cursorDecode(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (!Array.isArray(decoded) || decoded.length !== 2 || decoded[0] !== 1)
      throw new Error();
    return positiveId(decoded[1]);
  } catch {
    throw new UnprocessableEntityException({
      codigo: 'ENTRADA_INVALIDA',
      message: 'Cursor inválido.',
    });
  }
}

@Injectable()
export class PerfilV1Service {
  constructor(private readonly supabase: SupabaseService) {}

  private async perfilRpc(
    actor: VerifiedActor,
    change?: ActualizarPerfil,
    historical: Record<string, string | null> = {},
  ): Promise<PerfilPropio> {
    const client = this.supabase.getAdminClient();
    const params = change
      ? {
          p_usuario_id: actor.usuario_id,
          p_auth_id: actor.auth_id,
          p_cambiar_nombre: change.nombre !== undefined,
          p_nombre: change.nombre ?? null,
          p_cambiar_apellido: change.apellido !== undefined,
          p_apellido: change.apellido ?? null,
          p_cambiar_afiliacion: change.afiliacion !== undefined,
          p_organizacion_id:
            change.afiliacion?.tipo === 'ORGANIZACION_REGISTRADA'
              ? change.afiliacion.organizacion_id
              : null,
          p_organizacion_otra:
            change.afiliacion?.tipo === 'OTRA'
              ? change.afiliacion.nombre
              : null,
          p_datos_historicos: historical,
        }
      : { p_usuario_id: actor.usuario_id, p_auth_id: actor.auth_id };
    const result = (await client.rpc(
      change ? 'pa_perfil_actualizar' : 'pa_perfil_leer',
      params,
    )) as { data: unknown; error: { message: string; code?: string } | null };
    const { data, error } = result;
    if (error?.message?.includes('CUENTA_NO_ENCONTRADA'))
      throw new UnauthorizedException('La cuenta de la sesión no existe.');
    if (error?.code === '23505')
      throw new ConflictException('Dato histórico ya registrado.');
    if (error?.message?.includes('ORGANIZACION_NO_SELECCIONABLE')) {
      throw new UnprocessableEntityException({
        codigo: 'ORGANIZACION_NO_SELECCIONABLE',
        message: 'Organización no seleccionable.',
      });
    }
    if (error?.message?.includes('CUENTA_INACTIVA'))
      throw new ForbiddenException('CUENTA_INACTIVA');
    if (!data && !error) throw new ForbiddenException('CUENTA_INACTIVA');
    if (error)
      throw new InternalServerErrorException('No se pudo obtener el perfil.');
    return perfilOutput(data);
  }

  async leer(actor: VerifiedActor) {
    return {
      data: await this.perfilRpc(actor),
      observado_en: new Date().toISOString(),
    };
  }

  async actualizar(actor: VerifiedActor, change: ActualizarPerfil) {
    return {
      data: await this.perfilRpc(actor, change),
      observado_en: new Date().toISOString(),
    };
  }

  async actualizarLegado(
    actor: VerifiedActor,
    change: ActualizarPerfil,
    historical: Record<string, string | null>,
  ) {
    return this.perfilRpc(actor, change, historical);
  }

  async organizaciones(actor: VerifiedActor, query: Record<string, unknown>) {
    const { consulta, limite, cursor } = parseSelector(query);
    const afterId = cursorDecode(cursor);
    const result = (await this.supabase
      .getAdminClient()
      .rpc('pa_organizaciones_seleccionables', {
        p_usuario_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_consulta: consulta,
        p_despues_id: afterId,
        p_limite: limite + 1,
      })) as { data: unknown; error: { message: string } | null };
    const { data, error } = result;
    if (error?.message?.includes('CUENTA_NO_ENCONTRADA'))
      throw new UnauthorizedException('La cuenta de la sesión no existe.');
    if (error?.message?.includes('CURSOR_INVALIDO'))
      throw new UnprocessableEntityException({
        codigo: 'ENTRADA_INVALIDA',
        message: 'Cursor inválido.',
      });
    if (error?.message?.includes('CUENTA_INACTIVA'))
      throw new ForbiddenException('CUENTA_INACTIVA');
    if (error)
      throw new InternalServerErrorException(
        'No se pudo consultar organizaciones.',
      );
    let rows: { organizacion_id: string; nombre: string }[];
    try {
      if (!Array.isArray(data)) throw new Error();
      rows = (data as Record<string, unknown>[]).map((row) => {
        if (typeof row.nombre !== 'string') throw new Error();
        return {
          organizacion_id: positiveId(row.organizacion_id),
          nombre: row.nombre,
        };
      });
    } catch {
      throw new InternalServerErrorException(
        'La base devolvió un catálogo incompatible.',
      );
    }
    const page = rows.slice(0, limite);
    const last = page.at(-1);
    return {
      data: page.map(({ organizacion_id, nombre }) => ({
        organizacion_id,
        nombre,
      })),
      observado_en: new Date().toISOString(),
      siguiente_cursor:
        rows.length > limite && last
          ? cursorEncode(last.organizacion_id)
          : null,
    };
  }
}
