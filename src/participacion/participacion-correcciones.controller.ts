import {
  Body,
  Controller,
  Get,
  Header,
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
  parseCorrectionParticipants,
  parseHistoricalParticipantsQuery,
} from './dto/correcciones.dto';
import {
  ParticipacionExceptionFilter,
  ParticipacionPublicExceptionFilter,
} from './participacion-exception.filter';

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
      'Historial privado de correcciones, con textos restringidos por autoridad',
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

  @Post('plantaciones/:id/correcciones/participantes')
  @ApiOperation({
    summary:
      'Corregir participación histórica sin cambiar responsable ni permisos',
  })
  async participantes(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    const parsed = parseCorrectionParticipants(body, registro);
    const reply = await this.service.corregirParticipantes(
      req.actor,
      parsed.comando_id,
      parsed.payload,
    );
    return response.status(reply.http_status).json(reply.body);
  }

  @Get('plantaciones/:id/participantes-historicos-seleccionables')
  @ApiOperation({
    summary:
      'Buscar personas históricas por ID exacto o nombre, incluidas cuentas inactivas',
  })
  participantesHistoricos(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Query() query: unknown,
  ) {
    return this.service.participantesHistoricos(
      req.actor,
      id(registro),
      parseHistoricalParticipantsQuery(query),
    );
  }

  @Get('plantaciones/mis-registros/estado')
  @ApiOperation({
    summary:
      'Estados propios por autoría o participación efectiva de la cuenta activa',
  })
  estadosPropios(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.service.estadosPropios(
      req.actor,
      parseCorrectionHistoryQuery(query),
    );
  }

  @Get('plantaciones/:id/estado-propio')
  @ApiOperation({
    summary:
      'Estado y procedencia de snapshots para una relación propia efectiva',
  })
  estadoPropio(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Query() query: unknown,
  ) {
    strictObject(query, [], 'query');
    return this.service.estadoPropio(req.actor, id(registro));
  }

  @Get('plantaciones/:id/historial-propio')
  @ApiOperation({
    summary:
      'Historia propia reducida sin motivos ni valores privados de auditoría',
  })
  historialPropio(
    @Req() req: ActorRequest,
    @Param('id') registro: string,
    @Query() query: unknown,
  ) {
    return this.service.historialPropio(
      req.actor,
      id(registro),
      parseCorrectionHistoryQuery(query),
    );
  }
}

@ApiTags('impact-publico')
@Controller('v1/impact')
@UseFilters(ParticipacionPublicExceptionFilter)
export class ParticipacionEstadoPublicoController {
  constructor(private readonly service: ParticipacionCorreccionesService) {}

  @Get('registros/:id/estado')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Señal pública mínima de estado y correcciones sin sesión',
  })
  estado(@Param('id') registro: string, @Query() query: unknown) {
    strictObject(query, [], 'query');
    return this.service.estadoPublico(id(registro));
  }
}
