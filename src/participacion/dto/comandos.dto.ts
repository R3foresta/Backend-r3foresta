import { HttpException } from '@nestjs/common';

export const ACCESS_OPERATIONS = [
  'OTORGAR_PLANTADOR',
  'RETIRAR_PLANTADOR',
  'DESIGNAR_ADMINISTRADOR',
  'CAMBIAR_ADMINISTRADOR_A_PLANTADOR',
  'RETIRAR_ADMINISTRADOR',
  'REEMPLAZAR_ADMINISTRADOR',
] as const;
export const COMMAND_OPERATIONS = [
  ...ACCESS_OPERATIONS,
  'CAMBIAR_ROL_GLOBAL',
  'INACTIVAR_CUENTA',
  'REGISTRAR_PLANTACION_INICIAL',
] as const;
export type AccessOperation = (typeof ACCESS_OPERATIONS)[number];
export type CommandOperation = (typeof COMMAND_OPERATIONS)[number];
export type ScopeRevision = {
  subcampania_id: string;
  revision_esperada: string;
};
export type ReplacementRevision = {
  subcampania_id: string;
  revision_saliente_esperada: string;
  revision_reemplazo_esperada: string;
};
export type AccessPayload = {
  usuario_destino_id: string;
  ambitos: ScopeRevision[];
};
export type ReplacementPayload = {
  usuario_saliente_id: string;
  usuario_reemplazo_id: string;
  tratamiento_saliente: 'PLANTADOR' | 'SIN_ACCESO';
  ambitos: ReplacementRevision[];
};
export type AuthorityPayload = {
  usuario_destino_id: string;
  revision_esperada: string;
  motivo: string;
  rol_global?: 'ADMIN' | 'GENERAL' | 'VALIDADOR' | 'VOLUNTARIO';
};

export function invalidInput(field: string, unknown = false): never {
  throw new HttpException(
    {
      error: {
        codigo: unknown ? 'CAMPO_NO_PERMITIDO' : 'ENTRADA_INVALIDA',
        mensaje: unknown
          ? 'La entrada contiene campos no permitidos.'
          : 'La entrada no cumple el contrato v1.',
        campos: [field],
        ambitos: [],
        reintento: 'NO_APLICA',
      },
      comando_id: null,
      resultado_concluyente: false,
    },
    422,
  );
}
export function strictObject(
  value: unknown,
  keys: readonly string[],
  field = 'body',
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalidInput(field);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !keys.includes(key)))
    invalidInput(field, true);
  return input;
}
export function id(value: unknown, field = 'id'): string {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]*$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    invalidInput(field);
  return value;
}
export function revision(value: unknown, field = 'revision_esperada'): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    value.length > 19 ||
    BigInt(value) > 9223372036854775807n
  )
    invalidInput(field);
  return value;
}
export function commandId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    invalidInput('comando_id');
  return value;
}
export function numericIdOrder(a: string, b: string): number {
  return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
}
function scopes<T extends ScopeRevision | ReplacementRevision>(
  value: unknown,
  replacement: boolean,
): T[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    invalidInput('ambitos');
  const parsed = value.map((item) => {
    const entry = strictObject(
      item,
      replacement
        ? [
            'subcampania_id',
            'revision_saliente_esperada',
            'revision_reemplazo_esperada',
          ]
        : ['subcampania_id', 'revision_esperada'],
      'ambitos',
    );
    const subcampania_id = id(entry.subcampania_id, 'ambitos.subcampania_id');
    return replacement
      ? {
          subcampania_id,
          revision_saliente_esperada: revision(
            entry.revision_saliente_esperada,
            'ambitos.revision_saliente_esperada',
          ),
          revision_reemplazo_esperada: revision(
            entry.revision_reemplazo_esperada,
            'ambitos.revision_reemplazo_esperada',
          ),
        }
      : {
          subcampania_id,
          revision_esperada: revision(entry.revision_esperada),
        };
  });
  if (
    new Set(parsed.map((entry) => entry.subcampania_id)).size !== parsed.length
  )
    invalidInput('ambitos');
  return parsed.sort((a, b) =>
    numericIdOrder(a.subcampania_id, b.subcampania_id),
  ) as T[];
}
export function parseAccess(body: unknown): {
  comando_id: string;
  payload: AccessPayload;
} {
  const input = strictObject(body, [
    'comando_id',
    'usuario_destino_id',
    'ambitos',
  ]);
  return {
    comando_id: commandId(input.comando_id),
    payload: {
      usuario_destino_id: id(input.usuario_destino_id, 'usuario_destino_id'),
      ambitos: scopes<ScopeRevision>(input.ambitos, false),
    },
  };
}
export function parseReplacement(body: unknown): {
  comando_id: string;
  payload: ReplacementPayload;
} {
  const input = strictObject(body, [
    'comando_id',
    'usuario_saliente_id',
    'usuario_reemplazo_id',
    'tratamiento_saliente',
    'ambitos',
  ]);
  const usuario_saliente_id = id(
    input.usuario_saliente_id,
    'usuario_saliente_id',
  );
  const usuario_reemplazo_id = id(
    input.usuario_reemplazo_id,
    'usuario_reemplazo_id',
  );
  if (usuario_saliente_id === usuario_reemplazo_id)
    invalidInput('usuario_reemplazo_id');
  if (
    input.tratamiento_saliente !== 'PLANTADOR' &&
    input.tratamiento_saliente !== 'SIN_ACCESO'
  )
    invalidInput('tratamiento_saliente');
  return {
    comando_id: commandId(input.comando_id),
    payload: {
      usuario_saliente_id,
      usuario_reemplazo_id,
      tratamiento_saliente: input.tratamiento_saliente,
      ambitos: scopes<ReplacementRevision>(input.ambitos, true),
    },
  };
}
export function parseAuthority(
  body: unknown,
  usuarioId: unknown,
  role: boolean,
): { comando_id: string; payload: AuthorityPayload } {
  const input = strictObject(
    body,
    role
      ? ['comando_id', 'rol_global', 'revision_esperada', 'motivo']
      : ['comando_id', 'revision_esperada', 'motivo'],
  );
  if (typeof input.motivo !== 'string') invalidInput('motivo');
  const motivo = input.motivo.normalize('NFC').trim();
  if ([...motivo].length < 3 || [...motivo].length > 1000)
    invalidInput('motivo');
  const payload: AuthorityPayload = {
    usuario_destino_id: id(usuarioId, 'usuario_id'),
    revision_esperada: revision(input.revision_esperada),
    motivo,
  };
  if (role) {
    if (
      !['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'].includes(
        input.rol_global as string,
      )
    )
      invalidInput('rol_global');
    payload.rol_global = input.rol_global as AuthorityPayload['rol_global'];
  }
  return { comando_id: commandId(input.comando_id), payload };
}
export function parseRecovery(
  uuid: unknown,
  query: unknown,
): { comando_id: string; operacion: CommandOperation } {
  const input = strictObject(query, ['operacion'], 'query');
  if (!COMMAND_OPERATIONS.includes(input.operacion as CommandOperation))
    invalidInput('operacion');
  return {
    comando_id: commandId(uuid),
    operacion: input.operacion as CommandOperation,
  };
}
