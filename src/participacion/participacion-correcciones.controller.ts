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
import { ParticipacionCorreccionesService } from './application/participacion-correcciones.service';
import { id, strictObject } from './dto/comandos.dto';
import {
  parseCorrectionHistoryQuery,
  parseCorrectionObservations,
} from './dto/correcciones.dto';
import { ParticipacionExceptionFilter } from './participacion-exception.filter';

@ApiTags('Participación: correcciones v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ParticipacionCorreccionesController {
  constructor(private readonly service: ParticipacionCorreccionesService) {}

  @Get('plantaciones/:id/contexto-correccion')
  @ApiOperation({
    summary:
      'Contexto privado de corrección; observaciones solo para ADMIN global',
  })
  contexto(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Query() query: unknown,
  ) {
    strictObject(query, [], 'query');
    return this.service.contexto(req.actor, id(registro));
  }

  @Get('plantaciones/:id/historial-correcciones')
  @ApiOperation({
    summary:
      'Historial privado de observaciones, con textos restringidos por autoridad',
  })
  historial(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Query() query: unknown,
  ) {
    return this.service.historial(
      req.actor,
      id(registro),
      parseCorrectionHistoryQuery(query),
    );
  }

  @Post('plantaciones/:id/correcciones/observaciones')
  @ApiOperation({
    summary:
      'Corregir observaciones con revisión y recibo durable; solo ADMIN global',
  })
  async observaciones(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    const parsed = parseCorrectionObservations(body, registro);
    const reply = await this.service.corregirObservaciones(
      req.actor,
      parsed.comando_id,
      parsed.payload,
    );
    return response.status(reply.http_status).json(reply.body);
  }
}
