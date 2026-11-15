import { BigintId } from '../../../common/dto/bigint-id';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TipoEventoVivero } from '../../domain/enums/tipo-evento-vivero.enum';

export class FiltrarTimelineLoteDto {
  @IsOptional()
  @IsEnum(TipoEventoVivero)
  tipo_evento?: TipoEventoVivero;

  @IsOptional()
  @BigintId()
  responsable_id?: number | string;

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}
