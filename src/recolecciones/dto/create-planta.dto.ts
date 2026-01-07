import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { FuentePlanta } from '../enums/fuente-planta.enum';

export class CreatePlantaDto {
  @IsNotEmpty({ message: 'La especie es requerida' })
  @IsString()
  especie: string;

  @IsNotEmpty({ message: 'El nombre científico es requerido' })
  @IsString()
  nombre_cientifico: string;

  @IsNotEmpty({ message: 'La variedad es requerida' })
  @IsString()
  variedad: string;

  @IsOptional()
  @IsString()
  tipo_planta?: string;

  @IsOptional()
  @IsString()
  tipo_planta_otro?: string;

  @IsNotEmpty({ message: 'La fuente es requerida' })
  @IsEnum(FuentePlanta, {
    message: 'La fuente debe ser NATIVA, INTRODUCIDA o ENDEMICA',
  })
  fuente: FuentePlanta;
}
