import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUbicacionDto {
  @ApiPropertyOptional({
    description: 'País donde se realizó la recolección',
    example: 'Bolivia',
  })
  @IsOptional()
  @IsString()
  pais?: string;

  @ApiPropertyOptional({
    description: 'Departamento o estado',
    example: 'Santa Cruz',
  })
  @IsOptional()
  @IsString()
  departamento?: string;

  @ApiPropertyOptional({
    description: 'Provincia',
    example: 'Velasco',
  })
  @IsOptional()
  @IsString()
  provincia?: string;

  @ApiPropertyOptional({
    description: 'Comunidad o localidad',
    example: 'San Ignacio',
  })
  @IsOptional()
  @IsString()
  comunidad?: string;

  @ApiPropertyOptional({
    description: 'Zona específica dentro de la comunidad',
    example: 'Central',
  })
  @IsOptional()
  @IsString()
  zona?: string;

  @ApiProperty({
    description: 'Latitud geográfica (debe estar entre -90 y 90)',
    example: -16.5833,
    type: Number,
    minimum: -90,
    maximum: 90,
  })
  @IsNotEmpty({ message: 'La latitud es requerida' })
  @IsNumber({}, { message: 'La latitud debe ser un número' })
  @Min(-90, { message: 'La latitud debe estar entre -90 y 90' })
  @Max(90, { message: 'La latitud debe estar entre -90 y 90' })
  latitud: number;

  @ApiProperty({
    description: 'Longitud geográfica (debe estar entre -180 y 180)',
    example: -68.15,
    type: Number,
    minimum: -180,
    maximum: 180,
  })
  @IsNotEmpty({ message: 'La longitud es requerida' })
  @IsNumber({}, { message: 'La longitud debe ser un número' })
  @Min(-180, { message: 'La longitud debe estar entre -180 y 180' })
  @Max(180, { message: 'La longitud debe estar entre -180 y 180' })
  longitud: number;
}
