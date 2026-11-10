import { id, revision } from '../../../participacion/dto/comandos.dto';
import type { ConciliacionIntencion } from '../../api/dto/conciliacion-vivero.dto';
import type { RpcReply } from '../../../participacion/comando-recibo';

export function validarReciboConciliacion(
  value: unknown,
  comando: string,
  actor: string,
  payload?: ConciliacionIntencion,
): RpcReply {
  const check: (v: unknown) => asserts v = (v) => {
    if (!v) throw new Error('Recibo de conciliación inválido.');
  };
  check(value && typeof value === 'object');
  const reply = value as RpcReply;
  const b = reply.body;
  const status = reply.http_status;
  check(
    Number.isInteger(status) &&
      b &&
      typeof b === 'object' &&
      Object.keys(b).length === 5 &&
      ['comando_id', 'estado', 'resultado', 'error', 'finalizado_en'].every(
        (k) => k in b,
      ) &&
      b.comando_id === comando,
  );
  const errorValido =
    b.error &&
    typeof b.error === 'object' &&
    'codigo' in b.error &&
    typeof b.error.codigo === 'string';
  if (b.estado === 'SIN_RESULTADO') {
    check(
      !payload &&
        status === 202 &&
        b.finalizado_en === null &&
        b.resultado === null &&
        b.error === null,
    );
    return reply;
  }
  if (b.estado === 'CONFLICTO_CLAVE') {
    check(
      payload &&
        status === 409 &&
        b.finalizado_en === null &&
        b.resultado === null &&
        errorValido,
    );
    return reply;
  }
  check(
    typeof b.finalizado_en === 'string' &&
      Number.isFinite(Date.parse(b.finalizado_en)),
  );
  if (b.estado === 'RECHAZADO') {
    check(
      b.resultado === null &&
        errorValido &&
        (payload ? [403, 404, 409, 422].includes(status) : status === 200),
    );
    return reply;
  }
  check(
    status === 200 &&
      b.error === null &&
      b.resultado &&
      typeof b.resultado === 'object',
  );
  const r = b.resultado as Record<string, unknown>;
  check(
    Array.isArray(r.inconsistencias) &&
      r.inconsistencias.every((codigo) => typeof codigo === 'string') &&
      (b.estado !== 'INCIDENCIA' || r.inconsistencias.length > 0),
  );
  id(r.recoleccion_id);
  id(r.vivero_id);
  id(r.evento_id);
  check(r.actor_id === actor);
  const antes = revision(r.revision_anterior);
  check(BigInt(revision(r.revision_nueva)) === BigInt(antes) + 1n);
  if (payload)
    check(
      r.recoleccion_id === payload.recoleccion_id &&
        r.accion === payload.accion &&
        antes === payload.revision_esperada,
    );
  const esperado =
    r.accion === 'INCLUIR'
      ? 'PENDIENTE'
      : r.accion === 'RETIRAR'
        ? 'RETIRADO'
        : r.accion === 'CONCILIAR'
          ? b.estado === 'INCIDENCIA'
            ? 'INCIDENCIA'
            : 'CONFORME'
          : null;
  check(
    esperado &&
      r.estado === esperado &&
      b.estado === (esperado === 'INCIDENCIA' ? 'INCIDENCIA' : 'CONFIRMADO'),
  );
  return reply;
}
