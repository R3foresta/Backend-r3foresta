import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export function recoleccionRpcError(error: { code?: string }): never {
  switch (error.code) {
    case '42501':
      throw new ForbiddenException(
        'Acceso insuficiente. No se permite confirmar la recolección propia.',
      );
    case 'P0002':
      throw new NotFoundException('Recolección no encontrada.');
    case 'P0001':
    case '22023':
    case '23514':
      throw new BadRequestException(
        'La ficha no cumple el estado o los datos requeridos.',
      );
    case '40001':
      throw new ConflictException(
        'La ficha cambió. Consulte de nuevo antes de reintentar.',
      );
    default:
      throw new ServiceUnavailableException(
        'No se pudo determinar el resultado de la escritura. Consulte la ficha antes de repetir.',
      );
  }
}
export async function guardarRecoleccion(
  client: SupabaseClient,
  actor: number | string,
  accion: 'CREAR' | 'EDITAR' | 'FOTOS' | 'ENVIAR',
  id: number | string | null,
  revision: unknown,
  payload: Record<string, unknown>,
  fotos: Record<string, unknown>[] = [],
) {
  const { data, error } = (await client.rpc('m1_recoleccion_guardar', {
    p_actor_id: actor,
    p_accion: accion,
    p_recoleccion_id: id,
    p_revision_esperada: revision ?? '0',
    p_payload: payload,
    p_fotos: fotos,
  })) as { data: unknown; error: { code?: string } | null };
  if (error) recoleccionRpcError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new InternalServerErrorException(
      'Respuesta de escritura M1 inválida; consulte la ficha.',
    );
  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== 'number' ||
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    !Array.isArray(row.evidencia_ids) ||
    row.evidencia_ids.some(
      (value) =>
        typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0,
    )
  )
    throw new InternalServerErrorException(
      'Respuesta de escritura M1 inválida; consulte la ficha.',
    );
  return { id: row.id, evidencia_ids: row.evidencia_ids as number[] };
}
