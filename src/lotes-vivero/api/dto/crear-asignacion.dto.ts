import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PropositoAsignacion } from '../../domain/enums/proposito-asignacion.enum';

export class CrearAsignacionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subcampania_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad_asignada: number;

  @IsOptional()
  @IsEnum(PropositoAsignacion)
  proposito?: PropositoAsignacion;
}
