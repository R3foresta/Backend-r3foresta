import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
} from 'class-validator';

export enum TipoMaterialOrigen {
  SEMILLA = 'SEMILLA',
  ESQUEJE = 'ESQUEJE',
}

export class CreatePlantaDto {
  @IsString()
  @IsNotEmpty()
  especie: string;

  @IsString()
  @IsNotEmpty()
  nombre_cientifico: string;

  @IsString()
  @IsNotEmpty()
  tipo_planta: string;

  @IsEnum(TipoMaterialOrigen)
  @IsOptional()
  fuente?: TipoMaterialOrigen;

  @IsString()
  @IsNotEmpty()
  nombres_comunes: string;

  @IsString()
  @IsOptional()
  imagen_url?: string;

  // Campos opcionales adicionales
  @IsString()
  @IsOptional()
  tipo_planta_otro?: string;

  @IsString()
  @IsOptional()
  nombre_comun_principal?: string;

  @IsString()
  @IsOptional()
  reino?: string;

  @IsString()
  @IsOptional()
  division?: string;

  @IsString()
  @IsOptional()
  clase?: string;

  @IsString()
  @IsOptional()
  orden?: string;

  @IsString()
  @IsOptional()
  familia?: string;

  @IsString()
  @IsOptional()
  genero?: string;

  @IsString()
  @IsOptional()
  origen_geografico?: string;

  @IsString()
  @IsOptional()
  habitat_descripcion?: string;

  @IsString()
  @IsOptional()
  descripcion_morfologica?: string;

  @IsString()
  @IsOptional()
  usos_industriales?: string;

  @IsString()
  @IsOptional()
  usos_medicinales?: string;

  @IsString()
  @IsOptional()
  usos_ornamentales?: string;

  @IsString()
  @IsOptional()
  advertencia_toxicidad?: string;

  @IsString()
  @IsOptional()
  notas_manejo_recoleccion?: string;
}
