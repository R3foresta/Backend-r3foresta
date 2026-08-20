import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class RegistrarDesechoDto {
  @ApiProperty({
    description: 'Cantidad a desechar en la unidad canonica de la recoleccion',
    example: 50,
    minimum: 0.000001,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 6 },
    { message: 'La cantidad a desechar debe ser un numero valido.' },
  )
  @Min(0.000001, {
    message: 'La cantidad a desechar debe ser mayor que cero.',
  })
  cantidad: number;
}
