import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsPositive,
  Max,
  Min,
  ValidateIf,
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
  @Max(2147483647)
  cantidad_objetivo!: number;
}

export class GuardarPlanDto {
  // BORRADOR conserva el payload histórico { metas }; ACTIVA exige ambos.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @IsPositive()
  @Max(2147483647)
  meta_total_arboles?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  revision_esperada?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MetaEspeciePlanItemDto)
  metas!: MetaEspeciePlanItemDto[];
}
