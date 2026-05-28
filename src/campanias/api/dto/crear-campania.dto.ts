import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TipoCampania } from '../../domain/enums/tipo-campania.enum';

export class CrearCampaniaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsEnum(TipoCampania)
  tipo: TipoCampania;

  @IsOptional()
  @IsDateString()
  fecha_estimada_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_estimada_fin?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  organizacion_ids?: number[];
}
