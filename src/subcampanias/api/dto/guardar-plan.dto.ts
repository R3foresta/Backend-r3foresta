import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsPositive,
  Max,
  ValidateNested,
} from 'class-validator';

export class MetaEspeciePlanItemDto {
  @IsInt()
  @IsPositive()
  planta_id!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  porcentaje_objetivo!: number;

  @IsInt()
  @IsPositive()
  cantidad_objetivo!: number;
}

export class GuardarPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MetaEspeciePlanItemDto)
  metas!: MetaEspeciePlanItemDto[];
}
