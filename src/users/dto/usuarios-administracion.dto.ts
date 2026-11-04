import { UnprocessableEntityException } from '@nestjs/common';
import { strictObject } from '../../participacion/dto/comandos.dto';
import { parseMiembrosQuery } from '../../participacion/dto/lecturas.dto';

export const ROLES_GLOBALES = [
  'ADMIN',
  'GENERAL',
  'VALIDADOR',
  'VOLUNTARIO',
] as const;
export type RolGlobal = (typeof ROLES_GLOBALES)[number];
export type UsuariosAdministracionQuery = {
  consulta: string | null;
  rol_global: RolGlobal | null;
  cursor: string | null;
  limite: number;
};

export function parseUsuariosAdministracionQuery(
  input: unknown,
): UsuariosAdministracionQuery {
  const value = strictObject(
    input,
    ['consulta', 'rol_global', 'cursor', 'limite'],
    'query',
  );
  const invalid = (): never => {
    throw new UnprocessableEntityException({
      codigo: 'ENTRADA_INVALIDA',
      message: 'Consulta administrativa inválida.',
    });
  };
  let consulta: string | null = null;
  if (value.consulta !== undefined) {
    if (typeof value.consulta !== 'string') invalid();
    consulta = (value.consulta as string).normalize('NFC').trim();
    if ([...consulta].length < 2 || [...consulta].length > 100) invalid();
  }
  const rol_global = value.rol_global === undefined ? null : value.rol_global;
  if (
    value.rol_global !== undefined &&
    !ROLES_GLOBALES.includes(value.rol_global as RolGlobal)
  )
    invalid();
  // Reutiliza los límites de las lecturas privadas, sin aceptar campos extra.
  const pagination = parseMiembrosQuery({
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
    ...(value.limite === undefined ? {} : { limite: value.limite }),
  });
  if (pagination.limite > 20) invalid();
  return {
    ...pagination,
    consulta,
    rol_global: rol_global as RolGlobal | null,
  };
}
