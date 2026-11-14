import { Transform } from 'class-transformer';
import { BigintId } from '../../../common/dto/bigint-id';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional } from 'class-validator';

export class DescartarEvidenciasPendientesPlantacionDto {
  @IsOptional()
  @BigintId()
  subcampania_id?: number | string;

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
  @BigintId(true)
  evidencia_ids: (number | string)[];
}
