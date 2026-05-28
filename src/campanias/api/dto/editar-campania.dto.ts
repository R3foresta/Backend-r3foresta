import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TipoCampania } from '../../domain/enums/tipo-campania.enum';

export class EditarCampaniaDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @IsEnum(TipoCampania)
  tipo?: TipoCampania;

  @IsOptional()
  @IsDateString()
  fecha_estimada_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_estimada_fin?: string;
}
