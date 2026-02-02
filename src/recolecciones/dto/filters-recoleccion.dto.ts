import {
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoMaterial } from '../enums/tipo-material.enum';
import { EstadoRecoleccion } from '../enums/estado-recoleccion.enum';

export class FiltersRecoleccionDto {
  @ApiPropertyOptional({
    description: 'ID del usuario (uso interno)',
    example: 10,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  usuario_id?: number;

  @ApiPropertyOptional({
    description: 'Fecha de inicio para el filtro de rango (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin para el filtro de rango (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de la recolección',
    enum: EstadoRecoleccion,
    example: EstadoRecoleccion.ALMACENADO,
  })
  @IsOptional()
  @IsEnum(EstadoRecoleccion)
  estado?: EstadoRecoleccion;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de vivero',
    example: 3,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vivero_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de material',
    enum: TipoMaterial,
    example: TipoMaterial.SEMILLA,
  })
  @IsOptional()
  @IsEnum(TipoMaterial)
  tipo_material?: TipoMaterial;

  @ApiPropertyOptional({
    description: 'Número de página (default: 1)',
    example: 1,
    type: Number,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Registros por página (default: 10, máximo: 50)',
    example: 10,
    type: Number,
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Búsqueda general (alias de search)',
    example: 'mara',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Buscar por nombre científico o comercial de la planta',
    example: 'ceibo',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
