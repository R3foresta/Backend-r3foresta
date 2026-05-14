import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePlantaDto {
  @ApiProperty({ description: 'Nombre comun de la especie', example: 'Caoba' })
  @Transform(trim)
  @IsString({ message: 'especie debe ser texto' })
  @IsNotEmpty({ message: 'especie es requerida' })
  @MaxLength(120, { message: 'especie no puede superar 120 caracteres' })
  especie: string;

  @ApiProperty({
    description: 'Nombre cientifico (binomio)',
    example: 'Swietenia macrophylla',
  })
  @Transform(trim)
  @IsString({ message: 'nombre_cientifico debe ser texto' })
  @IsNotEmpty({ message: 'nombre_cientifico es requerido' })
  @MaxLength(160, {
    message: 'nombre_cientifico no puede superar 160 caracteres',
  })
  nombre_cientifico: string;

  @ApiProperty({ description: 'Variedad especifica', example: 'Hondurena' })
  @Transform(trim)
  @IsString({ message: 'variedad debe ser texto' })
  @IsNotEmpty({ message: 'variedad es requerida' })
  @MaxLength(120, { message: 'variedad no puede superar 120 caracteres' })
  variedad: string;

  @ApiProperty({
    description: 'ID del tipo de planta (catalogo tipo_planta)',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'tipo_planta_id debe ser un entero' })
  @Min(1, { message: 'tipo_planta_id debe ser mayor a 0' })
  tipo_planta_id: number;

  @ApiPropertyOptional({
    description: 'Nombre comun principal en la region',
    example: 'Caoba',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'nombre_comun_principal debe ser texto' })
  @MaxLength(120)
  nombre_comun_principal?: string;

  @ApiPropertyOptional({
    description: 'Otros nombres comunes, separados por coma',
    example: 'Caoba, Mahogany',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'nombres_comunes debe ser texto' })
  @MaxLength(255)
  nombres_comunes?: string;

  @ApiPropertyOptional({ description: 'Notas adicionales' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'notas debe ser texto' })
  @MaxLength(2000)
  notas?: string;
}
