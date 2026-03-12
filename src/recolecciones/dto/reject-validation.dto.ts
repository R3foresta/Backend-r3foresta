import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectValidationDto {
  @ApiProperty({
    description: 'Motivo del rechazo de la recolección',
    example: 'Datos incompletos o inconsistentes',
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'El motivo de rechazo es requerido' })
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(500, {
    message: 'El motivo no puede superar 500 caracteres',
  })
  motivo_rechazo: string;
}
