import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

export class DescartarEvidenciasPendientesPlantacionDto {
  @IsArray({ message: 'evidencia_ids debe ser un arreglo' })
  @ArrayMinSize(1, {
    message: 'Debe enviarse al menos una evidencia pendiente para descartar.',
  })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Cada evidencia_id debe ser entero' })
  @Min(1, { each: true, message: 'Cada evidencia_id debe ser mayor a 0' })
  evidencia_ids: number[];
}
