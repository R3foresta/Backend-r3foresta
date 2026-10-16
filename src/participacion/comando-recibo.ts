import { id, revision, COMMAND_OPERATIONS } from './dto/comandos.dto';
import { fechaExacta } from './dto/registro.dto';

export type StableError = {
  codigo: string;
  mensaje: string;
  campos: string[];
  ambitos: string[];
  reintento:
    | 'MISMA_CLAVE'
    | 'NUEVA_CONFIRMACION'
    | 'RECUPERAR_SESION'
    | 'NO_APLICA';
};
export type RpcReply = { http_status: number; body: Record<string, unknown> };
const permissions = [null, 'PLANTADOR', 'ADMINISTRADOR_SUBCAMPANIA'];
const roles = ['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'];
function object(value: unknown, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta inválida.');
  const row = value as Record<string, unknown>;
  if (
    keys &&
    (Object.keys(row).length !== keys.length ||
      keys.some((key) => !(key in row)))
  )
    throw new Error('Respuesta inválida.');
  return row;
}
function assert(valid: boolean): asserts valid {
  if (!valid) throw new Error('Respuesta inválida.');
}
function instant(value: unknown): void {
  assert(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
}
export function validateStableError(value: unknown): StableError {
  const entry = object(value, [
    'codigo',
    'mensaje',
    'campos',
    'ambitos',
    'reintento',
  ]);
  assert(
    typeof entry.codigo === 'string' &&
      entry.codigo.length > 0 &&
      typeof entry.mensaje === 'string' &&
      entry.mensaje.length > 0,
  );
  assert(
    Array.isArray(entry.campos) &&
      entry.campos.every((field) => typeof field === 'string'),
  );
  assert(Array.isArray(entry.ambitos));
  entry.ambitos.forEach((scope) => id(scope));
  assert(
    [
      'MISMA_CLAVE',
      'NUEVA_CONFIRMACION',
      'RECUPERAR_SESION',
      'NO_APLICA',
    ].includes(entry.reintento as string),
  );
  return entry as StableError;
}
function validateResult(value: unknown, operation: string): void {
  const result = object(value);
  if (operation === 'CAMBIAR_ROL_GLOBAL' || operation === 'INACTIVAR_CUENTA') {
    object(
      result,
      operation === 'CAMBIAR_ROL_GLOBAL'
        ? [
            'tipo',
            'usuario_id',
            'rol_anterior',
            'rol_nuevo',
            'revision_anterior',
            'revision_nueva',
            'cambio',
          ]
        : [
            'tipo',
            'usuario_id',
            'activo',
            'revision_anterior',
            'revision_nueva',
            'cambio',
          ],
    );
    assert(
      result.tipo ===
        (operation === 'CAMBIAR_ROL_GLOBAL'
          ? 'ROL_GLOBAL'
          : 'CUENTA_INACTIVADA'),
    );
    id(result.usuario_id);
    revision(result.revision_anterior);
    revision(result.revision_nueva);
    assert(
      ['CAMBIO_APLICADO', 'SIN_CAMBIOS'].includes(result.cambio as string),
    );
    if (operation === 'CAMBIAR_ROL_GLOBAL')
      assert(
        roles.includes(result.rol_anterior as string) &&
          roles.includes(result.rol_nuevo as string),
      );
    else assert(result.activo === false);
  } else if (operation === 'REGISTRAR_PLANTACION_INICIAL') {
    object(result, [
      'tipo',
      'registro_plantacion_id',
      'codigo_trazabilidad',
      'subcampania_id',
      'responsable_id',
      'fecha_plantacion',
      'cantidad_total_plantada',
      'especies',
      'gps_dentro_poligono',
      'gps_distancia_a_poligono_m',
      'revision_inicial',
    ]);
    assert(result.tipo === 'PLANTACION_INICIAL');
    ['registro_plantacion_id', 'subcampania_id', 'responsable_id'].forEach(
      (key) => id(result[key]),
    );
    assert(result.revision_inicial === '0');
    assert(
      typeof result.codigo_trazabilidad === 'string' &&
        result.codigo_trazabilidad.length > 0,
    );
    fechaExacta(result.fecha_plantacion);
    assert(
      Number.isInteger(result.cantidad_total_plantada) &&
        (result.cantidad_total_plantada as number) > 0 &&
        (result.cantidad_total_plantada as number) <= 2147483647,
    );
    assert(
      typeof result.gps_dentro_poligono === 'boolean' &&
        (result.gps_distancia_a_poligono_m === null ||
          (typeof result.gps_distancia_a_poligono_m === 'number' &&
            Number.isFinite(result.gps_distancia_a_poligono_m) &&
            result.gps_distancia_a_poligono_m >= 0)),
    );
    assert(
      Array.isArray(result.especies) &&
        result.especies.length >= 1 &&
        result.especies.length <= 100,
    );
    let total = 0;
    let previousPlant = 0n;
    result.especies.forEach((value) => {
      const species = object(value, ['planta_id', 'cantidad']);
      const plant = BigInt(id(species.planta_id));
      assert(plant > previousPlant);
      previousPlant = plant;
      assert(
        Number.isInteger(species.cantidad) &&
          (species.cantidad as number) > 0 &&
          (species.cantidad as number) <= 2147483647,
      );
      total += species.cantidad as number;
    });
    assert(total === result.cantidad_total_plantada);
  } else {
    object(result, ['tipo', 'cambios']);
    assert(
      result.tipo === 'ACCESO' &&
        Array.isArray(result.cambios) &&
        result.cambios.length >= 1 &&
        result.cambios.length <= 100,
    );
    let previousScope = 0n;
    result.cambios.forEach((value) => {
      const scope = object(value, ['subcampania_id', 'usuarios']);
      const currentScope = BigInt(id(scope.subcampania_id));
      assert(currentScope > previousScope);
      previousScope = currentScope;
      assert(
        Array.isArray(scope.usuarios) &&
          scope.usuarios.length ===
            (operation === 'REEMPLAZAR_ADMINISTRADOR' ? 2 : 1),
      );
      let previousUser = 0n;
      scope.usuarios.forEach((value) => {
        const user = object(value, [
          'usuario_id',
          'permiso_anterior',
          'permiso_nuevo',
          'revision_anterior',
          'revision_nueva',
          'cambio',
          'conserva_acceso_global',
        ]);
        const currentUser = BigInt(id(user.usuario_id));
        assert(currentUser > previousUser);
        previousUser = currentUser;
        revision(user.revision_anterior);
        revision(user.revision_nueva);
        assert(
          permissions.includes(user.permiso_anterior as string | null) &&
            permissions.includes(user.permiso_nuevo as string | null),
        );
        assert(
          typeof user.conserva_acceso_global === 'boolean' &&
            ['CAMBIO_APLICADO', 'SIN_CAMBIOS'].includes(user.cambio as string),
        );
      });
    });
  }
}
export function validateRpcReply(
  value: unknown,
  command: string,
  operation: string,
  recovery = false,
): RpcReply {
  const reply = object(value, ['http_status', 'body']);
  const body = object(reply.body);
  assert(
    typeof reply.http_status === 'number' &&
      Number.isInteger(reply.http_status),
  );
  if ('resultado_concluyente' in body) {
    object(body, ['error', 'comando_id', 'resultado_concluyente']);
    validateStableError(body.error);
    assert(
      body.resultado_concluyente === false &&
        body.comando_id === command &&
        [401, 403, 404, 409, 422, 503].includes(reply.http_status),
    );
  } else {
    object(body, [
      'comando_id',
      'operacion',
      'estado',
      'resultado',
      'error',
      'finalizado_en',
    ]);
    assert(
      body.comando_id === command &&
        body.operacion === operation &&
        COMMAND_OPERATIONS.includes(
          operation as (typeof COMMAND_OPERATIONS)[number],
        ),
    );
    if (body.estado === 'SIN_RESULTADO') {
      assert(
        recovery &&
          reply.http_status === 202 &&
          body.resultado === null &&
          body.error === null &&
          body.finalizado_en === null,
      );
    } else {
      instant(body.finalizado_en);
      if (body.estado === 'CONFIRMADO') {
        assert(reply.http_status === 200 && body.error === null);
        validateResult(body.resultado, operation);
      } else {
        assert(body.estado === 'RECHAZADO' && body.resultado === null);
        validateStableError(body.error);
        assert(
          recovery
            ? reply.http_status === 200
            : [403, 404, 409, 422, 503].includes(reply.http_status),
        );
      }
    }
  }
  return { http_status: reply.http_status, body };
}
export function validateAuthorityReply(value: unknown): RpcReply {
  const reply = object(value, ['http_status', 'body']);
  const body = object(reply.body);
  assert(typeof reply.http_status === 'number');
  if ('resultado_concluyente' in body) {
    object(body, ['error', 'comando_id', 'resultado_concluyente']);
    validateStableError(body.error);
    assert(
      body.comando_id === null &&
        body.resultado_concluyente === false &&
        [401, 403, 404].includes(reply.http_status),
    );
  } else {
    object(body, ['data', 'observado_en']);
    const authority = object(body.data, [
      'usuario_id',
      'nombre',
      'rol_global',
      'activo',
      'revision_autoridad',
    ]);
    instant(body.observado_en);
    assert(reply.http_status === 200);
    id(authority.usuario_id);
    revision(authority.revision_autoridad);
    assert(
      typeof authority.nombre === 'string' &&
        roles.includes(authority.rol_global as string) &&
        typeof authority.activo === 'boolean',
    );
  }
  return { http_status: reply.http_status, body };
}
