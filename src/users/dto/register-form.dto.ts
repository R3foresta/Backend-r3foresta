import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';

export class RegisterFormDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  apellido: string;

  @IsString()
  @IsNotEmpty()
  doc_identidad: string;

  @IsOptional()
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'El wallet_address debe tener formato Ethereum (0x seguido de 40 carácteres hex)',
  })
  wallet_address?: string;

  @IsOptional()
  @IsString()
  organizacion?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+\d{7,15}$/, {
    message: 'El contacto debe tener formato internacional (e.g. +51999999999)',
  })
  contacto?: string;

  @IsOptional()
  @IsString()
  rol?: string = 'GENERAL';
}
