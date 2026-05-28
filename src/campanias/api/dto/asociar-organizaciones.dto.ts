import { ArrayNotEmpty, IsArray, IsInt, IsPositive } from 'class-validator';

export class AsociarOrganizacionesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  organizacion_ids: number[];
}
