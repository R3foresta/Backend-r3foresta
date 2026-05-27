import { IsEnum, IsInt, IsPositive } from 'class-validator';
import { RolEnSubcampania } from '../../domain/enums/rol-en-subcampania.enum';

export class AgregarMiembroEquipoDto {
  @IsInt()
  @IsPositive()
  usuario_id: number;

  @IsEnum(RolEnSubcampania)
  rol: RolEnSubcampania;
}
