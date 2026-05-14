import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

function transformOptionalBoolean(value: unknown): unknown {
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

export class UpdatePlantaDto {
  @ApiPropertyOptional({ example: 'Caoba' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'especie debe ser texto' })
  @IsNotEmpty({ message: 'especie no puede ser vacio' })
  @MaxLength(120)
  especie?: string;

  @ApiPropertyOptional({ example: 'Swietenia macrophylla' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'nombre_cientifico debe ser texto' })
  @IsNotEmpty({ message: 'nombre_cientifico no puede ser vacio' })
  @MaxLength(160)
  nombre_cientifico?: string;

  @ApiPropertyOptional({ example: 'Hondurena' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'variedad debe ser texto' })
  @IsNotEmpty({ message: 'variedad no puede ser vacia' })
  @MaxLength(120)
  variedad?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tipo_planta_id debe ser un entero' })
  @Min(1, { message: 'tipo_planta_id debe ser mayor a 0' })
  tipo_planta_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'nombre_comun_principal debe ser texto' })
  @MaxLength(120)
  nombre_comun_principal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'nombres_comunes debe ser texto' })
  @MaxLength(255)
  nombres_comunes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'notas debe ser texto' })
  @MaxLength(2000)
  notas?: string;

  @ApiPropertyOptional({
    description:
      'Si true reactiva una planta previamente desactivada. Usar PATCH /:id/desactivar para desactivar.',
  })
  @IsOptional()
  @Transform(({ value }) => transformOptionalBoolean(value))
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;
}
