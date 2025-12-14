import { IsObject, IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsObject()
  @IsNotEmpty()
  authentication: any;

  @IsString()
  @IsNotEmpty()
  challenge: string;
}
