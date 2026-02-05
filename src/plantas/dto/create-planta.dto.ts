import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePlantaDto {
  @IsString()
  @IsNotEmpty()
  especie: string;

  @IsString()
  @IsNotEmpty()
  nombre_cientifico: string;

  @IsString()
  @IsNotEmpty()
  variedad: string;

  @IsString()
  @IsOptional()
  tipo_planta?: string;

  @IsString()
  @IsOptional()
  tipo_planta_otro?: string;

  @IsString()
  @IsOptional()
  nombre_comun_principal?: string;

  @IsString()
  @IsOptional()
  nombres_comunes?: string;

  @IsString()
  @IsOptional()
  imagen_url?: string;

  @IsString()
  @IsOptional()
  notas?: string;
}
