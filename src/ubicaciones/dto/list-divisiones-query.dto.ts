import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListDivisionesQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'pais_id debe ser un entero' })
  @Min(1, { message: 'pais_id debe ser mayor a 0' })
  pais_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parent_id debe ser un entero' })
  @Min(1, { message: 'parent_id debe ser mayor a 0' })
  parent_id?: number;
}

