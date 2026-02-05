import { IsString, IsNotEmpty } from 'class-validator';

export class CreateTipoPlantaDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del tipo de planta es obligatorio' })
  nombre: string;
}
