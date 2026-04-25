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

  // TODO: Revisar junto a la DB porque estamos hablando o de UNIDADES o G, y no permitir decimales en UNIDADES y como son semillas tampoco permitimemos decimales en G. No tiene sentido tener 0.5 UNIDADES y en gramos si podemos permitir un decimal como 7.5 G pero no 7.123123, no necesitamos esa precisión.
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
