import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateFlexDivisionDto {
  @Type(() => Number)
  @IsInt({ message: 'pais_id debe ser un entero' })
  @Min(1, { message: 'pais_id debe ser mayor a 0' })
  pais_id: number;

  @Type(() => Number)
  @IsInt({ message: 'parent_id debe ser un entero' })
  @Min(1, { message: 'parent_id debe ser mayor a 0' })
  parent_id: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es requerido' })
  @MaxLength(120, { message: 'nombre no puede superar 120 caracteres' })
  nombre: string;
}

