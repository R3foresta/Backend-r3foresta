import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadJsonDto {
  @IsNotEmpty({ message: 'El campo "data" es obligatorio' })
  data: any;

  @IsOptional()
  @IsString()
  filename?: string;
}
