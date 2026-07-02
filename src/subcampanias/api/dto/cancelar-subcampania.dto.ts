import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarSubcampaniaDto {
  @IsString()
  @MinLength(3, {
    message: 'motivo debe tener al menos 3 caracteres.',
  })
  @MaxLength(1000)
  motivo!: string;
}
