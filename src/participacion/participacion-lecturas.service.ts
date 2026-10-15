import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { VerifiedActor } from '../auth/verified-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { positiveId } from '../users/perfil-v1.dto';
import type {
  AccionesParticipacion,
  BuscarPersonasEntrada,
  CapacidadSubcampania,
  CapacidadesQuery,
  MiembroParticipacion,
  PaginaLectura,
  PermisoContextual,
  PersonaMinima,
  RevisarAccesosEntrada,
} from './dto/lecturas.dto';

type JsonObject = Record<string, unknown>;
type Envelope = { data: unknown; observado_en: string };

function obj(value: unknown, keys: string[]): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error();
  const row = value as JsonObject;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !(key in row))
  )
    throw new Error();
  return row;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error();
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : string(value);
}
function revision(value: unknown): string {
  if (value === '0') return value;
  return positiveId(value);
}
function permiso(value: unknown): PermisoContextual | null {
  if (
    value === null ||
    value === 'PLANTADOR' ||
    value === 'ADMINISTRADOR_SUBCAMPANIA'
  )
    return value;
  throw new Error();
}
function persona(value: unknown): PersonaMinima {
  const row = obj(value, ['usuario_id', 'nombre', 'organizacion']);
  return {
    usuario_id: positiveId(row.usuario_id),
    nombre: string(row.nombre),
    organizacion: nullableText(row.organizacion),
  };
}
function miembro(value: unknown): MiembroParticipacion {
  const row = obj(value, [
    'usuario_id',
    'nombre',
    'organizacion',
    'permiso_contextual',
    'revision_permiso',
    'acceso_global',
    'etiqueta_acceso_global',
    'responsabilidad_logistica',
  ]);
  const acceso_global = bool(row.acceso_global);
  if (
    row.etiqueta_acceso_global !==
    (acceso_global ? 'Administrador · Acceso global' : null)
  )
    throw new Error();
  if (
    row.responsabilidad_logistica !== null &&
    row.responsabilidad_logistica !== 'COORDINADOR' &&
    row.responsabilidad_logistica !== 'OPERARIO'
  )
    throw new Error();
  return {
    usuario_id: positiveId(row.usuario_id),
    nombre: string(row.nombre),
    organizacion: nullableText(row.organizacion),
    permiso_contextual: permiso(row.permiso_contextual),
    revision_permiso: revision(row.revision_permiso),
    acceso_global,
    etiqueta_acceso_global: acceso_global
      ? 'Administrador · Acceso global'
      : null,
    responsabilidad_logistica: row.responsabilidad_logistica,
  };
}
function capacidad(value: unknown): CapacidadSubcampania {
  const row = obj(value, [
    'campania_id',
    'campania_nombre',
    'subcampania_id',
    'nombre',
    'estado',
    'permiso_contextual',
    'revision_permiso',
    'fuente_autoridad',
    'acciones',
  ]);
  if (
    ![
      'BORRADOR',
      'ACTIVA',
      'COMPLETADA',
      'FINALIZADA_PARCIAL',
      'PAUSADA',
      'CANCELADA',
    ].includes(row.estado as string)
  )
    throw new Error();
  if (
    row.fuente_autoridad !== 'GLOBAL' &&
    row.fuente_autoridad !== 'CONTEXTUAL'
  )
    throw new Error();
  const actionKeys = [
    'preparar_registro',
    'registrar_inicial',
    'incorporar_plantador',
    'retirar_plantador',
    'designar_administrador',
    'cambiar_administrador',
    'retirar_administrador',
    'reemplazar_administrador',
  ];
  const actions = obj(row.acciones, actionKeys);
  actionKeys.forEach((key) => bool(actions[key]));
  return {
    campania_id: positiveId(row.campania_id),
    campania_nombre: string(row.campania_nombre),
    subcampania_id: positiveId(row.subcampania_id),
    nombre: string(row.nombre),
    estado: string(row.estado),
    permiso_contextual: permiso(row.permiso_contextual),
    revision_permiso: revision(row.revision_permiso),
    fuente_autoridad: row.fuente_autoridad,
    acciones: actions as AccionesParticipacion,
  };
}

