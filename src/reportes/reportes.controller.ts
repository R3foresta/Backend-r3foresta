import {
  Controller,
  Get,
  HttpCode,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InternalActorGuard } from '../auth/internal-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import type { ActorRequest } from '../auth/verified-actor.guard';
import { ReportesService } from './reportes.service';

@ApiTags('Reportes administrativos')
@ApiBearerAuth()
@Controller('v1/reportes')
@UseGuards(InternalActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('plantaciones')
  @ApiOperation({
    summary: 'Totales, meses y especies de plantación para ADMIN',
  })
  @ApiQuery({
    name: 'desde',
    required: true,
    schema: { type: 'string', format: 'date' },
  })
  @ApiQuery({
    name: 'hasta',
    required: true,
    schema: { type: 'string', format: 'date' },
  })
  @ApiQuery({ name: 'organizacion_id', required: false, type: String })
  @ApiQuery({ name: 'campania_id', required: false, type: String })
  @ApiQuery({ name: 'planta_id', required: false, type: String })
  @ApiResponse({
    status: 200,
    description:
      'Agregados del período y opciones de los filtros administrativos.',
  })
  @ApiResponse({ status: 401, description: 'Sesión inválida.' })
  @ApiResponse({ status: 403, description: 'Se requiere ADMIN activo.' })
  @ApiResponse({ status: 422, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 503, description: 'Lectura no disponible.' })
  plantaciones(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.reportes.plantaciones(req.actor, query);
  }

  @Get('plantaciones/permiso-exportacion')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Confirmar permiso ADMIN antes de exportar el resultado consultado',
  })
  @ApiResponse({ status: 204, description: 'Exportación autorizada.' })
  @ApiResponse({ status: 401, description: 'Sesión inválida.' })
  @ApiResponse({ status: 403, description: 'Se requiere ADMIN activo.' })
  permisoExportacion(@Req() req: ActorRequest) {
    this.reportes.permisoExportacion(req.actor);
  }
}
