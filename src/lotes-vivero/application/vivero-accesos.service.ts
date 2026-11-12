import {
  HttpException,
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { id, revision } from '../../participacion/dto/comandos.dto';
import {
  validateStableError,
  type RpcReply,
} from '../../participacion/comando-recibo';
import {
  M2_OPERACIONES,
  type M2Intencion,
  type M2Operacion,
} from '../api/dto/acceso-viveros.dto';

@Injectable()
export class ViveroAccesosService {
  constructor(private readonly supabase: SupabaseService) {}

  async origenes(
    actor: VerifiedActor,
    vivero: string,
    origen: string | null,
    page: number,
    limit: number,
    incluirPendientes = false,
    incluirRequisitosInicio = false,
  ) {
    const { data, error } = (await this.supabase
      .getAdminClient()
      .rpc('m2_origenes_leer', {
        p_actor_id: actor.usuario_id,
        p_vivero_id: vivero,
        p_recoleccion_id: origen,
        p_pagina: page,
        p_limite: limit,
        ...(incluirPendientes && { p_incluir_pendientes: true }),
        ...(incluirRequisitosInicio && { p_incluir_requisitos_inicio: true }),
      })) as { data: unknown; error: { code?: string } | null };
    if (error) {
      if (error.code === '42501')
        throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
      if (error.code === 'P0002')
        throw new NotFoundException('Origen no disponible.');
      if (error.code === '22023')
        throw new BadRequestException('Entrada inválida.');
      throw new HttpException('No se pudo consultar material de origen.', 503);
    }
    return data;
  }
  leer(
    actor: VerifiedActor,
    usuario: string,
    antes: string | null = null,
    limite = 20,
  ) {
    return this.rpc(
      'm2_acceso_leer',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_usuario_id: usuario,
        p_antes_de_id: antes,
        p_limite: limite,
      },
      null,
    );
  }
  ejecutar(
    actor: VerifiedActor,
    operacion: M2Operacion,
    comando: string,
    payload: M2Intencion,
  ) {
    return this.rpc(
      'm2_acceso_ejecutar',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_operacion: operacion,
        p_comando_id: comando,
        p_payload: payload,
      },
      comando,
      operacion,
    );
  }
  recuperar(actor: VerifiedActor, comando: string) {
    return this.rpc(
      'm2_acceso_recuperar',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_comando_id: comando,
      },
      comando,
      undefined,
      true,
    );
  }
  private async rpc(
    name: string,
    args: Record<string, unknown>,
    comando: string | null,
    operacion?: M2Operacion,
    recovery = false,
  ): Promise<RpcReply> {
    try {
      const { data, error } = (await this.supabase
        .getAdminClient()
        .rpc(name, args)) as { data: unknown; error: unknown };
      if (error || !data) throw new Error();
      return validateM2Reply(data, comando, operacion, recovery);
    } catch {
      throw new HttpException(
        {
          error: {
            codigo: 'RESULTADO_NO_DETERMINADO',
            mensaje:
              'No se pudo determinar el resultado. Consulte de nuevo o recupere con la misma clave.',
            campos: [],
            ambitos: [],
            reintento: 'MISMA_CLAVE',
          },
          comando_id: comando,
          resultado_concluyente: false,
        },
        503,
      );
    }
  }
}

