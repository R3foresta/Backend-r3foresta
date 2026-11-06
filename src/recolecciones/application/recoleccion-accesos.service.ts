import { HttpException, Injectable } from '@nestjs/common';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { id, revision } from '../../participacion/dto/comandos.dto';
import {
  validateStableError,
  type RpcReply,
} from '../../participacion/comando-recibo';
import {
  M1_OPERACIONES,
  type M1Intencion,
  type M1Operacion,
} from '../api/dto/acceso-recoleccion.dto';

@Injectable()
export class RecoleccionAccesosService {
  constructor(private readonly supabase: SupabaseService) {}

  leer(
    actor: VerifiedActor,
    usuario: string,
    antes: string | null = null,
    limite = 20,
  ) {
    return this.rpc(
      'm1_acceso_leer',
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
    operacion: M1Operacion,
    comando: string,
    payload: M1Intencion,
  ) {
    return this.rpc(
      'm1_acceso_ejecutar',
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
      'm1_acceso_recuperar',
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
    operacion?: M1Operacion,
    recovery = false,
  ): Promise<RpcReply> {
    try {
      const { data, error } = (await this.supabase
        .getAdminClient()
        .rpc(name, args)) as { data: unknown; error: unknown };
      if (error || !data) throw new Error();
      return validateM1Reply(data, comando, operacion, recovery);
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
  if (!value) throw new Error('Respuesta M1 inválida');
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
export function validateM1Reply(
  value: unknown,
  comando: string | null,
  operacion?: M1Operacion,
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
      'acceso_explicito',
      'acceso_efectivo',
      'origen',
      'capacidades',
      'vigencia_actual',
      'historial',
      'siguiente_antes_de_id',
    ]);
    id(data.usuario_id);
    revision(data.revision_acceso);
    revision(data.revision_autoridad);
    assert(
      ['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'].some(
        (role) => role === data.rol_global,
      ),
    );
    assert(
      typeof data.activo === 'boolean' &&
        typeof data.acceso_explicito === 'boolean' &&
        typeof data.acceso_efectivo === 'boolean',
    );
    const derived = data.activo && data.rol_global === 'ADMIN';
    const explicit =
      data.activo &&
      ['GENERAL', 'VALIDADOR'].some((role) => role === data.rol_global) &&
      data.acceso_explicito;
    assert(data.acceso_efectivo === (derived || explicit));
    assert(
      data.origen ===
        (derived ? 'ADMIN' : explicit ? 'EXPLICITO' : 'SIN_ACCESO'),
    );
    const caps = object(data.capacidades, [
      'crear',
      'mantener_propias',
      'confirmar_propias',
      'desechar',
    ]);
    assert(
      caps.crear === data.acceso_efectivo &&
        caps.mantener_propias === data.acceso_efectivo &&
        caps.confirmar_propias === false &&
        caps.desechar === derived,
    );
    if (data.vigencia_actual !== null) {
      const v = object(data.vigencia_actual, [
        'id',
        'otorgado_en',
        'otorgado_por',
      ]);
      id(v.id);
      id(v.otorgado_por);
      instant(v.otorgado_en);
    }
    assert(data.acceso_explicito === (data.vigencia_actual !== null));
    assert(Array.isArray(data.historial) && data.historial.length <= 50);
    for (const entry of data.historial) {
      const h = object(entry, [
        'id',
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
      id(h.acceso_id);
      id(h.actor_id);
      const antes = revision(h.revision_anterior),
        despues = revision(h.revision_nueva);
      assert(BigInt(despues) === BigInt(antes) + 1n);
      assert(
        ['ACCESO_OTORGADO', 'ACCESO_RETIRADO'].some(
          (event) => event === h.evento,
        ),
      );
      assert(typeof h.motivo === 'string');
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
        M1_OPERACIONES.some((op) => op === body.operacion) &&
        (!operacion || body.operacion === operacion),
    );
    instant(body.finalizado_en);
    if (body.estado === 'CONFIRMADO') {
      assert(status === 200 && body.error === null);
      const r = object(body.resultado, [
        'tipo',
        'usuario_id',
        'acceso_explicito_anterior',
        'acceso_explicito_nuevo',
        'revision_anterior',
        'revision_nueva',
        'cambio',
      ]);
      id(r.usuario_id);
      const antes = revision(r.revision_anterior),
        despues = revision(r.revision_nueva);
      assert(
        r.tipo === 'ACCESO_RECOLECCION' &&
          typeof r.acceso_explicito_anterior === 'boolean' &&
          typeof r.acceso_explicito_nuevo === 'boolean',
      );
      assert(
        r.acceso_explicito_nuevo ===
          (body.operacion === 'OTORGAR_ACCESO_RECOLECCION'),
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
