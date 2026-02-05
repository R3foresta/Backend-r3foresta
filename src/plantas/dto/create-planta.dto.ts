import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

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

  @IsInt({ message: 'tipo_planta_id debe ser un número entero' })
  @IsNotEmpty({ message: 'tipo_planta_id es obligatorio' })
  tipo_planta_id: number;

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
