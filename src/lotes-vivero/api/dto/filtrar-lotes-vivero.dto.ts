import { BigintId } from '../../../common/dto/bigint-id';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EstadoLoteVivero } from '../../domain/enums/estado-lote-vivero.enum';
import { MotivoCierreLote } from '../../domain/enums/motivo-cierre-lote.enum';

export class FiltrarLotesViveroDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsEnum(EstadoLoteVivero)
  estado_lote?: EstadoLoteVivero;

  @IsOptional()
  @BigintId()
  vivero_id?: number | string;

  @IsOptional()
  @BigintId()
  recoleccion_id?: number | string;

  @IsOptional()
  @BigintId()
  lote_vivero_id?: number | string;

  @IsOptional()
  @IsEnum(MotivoCierreLote)
  motivo_cierre?: MotivoCierreLote;

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @BigintId()
  subcampania_id?: number | string;
}
