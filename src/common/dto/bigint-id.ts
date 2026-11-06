import { applyDecorators, Injectable, PipeTransform } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { id } from '../../participacion/dto/comandos.dto';

export function exactId(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return id(String(value));
  return id(value);
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
