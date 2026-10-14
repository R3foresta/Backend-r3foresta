import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ActorRequest } from '../auth/verified-actor.guard';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import { parsePerfil } from './perfil-v1.dto';
import { PerfilV1Service } from './perfil-v1.service';

@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
export class PerfilV1Controller {
  constructor(private readonly service: PerfilV1Service) {}

  @Get('usuarios/me/perfil')
  leer(@Req() request: ActorRequest) {
    return this.service.leer(request.actor);
  }

  @Patch('usuarios/me/perfil')
  actualizar(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.service.actualizar(request.actor, parsePerfil(body));
  }

  @Get('participacion/organizaciones-seleccionables')
  organizaciones(
    @Req() request: ActorRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.organizaciones(request.actor, query);
  }
}
