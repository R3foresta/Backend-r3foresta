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
import { ParticipacionRegistroService } from './application/participacion-registro.service';
import { id, strictObject } from './dto/comandos.dto';
import {
  parseParticipantesQuery,
  parseRegistroInicial,
} from './dto/registro.dto';
import { ParticipacionExceptionFilter } from './participacion-exception.filter';

@ApiTags('Participación: registro inicial v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ParticipacionRegistroController {
  constructor(private readonly service: ParticipacionRegistroService) {}

  @Get('subcampanias/:id/contexto-registro')
  @ApiOperation({
    summary:
      'Contexto autorizado de registro inicial sin asignaciones internas',
  })
  contexto(
    @Req() req: ActorRequest,
    @Param('id') scope: string,
    @Query() query: unknown,
  ) {
    strictObject(query, [], 'query');
    return this.service.contexto(req.actor, id(scope));
  }
  @Get('subcampanias/:id/participantes-seleccionables')
  @ApiOperation({
    summary: 'Personas mínimas elegibles; se revalidan al confirmar',
  })
  participantes(
    @Req() req: ActorRequest,
    @Param('id') scope: string,
    @Query() query: unknown,
  ) {
    return this.service.participantes(
      req.actor,
      id(scope),
      parseParticipantesQuery(query),
    );
  }
  @Post('plantaciones/iniciales')
  @ApiOperation({
    summary: 'Registrar inicial con consumo LIFO y recibo atómico',
  })
  async registrar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    const { comando_id, payload } = parseRegistroInicial(
      body,
      req.actor.usuario_id,
    );
    const reply = await this.service.registrar(req.actor, comando_id, payload);
    return response.status(reply.http_status).json(reply.body);
  }
  @Get('plantaciones/:id/detalle-propio')
  @ApiOperation({
    summary: 'Hecho persistido para autor o participante histórico activo',
  })
  detalle(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Query() query: unknown,
  ) {
    strictObject(query, [], 'query');
    return this.service.detalle(req.actor, id(registro));
  }
}