@Injectable()
export class ParticipacionLecturasService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  private cursorContext(
    actor: VerifiedActor,
    kind: string,
    selection: unknown,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify([1, actor.usuario_id, actor.auth_id, kind, selection]),
      )
      .digest('hex');
  }
  private cursorSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret?.trim())
      throw new InternalServerErrorException(
        'No se pudo consultar participación.',
      );
    return secret;
  }
  private cursorEncode(context: string, after: string): string {
    const payload = Buffer.from(JSON.stringify([1, context, after])).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.cursorSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }
  private cursorDecode(raw: string | null, context: string): string | null {
    if (raw === null) return null;
    const secret = this.cursorSecret();
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
  private async rpc(
    actor: VerifiedActor,
    name: string,
    params: JsonObject,
  ): Promise<Envelope> {
    const result = (await this.supabase.getAdminClient().rpc(name, {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      ...params,
    })) as { data: unknown; error: { code?: string; details?: string } | null };
    if (result.error) {
      const statuses: Record<string, string[]> = {
        PT401: ['SESION_INVALIDA'],
        PT403: ['CUENTA_INACTIVA', 'CAPACIDAD_INSUFICIENTE'],
        PT404: ['RECURSO_NO_VISIBLE'],
        PT409: ['ESTADO_NO_ADMITE_ACCESO'],
        PT422: ['ENTRADA_INVALIDA'],
      };
      let stable: JsonObject | null = null;
      try {
        const row = obj(JSON.parse(result.error.details ?? ''), [
          'codigo',
          'mensaje',
          'campos',
          'ambitos',
          'reintento',
        ]);
        if (
          !statuses[result.error.code ?? '']?.includes(string(row.codigo)) ||
          !string(row.mensaje) ||
          !Array.isArray(row.campos) ||
          row.campos.length ||
          !Array.isArray(row.ambitos) ||
          row.ambitos.length ||
          !['NO_APLICA', 'RECUPERAR_SESION'].includes(string(row.reintento))
        )
          throw new Error();
        stable = row;
      } catch {
        /* Error desconocido o detalle incompatible: resultado inconcluso. */
      }
      const status = stable ? Number(result.error.code!.slice(2)) : 503;
      throw new HttpException(
        {
          error: {
            ...(stable ?? {
              codigo: 'RESULTADO_NO_DETERMINADO',
              mensaje: 'No se pudo consultar participación.',
              campos: [],
              ambitos: [],
              reintento: 'NO_APLICA',
            }),
          },
          comando_id: null,
          resultado_concluyente: false,
        },
        status,
      );
    }
    try {
      const row = obj(result.data, ['data', 'observado_en']);
      const observed = string(row.observado_en);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(observed) ||
        !Number.isFinite(Date.parse(observed))
      )
        throw new Error();
      return { data: row.data, observado_en: observed };
    } catch {
      throw new InternalServerErrorException(
        'La base devolvió una lectura incompatible.',
      );
    }
  }
  private output<T>(callback: () => T): T {
    try {
      return callback();
    } catch {
      throw new InternalServerErrorException(
        'La base devolvió una lectura incompatible.',
      );
    }
  }
  private page<T>(
    value: unknown,
    limit: number,
    parse: (row: unknown) => T,
    identity: (row: T) => string,
  ): T[] {
    return this.output(() => {
      if (!Array.isArray(value) || value.length > limit + 1) throw new Error();
      const rows = value.map(parse);
      if (new Set(rows.map(identity)).size !== rows.length) throw new Error();
      return rows;
    });
  }

  async capacidades(actor: VerifiedActor, query: CapacidadesQuery) {
    const context = this.cursorContext(actor, 'CAPACIDADES', query.campania_id);
    const envelope = await this.rpc(actor, 'pa_capacidades_leer', {
      p_campania_id: query.campania_id,
      p_despues_id: this.cursorDecode(query.cursor, context),
      p_limite: query.limite + 1,
    });
    const data = this.output(() =>
      obj(envelope.data, ['actor', 'capacidades_globales', 'subcampanias']),
    );
    const actorData = this.output(() => {
      const row = obj(data.actor, ['usuario_id', 'rol_global']);
      const id = positiveId(row.usuario_id);
      if (
        id !== actor.usuario_id ||
        !['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'].includes(
          row.rol_global as string,
        )
      )
        throw new Error();
      return { usuario_id: id, rol_global: string(row.rol_global) };
    });
    const globales = this.output(() => {
      const row = obj(data.capacidades_globales, [
        'asignar_roles',
        'designar_administradores',
        'leer_plan',
      ]);
      return {
        asignar_roles: bool(row.asignar_roles),
        designar_administradores: bool(row.designar_administradores),
        leer_plan: bool(row.leer_plan),
      };
    });
    const rows = this.page(
      data.subcampanias,
      query.limite,
      capacidad,
      (row) => row.subcampania_id,
    );
    const page = rows.slice(0, query.limite);
    return {
      data: {
        actor: actorData,
        capacidades_globales: globales,
        subcampanias: page,
      },
      observado_en: envelope.observado_en,
      siguiente_cursor:
        rows.length > query.limite
          ? this.cursorEncode(context, page.at(-1)!.subcampania_id)
          : null,
    };
  }
  async miembros(actor: VerifiedActor, id: string, query: PaginaLectura) {
    const context = this.cursorContext(actor, 'MIEMBROS', id);
    const envelope = await this.rpc(actor, 'pa_miembros_participacion_leer', {
      p_subcampania_id: id,
      p_despues_id: this.cursorDecode(query.cursor, context),
      p_limite: query.limite + 1,
    });
    const rows = this.page(
      envelope.data,
      query.limite,
      miembro,
      (row) => row.usuario_id,
    );
    const page = rows.slice(0, query.limite);
    return {
      data: page,
      observado_en: envelope.observado_en,
      siguiente_cursor:
        rows.length > query.limite
          ? this.cursorEncode(context, page.at(-1)!.usuario_id)
          : null,
    };
  }
  async buscar(actor: VerifiedActor, input: BuscarPersonasEntrada) {
    const context = this.cursorContext(actor, 'BUSCAR', [
      input.modo,
      input.consulta.toLowerCase(),
      input.accion,
      [...input.subcampania_ids].sort((a, b) =>
        BigInt(a) < BigInt(b) ? -1 : 1,
      ),
    ]);
    const envelope = await this.rpc(actor, 'pa_personas_buscar', {
      p_modo: input.modo,
      p_consulta: input.consulta,
      p_accion: input.accion,
      p_subcampania_ids: input.subcampania_ids,
      p_despues_id: this.cursorDecode(input.cursor, context),
      p_limite: input.limite + 1,
    });
    const rows = this.page(
      envelope.data,
      input.limite,
      persona,
      (row) => row.usuario_id,
    );
    const page = rows.slice(0, input.limite);
    return {
      data: page,
      observado_en: envelope.observado_en,
      siguiente_cursor:
        rows.length > input.limite
          ? this.cursorEncode(context, page.at(-1)!.usuario_id)
          : null,
    };
  }
  async revisar(actor: VerifiedActor, input: RevisarAccesosEntrada) {
    const envelope = await this.rpc(actor, 'pa_accesos_revisar', {
      p_usuario_destino_id: input.usuario_destino_id,
      p_subcampania_ids: input.subcampania_ids,
    });
    const data = this.output(() => {
      const row = obj(envelope.data, ['usuario', 'ambitos']);
      const usuario = persona(row.usuario);
      if (
        usuario.usuario_id !== input.usuario_destino_id ||
        !Array.isArray(row.ambitos) ||
        row.ambitos.length !== input.subcampania_ids.length
      )
        throw new Error();
      const ids = new Set<string>();
      const ambitos = row.ambitos.map((value) => {
        const scope = obj(value, [
          'subcampania_id',
          'permiso_contextual',
          'revision_permiso',
          'acceso_global',
        ]);
        const id = positiveId(scope.subcampania_id);
        if (!input.subcampania_ids.includes(id) || ids.has(id))
          throw new Error();
        ids.add(id);
        return {
          subcampania_id: id,
          permiso_contextual: permiso(scope.permiso_contextual),
          revision_permiso: revision(scope.revision_permiso),
          acceso_global: bool(scope.acceso_global),
        };
      });
      return { usuario, ambitos };
    });
    return { data, observado_en: envelope.observado_en };
  }
}
