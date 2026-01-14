import { IsOptional, IsNumber, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { LoteFaseViveroEstado } from '../enums/lote-fase-vivero-estado.enum';

export class FiltersLoteFaseViveroDto {
  @IsOptional()
  @IsEnum(LoteFaseViveroEstado)
  estado?: LoteFaseViveroEstado;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vivero_id?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  planta_id?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  responsable_id?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}
