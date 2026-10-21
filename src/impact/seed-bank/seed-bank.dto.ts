import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { seedDate } from '../domain/policies/seed-bank.policy';

export class SeedBankQueryDto {
  @ApiPropertyOptional({ maxLength: 150 }) q?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1 }) speciesId?: number;
  @ApiPropertyOptional({ type: Number, minimum: 1 }) locationId?: number;
  @ApiPropertyOptional({ format: 'date' }) from?: string;
  @ApiPropertyOptional({ format: 'date' }) to?: string;
  @ApiPropertyOptional({ enum: ['with-link', 'without-link'] }) blockchain?:
    | 'with-link'
    | 'without-link';
  @ApiPropertyOptional({
    enum: ['date-desc', 'date-asc'],
    default: 'date-desc',
  })
  sort: 'date-desc' | 'date-asc' = 'date-desc';
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 }) page = 1;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 12 })
  pageSize = 12;
}

export function seedInputError(field: string): never {
  throw new BadRequestException(`Parámetro inválido: ${field}.`);
}
export function seedId(value: unknown, field = 'id'): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    seedInputError(field);
  return Number(value);
}
export function parseSeedQuery(
  value: Record<string, unknown>,
  list = true,
): SeedBankQueryDto {
  const allowed = list
    ? [
        'q',
        'speciesId',
        'locationId',
        'from',
        'to',
        'blockchain',
        'sort',
        'page',
        'pageSize',
      ]
    : [];
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) seedInputError(key);
  const result = new SeedBankQueryDto();
  for (const key of ['speciesId', 'locationId', 'page', 'pageSize'] as const) {
    if (value[key] !== undefined) result[key] = seedId(value[key], key);
  }
  if (
    result.pageSize > 100 ||
    !Number.isSafeInteger((result.page - 1) * result.pageSize)
  )
    seedInputError('pageSize/page');
  for (const key of ['from', 'to'] as const) {
    if (value[key] !== undefined) {
      if (!seedDate(value[key])) seedInputError(key);
      result[key] = value[key];
    }
  }
  if (result.from && result.to && result.from > result.to) seedInputError('to');
  if (value.q !== undefined) {
    if (typeof value.q !== 'string' || value.q.length > 150)
      seedInputError('q');
    result.q = value.q.trim();
  }
  if (value.blockchain !== undefined) {
    if (value.blockchain !== 'with-link' && value.blockchain !== 'without-link')
      seedInputError('blockchain');
    result.blockchain = value.blockchain;
  }
  if (value.sort !== undefined) {
    if (value.sort !== 'date-desc' && value.sort !== 'date-asc')
      seedInputError('sort');
    result.sort = value.sort;
  }
  return result;
}
