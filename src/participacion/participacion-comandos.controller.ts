import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  VerifiedActorGuard,
  type ActorRequest,
} from '../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import {
  parseAccess,
  parseAuthority,
  parseRecovery,
  parseReplacement,
  id,
  strictObject,
  type AccessOperation,
} from './dto/comandos.dto';
import { ParticipacionExceptionFilter } from './participacion-exception.filter';
import { ParticipacionComandosService } from './participacion-comandos.service';
import type { RpcReply } from './comando-recibo';

@ApiTags('participacion-v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ParticipacionComandosController {
  constructor(private readonly service: ParticipacionComandosService) {}

  @Post('participacion/accesos/otorgar-plantador')
  otorgar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.access('OTORGAR_PLANTADOR', req, body, res);
  }
  @Post('participacion/accesos/retirar-plantador')
  retirar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.access('RETIRAR_PLANTADOR', req, body, res);
  }
  @Post('participacion/accesos/designar-administrador')
  designar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.access('DESIGNAR_ADMINISTRADOR', req, body, res);
  }
  @Post('participacion/accesos/administrador-a-plantador')
  cambiar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.access('CAMBIAR_ADMINISTRADOR_A_PLANTADOR', req, body, res);
  }
  @Post('participacion/accesos/retirar-administrador')
  retirarAdministrador(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.access('RETIRAR_ADMINISTRADOR', req, body, res);
  }
  @Post('participacion/accesos/reemplazar-administrador')
  async reemplazar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const parsed = parseReplacement(body);
    return this.reply(
      res,
      await this.service.acceso(
        req.actor,
        'REEMPLAZAR_ADMINISTRADOR',
        parsed.comando_id,
        parsed.payload,
      ),
    );
  }
  @Post('usuarios/:usuario_id/roles')
  async roles(
    @Req() req: ActorRequest,
    @Param('usuario_id') user: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const parsed = parseAuthority(body, user, true);
    return this.reply(
      res,
      await this.service.autoridad(
        req.actor,
        'CAMBIAR_ROL_GLOBAL',
        parsed.comando_id,
        parsed.payload,
      ),
    );
  }
  @Post('usuarios/:usuario_id/inactivaciones')
  async inactivar(
    @Req() req: ActorRequest,
    @Param('usuario_id') user: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const parsed = parseAuthority(body, user, false);
    return this.reply(
      res,
      await this.service.autoridad(
        req.actor,
        'INACTIVAR_CUENTA',
        parsed.comando_id,
        parsed.payload,
      ),
    );
  }
  @Get('usuarios/:usuario_id/autoridad')
  async autoridad(
    @Req() req: ActorRequest,
    @Param('usuario_id') user: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    strictObject(query, [], 'query');
    return this.reply(
      res,
      await this.service.leerAutoridad(req.actor, id(user, 'usuario_id')),
    );
  }
  @Get('participacion/comandos/:comando_id')
  @ApiOperation({
    summary:
      'Recuperar resultado propio, incluso tras perder permiso contextual o rol.',
  })
  async recuperar(
    @Req() req: ActorRequest,
    @Param('comando_id') uuid: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const parsed = parseRecovery(uuid, query);
    return this.reply(
      res,
      await this.service.recuperar(
        req.actor,
        parsed.operacion,
        parsed.comando_id,
      ),
    );
  }
  private async access(
    operation: AccessOperation,
    req: ActorRequest,
    body: unknown,
    res: Response,
  ) {
    const parsed = parseAccess(body);
    return this.reply(
      res,
      await this.service.acceso(
        req.actor,
        operation,
        parsed.comando_id,
        parsed.payload,
      ),
    );
  }
  private reply(res: Response, reply: RpcReply): Response {
    if (reply.http_status === 202) res.setHeader('Retry-After', '2');
    return res.status(reply.http_status).json(reply.body);
  }
}
