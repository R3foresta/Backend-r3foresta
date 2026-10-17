import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Solo los abortos técnicos de las mutaciones compartidas de INT02-D. */
export function throwSharedMutationFailure(error: {
  code?: string;
  message?: string;
}): void {
  if (error.code === 'PT403') {
    throw new ForbiddenException(
      error.message || 'La cuenta ya no puede operar.',
    );
  }
  if (['55P03', '57014', '40P01', '40001'].includes(error.code ?? '')) {
    throw new ServiceUnavailableException({
      error: {
        codigo: 'RESULTADO_NO_DETERMINADO',
        mensaje:
          'La operación no pudo confirmarse. Consulta su estado antes de repetir.',
        resultado_concluyente: false,
      },
    });
  }
}
