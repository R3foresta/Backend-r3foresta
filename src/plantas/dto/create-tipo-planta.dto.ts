import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTipoPlantaDto {
  @ApiProperty({ description: 'Nombre del tipo de planta', example: 'Arbol' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es requerido' })
  @MaxLength(80, { message: 'nombre no puede superar 80 caracteres' })
  nombre: string;
}
