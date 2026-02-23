import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

function transformOptionalBoolean(value: unknown): boolean | unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }

  return value;
}

export class CreateComunidadDto {
  @Type(() => Number)
  @IsInt({ message: 'pais_id debe ser un entero' })
  @Min(1, { message: 'pais_id debe ser mayor a 0' })
  pais_id: number;

  @Type(() => Number)
  @IsInt({ message: 'municipio_id debe ser un entero' })
  @Min(1, { message: 'municipio_id debe ser mayor a 0' })
  municipio_id: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es requerido' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres' })
  nombre: string;

  @IsOptional()
  @Transform(({ value }) => transformOptionalBoolean(value))
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;
}
