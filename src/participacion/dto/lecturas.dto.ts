import { UnprocessableEntityException } from '@nestjs/common';
import { positiveId } from '../../users/perfil-v1.dto';

export type PermisoContextual = 'PLANTADOR' | 'ADMINISTRADOR_SUBCAMPANIA';
export type AccionBusqueda =
  | 'OTORGAR_PLANTADOR'
  | 'DESIGNAR_ADMINISTRADOR'
  | 'REEMPLAZAR_ADMINISTRADOR';
export type PersonaMinima = {
  usuario_id: string;
  nombre: string;
  organizacion: string | null;
};
export type PaginaLectura = { cursor: string | null; limite: number };
export type CapacidadesQuery = PaginaLectura & { campania_id: string | null };
export type BuscarPersonasEntrada = PaginaLectura & {
  modo: 'NOMBRE' | 'CORREO_EXACTO';
  consulta: string;
  accion: AccionBusqueda;
  subcampania_ids: string[];
};
export type RevisarAccesosEntrada = {
  usuario_destino_id: string;
  subcampania_ids: string[];
};
export type MiembroParticipacion = PersonaMinima & {
  permiso_contextual: PermisoContextual | null;
  revision_permiso: string;
  acceso_global: boolean;
  etiqueta_acceso_global: 'Administrador · Acceso global' | null;
  responsabilidad_logistica: 'COORDINADOR' | 'OPERARIO' | null;
};
export type AccionesParticipacion = {
  preparar_registro: boolean;
  registrar_inicial: boolean;
  incorporar_plantador: boolean;
  retirar_plantador: boolean;
  designar_administrador: boolean;
  cambiar_administrador: boolean;
  retirar_administrador: boolean;
  reemplazar_administrador: boolean;
};
export type CapacidadSubcampania = {
  campania_id: string;
  campania_nombre: string;
  subcampania_id: string;
  nombre: string;
  estado: string;
  permiso_contextual: PermisoContextual | null;
  revision_permiso: string;
  fuente_autoridad: 'GLOBAL' | 'CONTEXTUAL';
  acciones: AccionesParticipacion;
};

function invalid(message: string): never {
  throw new UnprocessableEntityException({
    codigo: 'ENTRADA_INVALIDA',
    message,
  });
}

function object(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalid('Se requiere un objeto.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new UnprocessableEntityException({
      codigo: 'CAMPO_NO_PERMITIDO',
      message: 'Campo no permitido.',
    });
  return value;
}

export function parseAmbitosIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    invalid('Se requieren entre 1 y 100 ámbitos.');
  const ids = value.map(positiveId);
  if (new Set(ids).size !== ids.length)
    invalid('Los ámbitos deben ser únicos.');
  return ids;
}

function pagination(
  value: Record<string, unknown>,
  maximum: number,
  fromQuery: boolean,
): PaginaLectura {
  let limite = 20;
  if (value.limite !== undefined) {
    if (
      fromQuery
        ? typeof value.limite !== 'string' ||
          !/^[1-9][0-9]*$/.test(value.limite)
        : typeof value.limite !== 'number'
    )
      invalid('Límite inválido.');
    limite = Number(value.limite);
    if (!Number.isInteger(limite) || limite < 1 || limite > maximum)
      invalid(`Límite fuera de rango 1..${maximum}.`);
  }
  const cursor = value.cursor === undefined ? null : value.cursor;
  if (
    value.cursor !== undefined &&
    (typeof cursor !== 'string' || !cursor || cursor.length > 1024)
  )
    invalid('Cursor inválido.');
  return { limite, cursor: cursor as string | null };
}

export function parseCapacidadesQuery(input: unknown): CapacidadesQuery {
  const value = object(input, ['campania_id', 'cursor', 'limite']);
  return {
    ...pagination(value, 100, true),
    campania_id:
      value.campania_id === undefined ? null : positiveId(value.campania_id),
  };
}

export function parseMiembrosQuery(input: unknown): PaginaLectura {
  return pagination(object(input, ['cursor', 'limite']), 100, true);
}

export function parseBuscarPersonas(input: unknown): BuscarPersonasEntrada {
  const value = object(input, [
    'modo',
    'consulta',
    'accion',
    'subcampania_ids',
    'cursor',
    'limite',
  ]);
  if (value.modo !== 'NOMBRE' && value.modo !== 'CORREO_EXACTO')
    invalid('Modo inválido.');
  if (
    ![
      'OTORGAR_PLANTADOR',
      'DESIGNAR_ADMINISTRADOR',
      'REEMPLAZAR_ADMINISTRADOR',
    ].includes(value.accion as string)
  )
    invalid('Acción inválida.');
  if (typeof value.consulta !== 'string') invalid('Consulta inválida.');
  const consulta =
    value.modo === 'NOMBRE'
      ? value.consulta.normalize('NFC').trim()
      : value.consulta.trim();
  const length = [...consulta].length;
  if (
    value.modo === 'NOMBRE'
      ? length < 2 || length > 100
      : length < 1 || length > 254
  )
    invalid('Consulta fuera de rango.');
  return {
    ...pagination(value, 20, false),
    modo: value.modo,
    consulta,
    accion: value.accion as AccionBusqueda,
    subcampania_ids: parseAmbitosIds(value.subcampania_ids),
  };
}

export function parseRevisarAccesos(input: unknown): RevisarAccesosEntrada {
  const value = object(input, ['usuario_destino_id', 'subcampania_ids']);
  return {
    usuario_destino_id: positiveId(value.usuario_destino_id),
    subcampania_ids: parseAmbitosIds(value.subcampania_ids),
  };
}
