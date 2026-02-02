import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  MaxLength,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateUbicacionDto } from './create-ubicacion.dto';
import { CreatePlantaDto } from './create-planta.dto';
import { TipoMaterial } from '../enums/tipo-material.enum';
import { EstadoRecoleccion } from '../enums/estado-recoleccion.enum';

export class CreateRecoleccionDto {
  @ApiProperty({
    description: 'Fecha de recolección (no puede ser futura ni mayor a 45 días atrás)',
    example: '2024-01-20',
    type: String,
    format: 'date',
  })
  @IsNotEmpty({ message: 'La fecha es requerida' })
  @IsDateString({}, { message: 'La fecha debe ser válida' })
  fecha: string;

  @ApiPropertyOptional({
    description: 'Nombre científico de la especie',
    example: 'Swietenia macrophylla',
  })
  @IsOptional()
  @IsString()
  nombre_cientifico?: string;

  @ApiPropertyOptional({
    description: 'Nombre comercial o común de la especie',
    example: 'Mara',
  })
  @IsOptional()
  @IsString()
  nombre_comercial?: string;

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
    description: 'Unidad de medida',
    example: 'kg',
    type: String,
  })
  @IsNotEmpty({ message: 'La unidad es requerida' })
  @IsString()
  unidad: string;

  @ApiProperty({
    description: 'Tipo de material vegetal recolectado',
    enum: TipoMaterial,
    example: TipoMaterial.SEMILLA,
  })
  @IsNotEmpty({ message: 'El tipo de material es requerido' })
  @IsEnum(TipoMaterial, {
    message: 'El tipo de material debe ser SEMILLA, ESTACA, PLANTULA o INJERTO',
  })
  tipo_material: TipoMaterial;

  @ApiPropertyOptional({
    description: 'Estado actual del material (default: ALMACENADO)',
    enum: EstadoRecoleccion,
    example: EstadoRecoleccion.ALMACENADO,
  })
  @IsOptional()
  @IsEnum(EstadoRecoleccion, {
    message:
      'El estado debe ser ALMACENADO, EN_PROCESO, UTILIZADO o DESCARTADO',
  })
  estado?: EstadoRecoleccion;

  @ApiProperty({
    description:
      'Indica si es una especie nueva. Si es true, se debe enviar nueva_planta. Si es false, se debe enviar planta_id',
    example: false,
    type: Boolean,
  })
  @IsNotEmpty({ message: 'El campo especie_nueva es requerido' })
  @IsBoolean({ message: 'especie_nueva debe ser verdadero o falso' })
  especie_nueva: boolean;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales sobre la recolección',
    example: 'Semillas en buen estado, bien conservadas',
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
  @IsNumber()
  vivero_id?: number;

  @ApiProperty({
    description: 'ID del método de recolección utilizado',
    example: 1,
    type: Number,
  })
  @IsNotEmpty({ message: 'El método de recolección es requerido' })
  @IsNumber()
  metodo_id: number;

  @ApiPropertyOptional({
    description: 'ID de planta existente (requerido si especie_nueva = false)',
    example: 10,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  planta_id?: number;

  @ApiPropertyOptional({
    description: 'Datos de nueva planta (requerido si especie_nueva = true)',
    type: CreatePlantaDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePlantaDto)
  nueva_planta?: CreatePlantaDto;
}
