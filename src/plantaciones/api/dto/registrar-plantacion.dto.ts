import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BigintId } from '../../../common/dto/bigint-id';
import { DetallePlantacionDto } from './detalle-plantacion.dto';

export class RegistrarPlantacionDto {
  @BigintId()
  subcampania_id: number | string;

  @IsOptional()
  @IsBoolean()
  es_reposicion?: boolean;

  @IsOptional()
  @BigintId()
  registro_plantacion_origen_id?: number | string;

  @IsDateString()
  fecha_plantacion: string;

  @Type(() => Number)
  @IsLatitude()
  latitud: number;

  @Type(() => Number)
  @IsLongitude()
  longitud: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @IsOptional()
  @IsArray()
  @BigintId(true)
  coresponsable_ids?: (number | string)[];

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Debe enviarse al menos un detalle de plantacion.',
  })
  @ValidateNested({ each: true })
  @Type(() => DetallePlantacionDto)
  detalles: DetallePlantacionDto[];

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Debe vincularse al menos una evidencia previamente subida.',
  })
  @BigintId(true)
  evidencia_ids: (number | string)[];
}
