import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ActorRequest } from '../auth/verified-actor.guard';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import { positiveId } from '../users/perfil-v1.dto';
import {
  parseBuscarPersonas,
  parseCapacidadesQuery,
  parseMiembrosQuery,
  parseRevisarAccesos,
} from './dto/lecturas.dto';
import { ParticipacionExceptionFilter } from './participacion-exception.filter';
import { ParticipacionLecturasService } from './participacion-lecturas.service';

@ApiTags('Participación: lecturas privadas v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ParticipacionLecturasController {
  constructor(private readonly service: ParticipacionLecturasService) {}

  @Get('participacion/capacidades')
  @ApiOperation({
    summary: 'Capacidades vigentes propias, sin stock ni equipos',
  })
  capacidades(
    @Req() request: ActorRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.capacidades(
      request.actor,
      parseCapacidadesQuery(query),
    );
  }

  @Get('subcampanias/:id/miembros-participacion')
  @ApiOperation({ summary: 'Miembros mínimos del ámbito, solo para gestores' })
  miembros(
    @Req() request: ActorRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.miembros(
      request.actor,
      positiveId(id),
      parseMiembrosQuery(query),
    );
  }

  @Post('participacion/personas/buscar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Buscar cuentas activas por nombre o correo exacto',
  })
  buscar(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.service.buscar(request.actor, parseBuscarPersonas(body));
  }

  @Post('participacion/accesos/revisar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revisar persona y revisiones de la selección completa',
  })
  revisar(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.service.revisar(request.actor, parseRevisarAccesos(body));
  }
}
