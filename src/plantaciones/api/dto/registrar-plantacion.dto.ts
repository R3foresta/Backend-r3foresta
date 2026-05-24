import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DetallePlantacionDto } from './detalle-plantacion.dto';

export class RegistrarPlantacionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subcampania_id: number;

  @IsOptional()
  @IsBoolean()
  es_reposicion?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  registro_plantacion_origen_id?: number;

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
  @IsInt({ each: true })
  coresponsable_ids?: number[];

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
  @IsInt({ each: true })
  evidencia_ids: number[];
}
