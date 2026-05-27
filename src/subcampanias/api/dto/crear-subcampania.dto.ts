import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CrearSubcampaniaDto {
  @IsInt()
  @IsPositive()
  campania_id: number;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsInt()
  @IsPositive()
  zona_id: number;

  @IsInt()
  @Min(1)
  meta_total_arboles: number;

  @IsOptional()
  @IsDateString()
  fecha_estimada_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_estimada_fin?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  tolerancia_gps_metros?: number;
}
