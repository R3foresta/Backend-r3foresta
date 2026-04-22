import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUbicacionDto } from './create-ubicacion.dto';

export const TIPOS_MATERIAL_RECOLECCION_INPUT = [
  'SEMILLA',
  'ESQUEJE',
] as const;

export type TipoMaterialRecoleccionInput =
  (typeof TIPOS_MATERIAL_RECOLECCION_INPUT)[number];

export const TIPOS_MATERIAL_RECOLECCION_CANONICO = [
  'SEMILLA',
  'ESQUEJE',
] as const;

export type TipoMaterialRecoleccionCanonico =
  (typeof TIPOS_MATERIAL_RECOLECCION_CANONICO)[number];

export const UNIDADES_CANONICAS_RECOLECCION = ['G', 'UNIDAD'] as const;

export type UnidadCanonicaRecoleccion =
  (typeof UNIDADES_CANONICAS_RECOLECCION)[number];

export class CreateRecoleccionDto {
  @ApiProperty({
    description: 'Fecha de recolección (no puede ser futura ni mayor a 45 días atrás)',
    example: '2026-03-04',
    type: String,
    format: 'date',
  })
  @IsNotEmpty({ message: 'La fecha es requerida' })
  @IsDateString({}, { message: 'La fecha debe ser válida' })
  fecha: string;

  @ApiProperty({
    description: 'Cantidad canónica inicial (debe ser mayor a 0)',
    example: 2.5,
    type: Number,
    minimum: 0.01,
  })
  @IsNotEmpty({ message: 'cantidad_inicial_canonica es requerida' })
  @IsNumber({}, { message: 'cantidad_inicial_canonica debe ser un número' })
  @Min(0.01, { message: 'cantidad_inicial_canonica debe ser mayor a 0' })
  cantidad_inicial_canonica: number;

  @ApiProperty({
    description: 'Unidad canónica inicial del material (G o UNIDAD)',
    example: 'G',
    type: String,
    enum: UNIDADES_CANONICAS_RECOLECCION,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'unidad_canonica es requerida' })
  @IsString({ message: 'unidad_canonica debe ser texto' })
  @IsIn(UNIDADES_CANONICAS_RECOLECCION, {
    message: 'unidad_canonica debe ser G o UNIDAD',
  })
  unidad_canonica: UnidadCanonicaRecoleccion;

  @ApiProperty({
    description: 'Tipo de material canónico del módulo de recolección',
    enum: TIPOS_MATERIAL_RECOLECCION_INPUT,
    example: 'SEMILLA',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'El tipo de material es requerido' })
  @IsIn(TIPOS_MATERIAL_RECOLECCION_INPUT, {
    message: 'tipo_material debe ser SEMILLA o ESQUEJE',
  })
  tipo_material: TipoMaterialRecoleccionInput;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales sobre la recolección',
    example: 'Muestra inicial de vivero para lote de pruebas',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las observaciones no pueden superar 1000 caracteres',
  })
  observaciones?: string;

  @ApiProperty({
    description: 'Datos de ubicación geográfica donde se realizó la recolección',
    type: CreateUbicacionDto,
  })
  @IsNotEmpty({ message: 'La ubicación es requerida' })
  @ValidateNested()
  @Type(() => CreateUbicacionDto)
  ubicacion: CreateUbicacionDto;

  @ApiPropertyOptional({
    description: 'ID del vivero al que se asignará la recolección',
    example: 3,
    type: Number,
  })
  @IsOptional()
  @IsNumber({}, { message: 'vivero_id debe ser numérico' })
  vivero_id?: number;

  @ApiProperty({
    description: 'ID del método de recolección utilizado',
    example: 1,
    type: Number,
  })
  @IsNotEmpty({ message: 'El método de recolección es requerido' })
  @IsNumber({}, { message: 'metodo_id debe ser numérico' })
  metodo_id: number;

  @ApiProperty({
    description:
      'ID de planta existente. La identidad vegetal canónica se consume desde planta al crear la recolección.',
    example: 10,
    type: Number,
  })
  @IsNotEmpty({ message: 'planta_id es requerido' })
  @IsNumber({}, { message: 'planta_id debe ser numérico' })
  planta_id: number;
}
