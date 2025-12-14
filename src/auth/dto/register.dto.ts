import { IsString, IsEmail, IsOptional, IsObject, IsNotEmpty } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsObject()
  @IsNotEmpty()
  registration: any;

  @IsString()
  @IsNotEmpty()
  challenge: string;
}
