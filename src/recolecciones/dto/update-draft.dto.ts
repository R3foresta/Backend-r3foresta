import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TIPOS_MATERIAL_RECOLECCION_INPUT,
  UNIDADES_CANONICAS_RECOLECCION,
} from './create-recoleccion.dto';
import type { TipoMaterialRecoleccionInput } from './create-recoleccion.dto';
import type { UnidadCanonicaRecoleccion } from './create-recoleccion.dto';

export class UpdateDraftDto {
  @ApiPropertyOptional({
    description: 'Fecha de recolección',
    example: '2026-03-04',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser válida' })
  fecha?: string;

  @ApiPropertyOptional({
    description: 'Cantidad canónica inicial',
    example: 2.5,
  })
  @IsOptional()
  @IsNumber({}, { message: 'cantidad_inicial_canonica debe ser un número' })
  @Min(0.01, { message: 'cantidad_inicial_canonica debe ser mayor a 0' })
  cantidad_inicial_canonica?: number;

  @ApiPropertyOptional({
    description: 'Unidad canónica inicial (G o UNIDAD)',
    enum: UNIDADES_CANONICAS_RECOLECCION,
    example: 'G',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'unidad_canonica debe ser texto' })
  @IsIn(UNIDADES_CANONICAS_RECOLECCION, {
    message: 'unidad_canonica debe ser G o UNIDAD',
  })
  unidad_canonica?: UnidadCanonicaRecoleccion;

  @ApiPropertyOptional({
    description: 'Tipo de material',
    enum: TIPOS_MATERIAL_RECOLECCION_INPUT,
    example: 'SEMILLA',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(TIPOS_MATERIAL_RECOLECCION_INPUT, {
    message: 'tipo_material debe ser SEMILLA o ESQUEJE',
  })
  tipo_material?: TipoMaterialRecoleccionInput;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales',
    example: 'Actualización de datos',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las observaciones no pueden superar 1000 caracteres',
  })
  observaciones?: string;

  @ApiPropertyOptional({
    description: 'ID del vivero',
    example: 3,
  })
  @IsOptional()
  @IsNumber({}, { message: 'vivero_id debe ser numérico' })
  vivero_id?: number;

  @ApiPropertyOptional({
    description: 'ID del método de recolección',
    example: 1,
  })
  @IsOptional()
  @IsNumber({}, { message: 'metodo_id debe ser numérico' })
  metodo_id?: number;

  @ApiPropertyOptional({
    description: 'ID de la planta',
    example: 10,
  })
  @IsOptional()
  @IsNumber({}, { message: 'planta_id debe ser numérico' })
  planta_id?: number;
}
