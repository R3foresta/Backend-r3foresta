import { id, revision } from '../../../participacion/dto/comandos.dto';

/** Valida el recibo antes de presentarlo como resultado confirmado. */
export function validarReciboRecepcion(
  value: unknown,
  comando: string,
  recuperar = false,
  esperado?: { actor: string; origen?: string; revision?: string },
) {
  const check: (v: unknown) => asserts v = (v) => {
    if (!v) throw new Error('Recibo de recepción inválido');
  };
  check(value && typeof value === 'object');
  const reply = value as { http_status: number; body: Record<string, unknown> };
  check(
    Number.isInteger(reply.http_status) &&
      reply.body &&
      typeof reply.body === 'object',
  );
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
        : reply.http_status === 409,
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
        ['CONFIRMADO', 'INCIDENCIA'].includes(String(b.estado)) &&
          reply.http_status === 200 &&
          b.error === null,
      );
      check(b.resultado && typeof b.resultado === 'object');
      const r = b.resultado as Record<string, unknown>;
      check(Object.keys(r).length === 14);
      check(
        typeof r.cantidad_recibida === 'number' &&
          Number.isFinite(r.cantidad_recibida) &&
          r.cantidad_recibida > 0,
      );
      check(
        typeof r.saldo_actual === 'number' &&
          Number.isFinite(r.saldo_actual) &&
          r.saldo_actual >= 0,
      );
      check(['G', 'UNIDAD'].includes(String(r.unidad_recibida)));
      check(
        typeof r.fecha_recepcion === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_recepcion),
      );
      if (esperado) {
        check(r.recibido_por === esperado.actor);
        if (esperado.origen) check(r.recoleccion_id === esperado.origen);
        if (esperado.revision) check(r.revision_anterior === esperado.revision);
      }
      for (const k of [
        'recoleccion_id',
        'vivero_id',
        'observacion_id',
        'recibido_por',
      ])
        id(r[k]);
      check(
        BigInt(revision(r.revision_nueva)) ===
          BigInt(revision(r.revision_anterior)) + 1n,
      );
      if (b.estado === 'CONFIRMADO') {
        id(r.recepcion_id);
        check(r.estado_registro === 'VALIDADO');
      } else {
        id(r.incidencia_id);
        check(r.recepcion_id === null);
      }
      check(r.anclaje_externo === 'PENDIENTE_NO_EJECUTADO');
    }
  }
  return reply;
}
