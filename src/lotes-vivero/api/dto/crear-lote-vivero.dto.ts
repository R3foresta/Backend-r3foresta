import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnidadMedidaVivero } from '../../domain/enums/unidad-medida-vivero.enum';

export class CrearLoteViveroDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recoleccion_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  vivero_id: number;

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

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
