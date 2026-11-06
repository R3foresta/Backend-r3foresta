import { ForbiddenException } from '@nestjs/common';
import { throwSharedMutationFailure } from '../../common/db/pa-shared-rpc-error';
export function throwViveroMutationFailure(error: {
  code?: string;
  message?: string;
}): void {
  if (error.code === '42501')
    throw new ForbiddenException(
      'CAPACIDAD_INSUFICIENTE: ámbito o evidencia no autorizados.',
    );
  throwSharedMutationFailure(error);
}
