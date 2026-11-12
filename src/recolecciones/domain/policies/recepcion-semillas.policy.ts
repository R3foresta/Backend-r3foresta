import { id, revision } from '../../../participacion/dto/comandos.dto';

/** Valida el recibo durable; RECHAZAR una ficha es un comando CONFIRMADO. */
export function validarReciboRecepcion(
  value: unknown,
  comando: string,
  recuperar = false,
  esperado?: {
    actor: string;
    origen?: string;
    revision?: string;
    accion?: 'RECIBIR' | 'RECHAZAR';
  },
) {
  const check: (v: unknown) => asserts v = (v) => {
    if (!v) throw new Error('Recibo de recepción inválido');
  };
  check(value && typeof value === 'object' && !Array.isArray(value));
  const reply = value as {
    http_status: number;
    body: Record<string, unknown>;
    ejecucion_nueva?: boolean;
  };
  check(
    Number.isInteger(reply.http_status) &&
      reply.body &&
      typeof reply.body === 'object' &&
      !Array.isArray(reply.body),
  );
  if (!recuperar) check(typeof reply.ejecucion_nueva === 'boolean');
  const b = reply.body;
  check(
    Object.keys(b).length === 5 &&
      ['comando_id', 'estado', 'resultado', 'error', 'finalizado_en'].every(
        (k) => k in b,
      ) &&
      b.comando_id === comando,
  );
  if (b.estado === 'SIN_RESULTADO' || b.estado === 'CONFLICTO_CLAVE') {
    check(b.resultado === null && b.finalizado_en === null);
    check(
      b.estado === 'SIN_RESULTADO'
        ? recuperar && reply.http_status === 202 && b.error === null
        : reply.http_status === 409 && b.error && typeof b.error === 'object',
    );
  } else {
    check(
      typeof b.finalizado_en === 'string' &&
        Number.isFinite(Date.parse(b.finalizado_en)),
    );
    if (b.estado === 'RECHAZADO') {
      check(
        b.resultado === null &&
          b.error &&
          typeof b.error === 'object' &&
          'codigo' in b.error,
      );
      check(
        recuperar
          ? reply.http_status === 200
          : [403, 404, 409, 422].includes(reply.http_status),
      );
    } else {
      check(
        b.estado === 'CONFIRMADO' &&
          reply.http_status === 200 &&
          b.error === null,
      );
      check(
        b.resultado &&
          typeof b.resultado === 'object' &&
          !Array.isArray(b.resultado),
      );
      const r = b.resultado as Record<string, unknown>;
      const fields = [
        'accion',
        'recoleccion_id',
        'vivero_id',
        'recepcion_id',
        'revision_anterior',
        'revision_nueva',
        'cantidad_recibida',
        'unidad_recibida',
        'fecha_recepcion',
        'actor_id',
        'saldo_actual',
        'estado_registro',
        'anclaje_externo',
        'motivo_rechazo',
        'registrado_en',
      ];
      check(
        Object.keys(r).length === fields.length && fields.every((k) => k in r),
      );
      check(
        typeof r.saldo_actual === 'number' &&
          Number.isFinite(r.saldo_actual) &&
          r.saldo_actual >= 0,
      );
      check(
        typeof r.registrado_en === 'string' &&
          Number.isFinite(Date.parse(r.registrado_en)),
      );
      for (const k of ['recoleccion_id', 'vivero_id', 'actor_id']) id(r[k]);
      if (esperado) {
        check(r.actor_id === esperado.actor);
        if (esperado.origen) check(r.recoleccion_id === esperado.origen);
        if (esperado.revision) check(r.revision_anterior === esperado.revision);
        if (esperado.accion) check(r.accion === esperado.accion);
      }
      check(
        BigInt(revision(r.revision_nueva)) ===
          BigInt(revision(r.revision_anterior)) + 1n,
      );
      if (r.accion === 'RECIBIR') {
        id(r.recepcion_id);
        check(r.estado_registro === 'VALIDADO' && r.motivo_rechazo === null);
        check(
          typeof r.cantidad_recibida === 'number' &&
            Number.isFinite(r.cantidad_recibida) &&
            r.cantidad_recibida > 0,
        );
        check(['G', 'UNIDAD'].includes(String(r.unidad_recibida)));
        if (r.unidad_recibida === 'UNIDAD')
          check(Number.isInteger(r.cantidad_recibida));
        check(
          typeof r.fecha_recepcion === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_recepcion) &&
            Number.isFinite(Date.parse(r.fecha_recepcion)) &&
            new Date(r.fecha_recepcion).toISOString().slice(0, 10) ===
              r.fecha_recepcion,
        );
        check(r.anclaje_externo === 'FUERA_TRANSACCION');
      } else {
        check(
          r.accion === 'RECHAZAR' &&
            r.estado_registro === 'RECHAZADO' &&
            r.recepcion_id === null &&
            r.cantidad_recibida === null &&
            r.unidad_recibida === null &&
            r.fecha_recepcion === null &&
            r.anclaje_externo === 'NO_APLICA',
        );
        check(
          typeof r.motivo_rechazo === 'string' &&
            [...r.motivo_rechazo].length >= 10 &&
            [...r.motivo_rechazo].length <= 500,
        );
      }
    }
  }
  return reply;
}
