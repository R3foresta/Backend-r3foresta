import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ForbiddenException,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ActorRequest } from '../auth/verified-actor.guard';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listar(
    @Req() request: ActorRequest,
    @Query('q') q?: string,
    @Query('rol') rol?: string,
  ) {
    this.assertInternalDirectory(request);
    return this.usersService.listarParaSelector({ q, rol });
  }

  @Get('rol/:rol')
  listarPorRol(
    @Req() request: ActorRequest,
    @Param('rol') rol: string,
    @Query('q') q?: string,
  ) {
    this.assertInternalDirectory(request);
    return this.usersService.listarParaSelector({ q, rol });
  }

  // Alias legado para la PWA actual; conserva su forma de respuesta.
  @Get('profile')
  getProfile(@Req() request: ActorRequest) {
    return this.usersService.getOwnLegacyProfile(request.actor);
  }

  @Post('register-form')
  registerForm(@Body() body: unknown, @Req() request: ActorRequest) {
    return this.usersService.registerForm(request.actor, body);
  }

  @Patch('profile/photo')
  @UseInterceptors(FileInterceptor('file'))
  updateProfilePhoto(
    @Req() request: ActorRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.updateProfilePhoto(request.actor, file);
  }

  private assertInternalDirectory(request: ActorRequest): void {
    if (!['ADMIN', 'GENERAL', 'VALIDADOR'].includes(request.actor.rol)) {
      throw new ForbiddenException('DIRECTORIO_INTERNO_NO_AUTORIZADO');
    }
  }
}
