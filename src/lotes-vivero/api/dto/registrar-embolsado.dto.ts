import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegistrarEmbolsadoDto {
  @IsDateString()
  fecha_evento: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  plantas_vivas_iniciales: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
