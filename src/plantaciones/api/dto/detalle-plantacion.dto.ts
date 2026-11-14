import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { BigintId } from '../../../common/dto/bigint-id';

export class DetallePlantacionDto {
  @BigintId()
  asignacion_id: number | string;

  @BigintId()
  lote_vivero_id: number | string;

  @BigintId()
  planta_id: number | string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad: number;
}
