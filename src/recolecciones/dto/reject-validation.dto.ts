import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectValidationDto {
  @ApiProperty({
    description: 'Motivo del rechazo de la recolección',
    example: 'Datos incompletos o inconsistentes',
    minLength: 10,
    maxLength: 500,
  })
  @IsNotEmpty({ message: 'El motivo de rechazo es requerido' })
  @IsString({ message: 'El motivo debe ser texto' })
  @MinLength(10, {
    message: 'El motivo de rechazo debe tener al menos 10 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo no puede superar 500 caracteres',
  })
  motivo_rechazo: string;
}
