import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CausaMermaVivero } from '../../domain/enums/causa-merma-vivero.enum';

export class RegistrarMermaDto {
  @IsDateString()
  fecha_evento: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad_afectada: number;

  @IsEnum(CausaMermaVivero)
  causa_merma: CausaMermaVivero;

  @IsArray()
  @ArrayMinSize(1, { message: 'Se requiere al menos una evidencia para MERMA' })
  @IsInt({ each: true })
  evidencia_ids: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
