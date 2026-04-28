import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearEvidenciaPendienteViveroDto {
  @IsOptional()
  @IsString({ message: 'titulo debe ser texto' })
  @MaxLength(120, { message: 'titulo no puede superar 120 caracteres' })
  titulo?: string;

  @IsOptional()
  @IsString({ message: 'descripcion debe ser texto' })
  @MaxLength(1000, { message: 'descripcion no puede superar 1000 caracteres' })
  descripcion?: string;

  @IsOptional()
  @IsString({ message: 'metadata debe ser un JSON serializado en texto' })
  metadata?: string;

  @IsOptional()
  @IsDateString({}, { message: 'tomado_en debe ser una fecha ISO valida' })
  tomado_en?: string;

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
