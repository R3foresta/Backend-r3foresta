import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

function transformBoolean(value: unknown, defaultValue: boolean): unknown {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
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

export class ListPlantasQueryDto {
  @IsOptional()
  @IsString({ message: 'q debe ser texto' })
  @MaxLength(120, { message: 'q no puede superar 120 caracteres' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero' })
  @Min(1, { message: 'page debe ser mayor a 0' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser mayor a 0' })
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => transformBoolean(value, false))
  @IsBoolean({ message: 'incluir_inactivas debe ser booleano' })
  incluir_inactivas?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tipo_planta_id debe ser un entero' })
  @Min(1, { message: 'tipo_planta_id debe ser mayor a 0' })
  tipo_planta_id?: number;
}
