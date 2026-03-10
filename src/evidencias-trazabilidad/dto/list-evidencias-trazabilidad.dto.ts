import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

function toBoolean(value: unknown): unknown {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'si', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return value;
}

export class ListEvidenciasTrazabilidadDto {
  @ApiPropertyOptional({
    description: 'ID del tipo de entidad',
    example: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tipo_entidad_id debe ser numérico' })
  tipo_entidad_id?: number;

  @ApiPropertyOptional({
    description: 'Código del tipo de entidad (ej. RECOLECCION)',
    example: 'RECOLECCION',
  })
  @IsOptional()
  @IsString({ message: 'tipo_entidad_codigo debe ser texto' })
  tipo_entidad_codigo?: string;

  @ApiPropertyOptional({
    description: 'ID de la entidad relacionada',
    example: 123,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'entidad_id debe ser numérico' })
  entidad_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por código de trazabilidad',
    example: 'REC-2026-001',
  })
  @IsOptional()
  @IsString({ message: 'codigo_trazabilidad debe ser texto' })
  codigo_trazabilidad?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de archivo (ej. FOTO)',
    example: 'FOTO',
  })
  @IsOptional()
  @IsString({ message: 'tipo_archivo debe ser texto' })
  tipo_archivo?: string;

  @ApiPropertyOptional({
    description: 'Incluir evidencias eliminadas lógicamente',
    example: false,
    type: Boolean,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'incluir_eliminadas debe ser booleano' })
  incluir_eliminadas?: boolean = false;

  @ApiPropertyOptional({
    description: 'Filtrar por principalidad',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'es_principal debe ser booleano' })
  es_principal?: boolean;

  @ApiPropertyOptional({
    description: 'Página (default: 1)',
    example: 1,
    type: Number,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'page debe ser numérico' })
  @Min(1, { message: 'page debe ser mayor o igual a 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Límite de registros por página (max: 100)',
    example: 20,
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'limit debe ser numérico' })
  @Min(1, { message: 'limit debe ser mayor o igual a 1' })
  @Max(100, { message: 'limit debe ser menor o igual a 100' })
  limit?: number = 20;
}

