import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Query,
  UnauthorizedException,
  UseInterceptors,
  Patch,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Headers,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RegisterFormDto } from './dto/register-form.dto';
import {
  ApiActualizarFotoPerfil,
  ApiCompletarRegistro,
  ApiListarUsuarios,
  ApiObtenerPerfil,
} from './docs/users.swagger';

import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  @ApiListarUsuarios()
  listar(
    @Headers('x-auth-id') authId: string | undefined,
    @Query('q') q?: string,
    @Query('rol') rol?: string,
  ) {
    if (!authId?.trim())
      throw new UnauthorizedException('Header x-auth-id es requerido');
    return this.usersService.listarParaSelector({ q, rol });
  }

  @Get('rol/:rol')
  listarPorRol(
    @Headers('x-auth-id') authId: string | undefined,
    @Param('rol') rol: string,
    @Query('q') q?: string,
  ) {
    if (!authId?.trim())
      throw new UnauthorizedException('Header x-auth-id es requerido');
    return this.usersService.listarParaSelector({ q, rol });
  }

  /**
   * GET /users/profile
   * Obtiene los datos del usuario autenticado
   * ⚠️ Para desarrollo: también acepta header x-auth-id
   */
  @Get('profile')
  @ApiObtenerPerfil()
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
  @ApiCompletarRegistro()
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

  @Patch('profile/photo')
  @ApiActualizarFotoPerfil()
  @UseInterceptors(FileInterceptor('file')) // 'file' es el nombre del campo que enviará el front
  async updateProfilePhoto(
    @Req() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // Máximo 2MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }), // Solo imágenes
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    let authId: string;
    const authIdHeader = req.headers['x-auth-id'] as string;

    if (authIdHeader) {
      authId = authIdHeader;
    } else {
      const authHeader = req.headers.authorization as string;
      if (!authHeader) throw new UnauthorizedException();
      const token = authHeader.split(' ')[1];
      const payload = this.jwtService.verify(token);
      authId = payload.sub;
    }

    return this.usersService.updateProfilePhoto(authId, file);
  }
}
