import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { RegisterFormDto } from './dto/register-form.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * GET /users/profile
   * Obtiene los datos del usuario autenticado
   * ⚠️ Para desarrollo: también acepta header x-auth-id
   */
  @Get('profile')
  async getProfile(@Req() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const authIdHeader = req.headers['x-auth-id'] as string;

    // Modo desarrollo: usar auth_id directamente
    if (authIdHeader) {
      console.log('⚠️ Usando auth_id directo (solo desarrollo):', authIdHeader);
      return this.usersService.getUserByAuthId(authIdHeader);
    }

    // Modo producción: validar token JWT
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const authHeader = req.headers.authorization as string;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }
    const token = authHeader.split(' ')[1];

    // Verificar token
    let authId: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const payload = this.jwtService.verify(token);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      authId = payload.sub;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }

    // Obtener usuario
    return this.usersService.getUserByAuthId(authId);
  }

  /**
   * POST /users/register-form
   * Completa el registro del usuario con datos del formulario
   * ⚠️ Para desarrollo: también acepta header x-auth-id
   */
  @Post('register-form')
  async registerForm(@Body() dto: RegisterFormDto, @Req() req: any) {
    let authId: string;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const authIdHeader = req.headers['x-auth-id'] as string;

    // Modo desarrollo: usar auth_id directamente
    if (authIdHeader) {
      console.log('⚠️ Usando auth_id directo (solo desarrollo):', authIdHeader);
      authId = authIdHeader;
    } else {
      // Modo producción: validar token JWT
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const authHeader = req.headers.authorization as string;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      const token = authHeader.split(' ')[1];

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const payload = this.jwtService.verify(token);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        authId = payload.sub;
      } catch (error) {
        throw new UnauthorizedException('Invalid token');
      }
    }

    // Llamar al servicio
    return this.usersService.registerForm(authId, dto);
  }
}
