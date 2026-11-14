import {
  applyDecorators,
  Injectable,
  PipeTransform,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { id } from '../../participacion/dto/comandos.dto';

export function exactId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return id(String(value));
  return id(value);
}
/** Compatibilidad JSON: conserva números seguros legados y cadenas para BIGINT mayores. */
export function compatibleId(value: unknown): number | string {
  const exacto = exactId(value);
  return BigInt(exacto) <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(exacto)
    : exacto;
}
/** Un ID ya redondeado al leer DB no permite concluir que una mutación falló. */
export function compatibleDatabaseId(value: unknown): number | string {
  try {
    return compatibleId(value);
  } catch {
    throw new ServiceUnavailableException({
      error: {
        codigo: 'RESULTADO_NO_DETERMINADO',
        resultado_concluyente: false,
        mensaje:
          'La respuesta contiene un ID inexacto; conserve la solicitud y consulte el resultado.',
      },
    });
  }
}
/** Acepta números legados seguros o cadenas BIGINT sin convertirlos a Number. */
export function BigintId(each = false): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      each && Array.isArray(value)
        ? value.map((v: unknown) =>
            typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : v,
          )
        : typeof value === 'number' && Number.isSafeInteger(value)
          ? String(value)
          : value,
    ),
    ValidateBy(
      {
        name: 'bigintId',
        validator: {
          validate: (v: unknown) => {
            try {
              id(v);
              return true;
            } catch {
              return false;
            }
          },
          defaultMessage: () =>
            'El ID debe ser decimal positivo exacto hasta BIGINT.',
        },
      },
      { each },
    ),
  );
}
@Injectable()
export class BigintIdPipe implements PipeTransform {
  transform(value: unknown): string {
    return exactId(value);
  }
}
