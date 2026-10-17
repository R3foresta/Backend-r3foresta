import { throwSharedMutationFailure } from '../../common/db/pa-shared-rpc-error';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

// El rechazo de negocio viene de la revalidación dentro de la transacción.
// Un timeout/abort no acredita un resultado terminal de una operación.
export function throwLifecycleRpcError(error: {
  code?: string;
  message?: string;
}): never {
  throwSharedMutationFailure(error);
  const message = error.message || 'No se pudo completar la operación.';
  if (error.code === 'P0002' || error.code === 'PT404')
    throw new NotFoundException(message);
  if (error.code === '42501' || error.code === 'PT403')
    throw new ForbiddenException(message);
  if (
    error.code === 'P0001' ||
    error.code === '23505' ||
    error.code === 'PT422'
  ) {
    throw new UnprocessableEntityException(message);
  }
  if (error.code === 'PT409') throw new ConflictException(message);
  if (error.code === 'PGRST202' || error.code === '42883') {
    throw new InternalServerErrorException(
      'La migración INT02-D no está disponible.',
    );
  }
  throw new BadRequestException(message);
}

export function lifecycleObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new InternalServerErrorException(
      'La operación no devolvió un resultado válido.',
    );
  }
  return data as Record<string, unknown>;
}
