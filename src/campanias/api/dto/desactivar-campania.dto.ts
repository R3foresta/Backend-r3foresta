import { IsString, MaxLength, MinLength } from 'class-validator';

export class DesactivarCampaniaDto {
  @IsString()
  @MinLength(3, {
    message: 'motivo debe tener al menos 3 caracteres.',
  })
  @MaxLength(1000, {
    message: 'motivo no puede exceder 1000 caracteres.',
  })
  motivo!: string;
}
