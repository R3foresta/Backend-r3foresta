import {
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoMaterial } from '../enums/tipo-material.enum';
import { EstadoRecoleccion } from '../enums/estado-recoleccion.enum';

export class FiltersRecoleccionDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  usuario_id?: number;

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @IsOptional()
  @IsEnum(EstadoRecoleccion)
  estado?: EstadoRecoleccion;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vivero_id?: number;

  @IsOptional()
  @IsEnum(TipoMaterial)
  tipo_material?: TipoMaterial;

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
  q?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
