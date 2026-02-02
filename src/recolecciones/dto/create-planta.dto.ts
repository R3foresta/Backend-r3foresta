import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuentePlanta } from '../enums/fuente-planta.enum';

export class CreatePlantaDto {
  @ApiProperty({
    description: 'Nombre común de la especie',
    example: 'Jacarandá',
  })
  @IsNotEmpty({ message: 'La especie es requerida' })
  @IsString()
  especie: string;

  @ApiProperty({
    description: 'Nombre científico de la especie',
    example: 'Jacaranda mimosifolia',
  })
  @IsNotEmpty({ message: 'El nombre científico es requerido' })
  @IsString()
  nombre_cientifico: string;

  @ApiProperty({
    description: 'Variedad de la planta',
    example: 'Común',
  })
  @IsNotEmpty({ message: 'La variedad es requerida' })
  @IsString()
  variedad: string;

  @ApiPropertyOptional({
    description: 'Tipo de planta (Árbol, Arbusto, Herbácea, etc.)',
    example: 'Árbol',
  })
  @IsOptional()
  @IsString()
  tipo_planta?: string;

  @ApiPropertyOptional({
    description: 'Especificar si tipo_planta es "Otro"',
    example: 'Palmera',
  })
  @IsOptional()
  @IsString()
  tipo_planta_otro?: string;

  @ApiProperty({
    description: 'Origen de la especie',
    enum: FuentePlanta,
    example: FuentePlanta.NATIVA,
  })
  @IsNotEmpty({ message: 'La fuente es requerida' })
  @IsEnum(FuentePlanta, {
    message: 'La fuente debe ser NATIVA, INTRODUCIDA o ENDEMICA',
  })
  fuente: FuentePlanta;
}
