import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEvidenciaRecoleccionDto {
  @ApiPropertyOptional({
    description: 'Título base para las evidencias a registrar',
    example: 'Seguimiento de lote',
    maxLength: 120,
  })
  @IsOptional()
  @IsString({ message: 'titulo debe ser texto' })
  @MaxLength(120, { message: 'titulo no puede superar 120 caracteres' })
  titulo?: string;

  @ApiPropertyOptional({
    description: 'Descripción de la evidencia',
    example: 'Fotos de control posterior a recolección',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres' })
  descripcion?: string;

  @ApiPropertyOptional({
    description:
      'Metadata en formato JSON serializado (string). Ej: {"fuente":"app-mobile"}',
    example: '{"fuente":"app-mobile","dispositivo":"android"}',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'metadata debe ser un JSON serializado en texto' })
  metadata?: string;

  @ApiPropertyOptional({
    description: 'Fecha/hora en la que fue tomada la evidencia',
    type: String,
    format: 'date-time',
    example: '2026-03-05T10:15:00-04:00',
  })
  @IsOptional()
  @IsDateString({}, { message: 'tomado_en debe ser una fecha ISO válida' })
  tomado_en?: string;

  @ApiPropertyOptional({
    description:
      'Si se envía true, la primera foto del lote se marcará como principal',
    example: true,
    type: Boolean,
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'si', 'sí'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }

    return value;
  })
  @IsOptional()
  @IsBoolean({ message: 'es_principal debe ser booleano' })
  es_principal?: boolean;
}
