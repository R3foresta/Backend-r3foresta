import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Se requiere al menos una evidencia para EMBOLSADO',
  })
  @ArrayUnique({ message: 'evidencia_ids no debe contener IDs duplicados' })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  evidencia_ids: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