function assert(value: unknown): asserts value {
  if (!value) throw new Error('Respuesta M2 inválida');
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  const row = value as Record<string, unknown>;
  assert(
    Object.keys(row).length === keys.length && keys.every((key) => key in row),
  );
  return row;
}
function instant(value: unknown): void {
  assert(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
}
export function validateM2Reply(
  value: unknown,
  comando: string | null,
  operacion?: M2Operacion,
  recovery = false,
): RpcReply {
  const reply = object(value, ['http_status', 'body']);
  const status = reply.http_status;
  assert(typeof status === 'number' && Number.isInteger(status));
  assert(
    reply.body && typeof reply.body === 'object' && !Array.isArray(reply.body),
  );
  let body = reply.body as Record<string, unknown>;
  if ('resultado_concluyente' in body) {
    body = object(body, ['resultado_concluyente', 'comando_id', 'error']);
    assert(
      body.resultado_concluyente === false &&
        body.comando_id === comando &&
        [401, 403, 404, 409, 422].includes(status),
    );
    validateStableError(body.error);
  } else if (comando === null) {
    body = object(body, ['data', 'observado_en']);
    instant(body.observado_en);
    assert(status === 200);
    const data = object(body.data, [
      'usuario_id',
      'rol_global',
      'activo',
      'revision_acceso',
      'revision_autoridad',
      'alcance_global',
      'viveros',
      'capacidades_globales',
      'historial',
      'siguiente_antes_de_id',
    ]);
    id(data.usuario_id);
    revision(data.revision_acceso);
    revision(data.revision_autoridad);
    assert(
      ['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'].includes(
        String(data.rol_global),
      ),
    );
    assert(
      typeof data.activo === 'boolean' &&
        data.alcance_global === (data.activo && data.rol_global === 'ADMIN'),
    );
    const global = object(data.capacidades_globales, [
      'administrar',
      'operar_cualquier_vivero',
      'desechar_semillas_cualquier_vivero',
      'recibir_y_validar_cualquier_vivero',
    ]);
    assert(Object.values(global).every((v) => v === data.alcance_global));
    assert(Array.isArray(data.viveros));
    for (const entry of data.viveros) {
      const v = object(entry, [
        'id',
        'vivero_id',
        'otorgado_en',
        'otorgado_por',
        'acceso_efectivo',
        'capacidades',
      ]);
      id(v.id);
      id(v.vivero_id);
      id(v.otorgado_por);
      instant(v.otorgado_en);
      const caps = object(v.capacidades, [
        'operar',
        'consultar_material',
        'desechar_semillas',
        'recibir_y_validar',
      ]);
      assert(
        caps.operar === v.acceso_efectivo &&
          caps.consultar_material === v.acceso_efectivo &&
          caps.desechar_semillas === v.acceso_efectivo,
      );
      assert(
        caps.recibir_y_validar ===
          (v.acceso_efectivo &&
            ['ADMIN', 'VALIDADOR'].includes(String(data.rol_global))),
      );
      assert(
        v.acceso_efectivo ===
          (data.activo &&
            ['ADMIN', 'GENERAL', 'VALIDADOR'].includes(
              String(data.rol_global),
            )),
      );
    }
    assert(Array.isArray(data.historial) && data.historial.length <= 50);
    for (const entry of data.historial) {
      const h = object(entry, [
        'id',
        'vivero_id',
        'evento',
        'acceso_id',
        'actor_id',
        'revision_anterior',
        'revision_nueva',
        'motivo',
        'creado_en',
        'comando_id',
        'otorgado_en',
        'revocado_en',
      ]);
      id(h.id);
      id(h.vivero_id);
      id(h.acceso_id);
      id(h.actor_id);
      assert(
        BigInt(revision(h.revision_nueva)) ===
          BigInt(revision(h.revision_anterior)) + 1n,
      );
      assert(
        ['ACCESO_OTORGADO', 'ACCESO_RETIRADO'].includes(String(h.evento)) &&
          typeof h.motivo === 'string',
      );
      instant(h.creado_en);
      instant(h.otorgado_en);
      if (h.revocado_en !== null) instant(h.revocado_en);
    }
    if (data.siguiente_antes_de_id !== null) id(data.siguiente_antes_de_id);
  } else if (body.estado === 'SIN_RESULTADO') {
    body = object(body, [
      'comando_id',
      'estado',
      'resultado',
      'error',
      'finalizado_en',
    ]);
    assert(
      body.comando_id === comando &&
        recovery &&
        status === 202 &&
        body.resultado === null &&
        body.error === null &&
        body.finalizado_en === null,
    );
  } else {
    body = object(body, [
      'comando_id',
      'operacion',
      'estado',
      'resultado',
      'error',
      'finalizado_en',
    ]);
    assert(
      body.comando_id === comando &&
        M2_OPERACIONES.some((op) => op === body.operacion) &&
        (!operacion || body.operacion === operacion),
    );
    instant(body.finalizado_en);
    if (body.estado === 'CONFIRMADO') {
      assert(status === 200 && body.error === null);
      const r = object(body.resultado, [
        'tipo',
        'usuario_id',
        'vivero_id',
        'acceso_explicito_anterior',
        'acceso_explicito_nuevo',
        'revision_anterior',
        'revision_nueva',
        'cambio',
      ]);
      id(r.usuario_id);
      id(r.vivero_id);
      const antes = revision(r.revision_anterior),
        despues = revision(r.revision_nueva);
      assert(
        r.tipo === 'ACCESO_VIVERO' &&
          typeof r.acceso_explicito_anterior === 'boolean' &&
          typeof r.acceso_explicito_nuevo === 'boolean',
      );
      assert(
        r.acceso_explicito_nuevo ===
          (body.operacion === 'OTORGAR_ACCESO_VIVERO'),
      );
      const cambio = r.acceso_explicito_anterior !== r.acceso_explicito_nuevo;
      assert(r.cambio === (cambio ? 'CAMBIO_APLICADO' : 'SIN_CAMBIOS'));
      assert(BigInt(despues) === BigInt(antes) + (cambio ? 1n : 0n));
    } else {
      assert(
        body.estado === 'RECHAZADO' &&
          body.resultado === null &&
          (recovery ? status === 200 : [403, 404, 409].includes(status)),
      );
      validateStableError(body.error);
    }
  }
  return { http_status: status, body };
}
