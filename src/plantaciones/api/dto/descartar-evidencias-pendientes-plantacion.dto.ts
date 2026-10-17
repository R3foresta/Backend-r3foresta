import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class DescartarEvidenciasPendientesPlantacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subcampania_id?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  es_reposicion?: boolean;

  @IsArray({ message: 'evidencia_ids debe ser un arreglo' })
  @ArrayMinSize(1, {
    message: 'Debe enviarse al menos una evidencia pendiente para descartar.',
  })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Cada evidencia_id debe ser entero' })
  @Min(1, { each: true, message: 'Cada evidencia_id debe ser mayor a 0' })
  evidencia_ids: number[];
}
