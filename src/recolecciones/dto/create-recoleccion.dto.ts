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

export const UNIDADES_INPUT_RECOLECCION = ['KG', 'G', 'UNIDAD'] as const;

export type UnidadInputRecoleccion =
  (typeof UNIDADES_INPUT_RECOLECCION)[number];
import { TipoMaterial } from '../enums/tipo-material.enum';

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
    description: 'Unidad inicial del material. KG solo es input; se normaliza a G antes de persistir.',
    example: 'G',
    type: String,
    enum: UNIDADES_INPUT_RECOLECCION,
  })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsNotEmpty({ message: 'unidad_canonica es requerida' })
  @IsString({ message: 'unidad_canonica debe ser texto' })
  @IsIn(UNIDADES_INPUT_RECOLECCION, { message: 'unidad_canonica debe ser KG, G o UNIDAD' })
  unidad_canonica: UnidadInputRecoleccion;

  @ApiProperty({
    description: 'Tipo de material canónico del módulo de recolección',
    enum: TIPOS_MATERIAL_RECOLECCION_INPUT,
    example: 'SEMILLA',
  })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsNotEmpty({ message: 'El tipo de material es requerido' })
  @IsIn(TIPOS_MATERIAL_RECOLECCION_INPUT, { message: 'tipo_material debe ser SEMILLA o ESQUEJE' })
  tipo_material: TipoMaterialRecoleccionInput;

  @ApiProperty({
    description: 'ID de planta existente. Obligatorio para asegurar integridad botánica.',
    example: 10,
    type: Number,
  })
  @IsNotEmpty({ message: 'El planta_id es requerido.' })
  @IsNumber({}, { message: 'planta_id debe ser un número válido' })
  planta_id: number;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales sobre la recolección',
    example: 'Muestra inicial de lote',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Las observaciones no pueden superar 1000 caracteres' })
  observaciones?: string;

  @ApiProperty({
    description: 'Datos de ubicación geográfica',
    type: CreateUbicacionDto,
  })
  @IsNotEmpty({ message: 'La ubicación es requerida' })
  @ValidateNested()
  @Type(() => CreateUbicacionDto)
  ubicacion: CreateUbicacionDto;

  @ApiPropertyOptional({
    description: 'ID del vivero',
    example: 3,
    type: Number,
  })
  @IsOptional()
  @IsNumber({}, { message: 'vivero_id debe ser numérico' })
  vivero_id?: number;

  @ApiProperty({
    description: 'ID del método de recolección',
    example: 1,
    type: Number,
  })
  @IsNotEmpty({ message: 'El método de recolección es requerido' })
  @IsNumber({}, { message: 'metodo_id debe ser numérico' })
  metodo_id: number;
}
