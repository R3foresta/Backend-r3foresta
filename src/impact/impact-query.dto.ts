import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ImpactMonitoringTimelineQueryDto {
  @ApiPropertyOptional({
    description: 'Limita la serie a una campaña asociada a la organización.',
    type: Number,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'campaignId debe ser un entero.' })
  @Min(1, { message: 'campaignId debe ser mayor o igual a 1.' })
  campaignId?: number;
}

export class ImpactEvidenceQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero.' })
  @Min(1, { message: 'page debe ser mayor o igual a 1.' })
  page = 1;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 100, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un entero.' })
  @Min(1, { message: 'pageSize debe ser mayor o igual a 1.' })
  @Max(100, { message: 'pageSize debe ser menor o igual a 100.' })
  pageSize = 24;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'campaignId debe ser un entero.' })
  @Min(1, { message: 'campaignId debe ser mayor o igual a 1.' })
  campaignId?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'speciesId debe ser un entero.' })
  @Min(1, { message: 'speciesId debe ser mayor o igual a 1.' })
  speciesId?: number;

  @ApiPropertyOptional({
    description: 'Fecha ISO mínima de la evidencia, inclusive.',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'from debe ser una fecha ISO válida.' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha ISO máxima de la evidencia, inclusive.',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString({}, { message: 'to debe ser una fecha ISO válida.' })
  to?: string;
}
