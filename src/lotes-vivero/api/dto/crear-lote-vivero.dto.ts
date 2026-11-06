import { BigintId } from '../../../common/dto/bigint-id';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsDateString,
  IsEnum,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnidadMedidaVivero } from '../../domain/enums/unidad-medida-vivero.enum';

export class CrearLoteViveroDto {
  @BigintId()
  recoleccion_id: number | string;

  @BigintId()
  vivero_id: number | string;

  @IsDateString()
  fecha_inicio: string;

  @IsDateString()
  fecha_evento: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  cantidad_inicial_en_proceso: number;

  @IsEnum(UnidadMedidaVivero)
  unidad_medida_inicial: UnidadMedidaVivero;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @BigintId(true)
  evidencia_ids: (number | string)[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
