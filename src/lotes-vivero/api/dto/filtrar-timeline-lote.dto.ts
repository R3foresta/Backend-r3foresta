import { BigintId } from '../../../common/dto/bigint-id';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
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
}
