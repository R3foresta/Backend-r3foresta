import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';

export class GeoJsonPolygonDto {
  @Equals('Polygon')
  type: 'Polygon';

  @IsArray()
  @ArrayMinSize(1)
  coordinates: number[][][];
}

export class SetearPoligonoDto {
  @IsObject()
  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  poligono: GeoJsonPolygonDto;
}
