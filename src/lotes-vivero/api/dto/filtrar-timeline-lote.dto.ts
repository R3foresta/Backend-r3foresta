import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { TipoEventoVivero } from '../../domain/enums/tipo-evento-vivero.enum';

export class FiltrarTimelineLoteDto {
  @IsOptional()
  @IsEnum(TipoEventoVivero)
  tipo_evento?: TipoEventoVivero;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsable_id?: number;

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;
}
