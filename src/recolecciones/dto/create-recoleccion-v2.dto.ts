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

export const TIPOS_MATERIAL_RECOLECCION_V2_INPUT = [
  'SEMILLA',
  'ESQUEJE',
  'ESTACA',
  'PLANTULA',
  'INJERTO',
] as const;

export type TipoMaterialRecoleccionV2Input =
  (typeof TIPOS_MATERIAL_RECOLECCION_V2_INPUT)[number];

export const TIPOS_MATERIAL_RECOLECCION_V2_CANONICO = [
  'SEMILLA',
  'ESQUEJE',
] as const;

export type TipoMaterialRecoleccionV2Canonico =
  (typeof TIPOS_MATERIAL_RECOLECCION_V2_CANONICO)[number];

export class CreateRecoleccionV2Dto {
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
    description: 'Cantidad de material recolectado (debe ser mayor a 0)',
    example: 2.5,
    type: Number,
    minimum: 0.01,
  })
  @IsNotEmpty({ message: 'La cantidad es requerida' })
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(0.01, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  @ApiProperty({
    description: 'Unidad reportada por el cliente (ej: g, kg, unidad)',
    example: 'kg',
    type: String,
  })
  @IsNotEmpty({ message: 'La unidad es requerida' })
  @IsString({ message: 'La unidad debe ser texto' })
  unidad: string;

  @ApiProperty({
    description:
      'Tipo de material. Se aceptan valores legacy temporalmente y se normalizan a SEMILLA/ESQUEJE.',
    enum: TIPOS_MATERIAL_RECOLECCION_V2_INPUT,
    example: 'SEMILLA',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'El tipo de material es requerido' })
  @IsIn(TIPOS_MATERIAL_RECOLECCION_V2_INPUT, {
    message: 'tipo_material debe ser SEMILLA, ESQUEJE, ESTACA, PLANTULA o INJERTO',
  })
  tipo_material: TipoMaterialRecoleccionV2Input;

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
    description: 'ID de planta existente. V2 consume nombre científico/comercial desde tabla planta.',
    example: 10,
    type: Number,
  })
  @IsNotEmpty({ message: 'planta_id es requerido' })
  @IsNumber({}, { message: 'planta_id debe ser numérico' })
  planta_id: number;
}
