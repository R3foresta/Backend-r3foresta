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

  @Get('vivero')
  @ApiOperation({ summary: 'Saldo físico actual de plantas vivas para ADMIN' })
  @ApiQuery({ name: 'planta_id', required: false, type: String })
  @ApiQuery({ name: 'vivero_id', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Inventario por especie y vivero.' })
  @ApiResponse({ status: 401, description: 'Sesión inválida.' })
  @ApiResponse({ status: 403, description: 'Se requiere ADMIN activo.' })
  @ApiResponse({ status: 422, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 503, description: 'Lectura no disponible.' })
  vivero(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.reportes.vivero(req.actor, query);
  }

  @Get('mermas')
  @ApiOperation({
    summary:
      'Mermas de Vivero con agregados completos y detalle paginado para ADMIN',
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
  @ApiQuery({ name: 'planta_id', required: false, type: String })
  @ApiQuery({ name: 'vivero_id', required: false, type: String })
  @ApiQuery({
    name: 'pagina',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 1_000_000, default: 1 },
  })
  @ApiQuery({
    name: 'exportar',
    required: false,
    schema: { type: 'string', enum: ['1'] },
    description:
      'Devuelve todo el detalle en el mismo corte. La página se omite o debe ser 1.',
  })
  @ApiResponse({
    status: 200,
    description: 'Totales, series y detalle de mermas registradas.',
  })
  @ApiResponse({ status: 401, description: 'Sesión inválida.' })
  @ApiResponse({ status: 403, description: 'Se requiere ADMIN activo.' })
  @ApiResponse({ status: 422, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 503, description: 'Lectura no disponible.' })
  mermas(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.reportes.mermas(req.actor, query);
  }

  @Get('semillas')
  @ApiOperation({ summary: 'Saldo actual de semillas recibidas para ADMIN' })
  @ApiQuery({ name: 'planta_id', required: false, type: String })
  @ApiQuery({ name: 'vivero_id', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Saldo por especie, vivero y unidad.',
  })
  @ApiResponse({ status: 401, description: 'Sesión inválida.' })
  @ApiResponse({ status: 403, description: 'Se requiere ADMIN activo.' })
  @ApiResponse({ status: 422, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 503, description: 'Lectura no disponible.' })
  semillas(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.reportes.semillas(req.actor, query);
  }

  @Get('semillas/movimientos')
  @ApiOperation({
    summary: 'Recepciones, consumos y descartes de semillas para ADMIN',
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
  @ApiQuery({ name: 'planta_id', required: false, type: String })
  @ApiQuery({ name: 'vivero_id', required: false, type: String })
  @ApiQuery({
    name: 'pagina',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 1_000_000, default: 1 },
  })
  @ApiQuery({
    name: 'exportar',
    required: false,
    schema: { type: 'string', enum: ['1'] },
    description:
      'Devuelve todo el detalle en el mismo corte. La página se omite o debe ser 1.',
  })
  @ApiResponse({
    status: 200,
    description: 'Totales del período y detalle paginado o completo.',
  })
  @ApiResponse({ status: 401, description: 'Sesión inválida.' })
  @ApiResponse({ status: 403, description: 'Se requiere ADMIN activo.' })
  @ApiResponse({ status: 422, description: 'Filtros inválidos.' })
  @ApiResponse({ status: 503, description: 'Lectura no disponible.' })
  movimientosSemillas(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.reportes.movimientosSemillas(req.actor, query);
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
