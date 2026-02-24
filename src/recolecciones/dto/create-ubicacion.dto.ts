import {
  IsNotEmpty,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min as MinValue,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FUENTES_UBICACION = ['GPS_MOVIL', 'MAPA', 'MANUAL', 'LEGACY'] as const;
export type FuenteUbicacion = (typeof FUENTES_UBICACION)[number];

export class CreateUbicacionDto {
  @ApiPropertyOptional({
    description: 'ID de país (catálogo pais)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'pais_id debe ser un entero' })
  @MinValue(1, { message: 'pais_id debe ser mayor a 0' })
  pais_id?: number;

  @ApiPropertyOptional({
    description: 'ID de división administrativa más específica conocida',
    example: 999,
  })
  @IsOptional()
  @IsInt({ message: 'division_id debe ser un entero' })
  @MinValue(1, { message: 'division_id debe ser mayor a 0' })
  division_id?: number;

  @ApiPropertyOptional({
    description: 'Nombre del sitio físico',
    example: 'Vivero Central',
  })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Referencia textual del sitio físico',
    example: 'Zona Sur',
  })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiPropertyOptional({
    description: 'Precisión en metros del punto capturado',
    example: 10,
    minimum: 0.000001,
  })
  @IsOptional()
  @IsNumber({}, { message: 'precision_m debe ser un número' })
  @MinValue(0.000001, { message: 'precision_m debe ser mayor a 0' })
  precision_m?: number;

  @ApiPropertyOptional({
    description: 'Fuente de captura de la ubicación',
    enum: FUENTES_UBICACION,
    example: 'GPS_MOVIL',
  })
  @IsOptional()
  @IsIn(FUENTES_UBICACION, {
    message: 'fuente debe ser GPS_MOVIL, MAPA, MANUAL o LEGACY',
  })
  fuente?: FuenteUbicacion;

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
