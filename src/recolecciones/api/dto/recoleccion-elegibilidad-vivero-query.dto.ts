import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class RecoleccionElegibilidadViveroQueryDto {
  @ApiPropertyOptional({
    description:
      'Cantidad que se quiere consumir hacia vivero para evaluar elegibilidad exacta.',
    example: 250,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  cantidad_solicitada_vivero?: number;
}
