import {
  IsString,
  IsEmail,
  IsOptional,
  IsObject,
  IsNotEmpty,
  validate,
} from 'class-validator';
import { plainToInstance, Transform } from 'class-transformer';
import { UnprocessableEntityException } from '@nestjs/common';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() : value,
  )
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsObject()
  @IsNotEmpty()
  registration: any;

  @IsString()
  @IsNotEmpty()
  challenge: string;
}

export async function parseRegisterDto(body: unknown): Promise<RegisterDto> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new UnprocessableEntityException({
      codigo: 'ENTRADA_INVALIDA',
      message: 'Se requiere un objeto.',
    });
  }
  const dto = plainToInstance(RegisterDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new UnprocessableEntityException({
      codigo: errors.some((error) => error.constraints?.whitelistValidation)
        ? 'CAMPO_NO_PERMITIDO'
        : 'ENTRADA_INVALIDA',
      message: 'Datos de alta inválidos.',
    });
  }
  return dto;
}
