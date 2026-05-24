import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class DetallePlantacionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  asignacion_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  lote_vivero_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  planta_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;
}
