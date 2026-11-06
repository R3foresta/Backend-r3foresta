import { PrivateResponseInterceptor } from '../../auth/private-response.interceptor';
import { BigintIdPipe } from '../../common/dto/bigint-id';
import { InternalActorGuard } from '../../auth/internal-actor.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { LotesViveroService } from '../application/lotes-vivero.service';
import {
  ApiCrearAsignacion,
  ApiDevolverAsignacion,
  ApiCrearEvidenciaPendiente,
  ApiCrearEvidenciasPendientesDescartePreEmbolsado,
  ApiCrearEvidenciasPendientesAdaptabilidad,
  ApiCrearEvidenciasPendientesDespacho,
  ApiCrearEvidenciasPendientesEmbolsado,
  ApiCrearEvidenciasPendientesMerma,
  ApiCrearLoteDesdeRecoleccion,
  ApiListarAsignaciones,
  ApiListarLotes,
  ApiObtenerAdaptabilidades,
  ApiObtenerContextoEmbolsado,
  ApiObtenerDespachos,
  ApiObtenerDetalleLote,
  ApiObtenerMermas,
  ApiObtenerResultadoEmbolsado,
  ApiObtenerSaldos,
  ApiObtenerTimeline,
  ApiRegistrarAdaptabilidad,
  ApiRegistrarDescartePreEmbolsado,
  ApiRegistrarDespacho,
  ApiRegistrarEmbolsado,
  ApiRegistrarMerma,
} from './docs/lotes-vivero.swagger';
import { CrearAsignacionDto } from './dto/crear-asignacion.dto';
import { CrearEvidenciaPendienteViveroDto } from './dto/crear-evidencia-pendiente-vivero.dto';
import { DevolverAsignacionDto } from './dto/devolver-asignacion.dto';
import { CrearLoteViveroDto } from './dto/crear-lote-vivero.dto';
import { FiltrarLotesViveroDto } from './dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from './dto/filtrar-timeline-lote.dto';
import { RegistrarAdaptabilidadDto } from './dto/registrar-adaptabilidad.dto';
import { RegistrarDescartePreEmbolsadoDto } from './dto/registrar-descarte-pre-embolsado.dto';
import { RegistrarDespachoDto } from './dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from './dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from './dto/registrar-merma.dto';

@ApiTags('lotes-vivero')
@ApiResponse({
  status: 403,
  description:
    'Sin ámbito operativo vigente para el vivero del recurso o evidencia no autorizada.',
})
@ApiBearerAuth()
@UseGuards(InternalActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@Controller('lotes-vivero')
export class LotesViveroController {
  constructor(private readonly lotesViveroService: LotesViveroService) {}

  @Post('evidencias-pendientes')
  @ApiCrearEvidenciaPendiente()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciaPendiente(
    @Body() dto: CrearEvidenciaPendienteViveroDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.lotesViveroService.crearEvidenciaPendiente(
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post()
  @ApiCrearLoteDesdeRecoleccion()
  crearDesdeRecoleccion(
    @Body() dto: CrearLoteViveroDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.crearDesdeRecoleccion(
      dto,
      this.requireAuthId(authId),
    );
  }

  // ---- Embolsado ----

  @Get(':id/embolsado/context')
  @ApiObtenerContextoEmbolsado()
  obtenerContextoEmbolsado(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerContextoEmbolsado(
      loteId,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/embolsado/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesEmbolsado()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesEmbolsado(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: CrearEvidenciaPendienteViveroDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.lotesViveroService.crearEvidenciasPendientesEmbolsado(
      loteId,
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post(':id/embolsado')
  @ApiRegistrarEmbolsado()
  registrarEmbolsado(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: RegistrarEmbolsadoDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarEmbolsado(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/embolsado')
  @ApiObtenerResultadoEmbolsado()
  obtenerResultadoEmbolsado(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerResultadoEmbolsado(
      loteId,
      this.requireAuthId(authId),
    );
  }

  // ---- Descarte pre-embolsado ----

  @Post(':id/descarte-pre-embolsado/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesDescartePreEmbolsado()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesDescartePreEmbolsado(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: CrearEvidenciaPendienteViveroDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.lotesViveroService.crearEvidenciasPendientesDescartePreEmbolsado(
      loteId,
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post(':id/descarte-pre-embolsado')
  @ApiRegistrarDescartePreEmbolsado()
  registrarDescartePreEmbolsado(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: RegistrarDescartePreEmbolsadoDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarDescartePreEmbolsado(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  // ---- Adaptabilidad ----

  @Post(':id/adaptabilidad/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesAdaptabilidad()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesAdaptabilidad(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: CrearEvidenciaPendienteViveroDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.lotesViveroService.crearEvidenciasPendientesAdaptabilidad(
      loteId,
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post(':id/adaptabilidad')
  @ApiRegistrarAdaptabilidad()
  registrarAdaptabilidad(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: RegistrarAdaptabilidadDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarAdaptabilidad(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/adaptabilidad')
  @ApiObtenerAdaptabilidades()
  obtenerAdaptabilidades(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerAdaptabilidades(
      loteId,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/merma/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesMerma()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesMerma(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: CrearEvidenciaPendienteViveroDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.lotesViveroService.crearEvidenciasPendientesMerma(
      loteId,
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post(':id/merma')
  @ApiRegistrarMerma()
  registrarMerma(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: RegistrarMermaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarMerma(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/despacho/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesDespacho()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesDespacho(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: CrearEvidenciaPendienteViveroDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.lotesViveroService.crearEvidenciasPendientesDespacho(
      loteId,
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post(':id/despacho')
  @ApiRegistrarDespacho()
  registrarDespacho(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: RegistrarDespachoDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarDespacho(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/despacho')
  @ApiObtenerDespachos()
  obtenerDespachos(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerDespachos(
      loteId,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/merma')
  @ApiObtenerMermas()
  obtenerMermas(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerMermas(
      loteId,
      this.requireAuthId(authId),
    );
  }

  @Get()
  @ApiListarLotes()
  listarLotes(
    @Query() filters: FiltrarLotesViveroDto,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.listarLotes(
      filters,
      this.requireAuthId(authId),
    );
  }

  @Get('stock/especies')
  @ApiOperation({
    summary: 'Stock por especie filtrado por viveros efectivos antes de sumar.',
  })
  listarStockDisponiblePorEspecie(@Headers('x-auth-id') authId: string) {
    return this.lotesViveroService.listarStockDisponiblePorEspecie(
      this.requireAuthId(authId),
    );
  }

  @Get(':id/saldos')
  @ApiObtenerSaldos()
  obtenerSaldos(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerSaldos(
      loteId,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/timeline')
  @ApiObtenerTimeline()
  obtenerTimeline(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Query() filters: FiltrarTimelineLoteDto,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerTimeline(
      loteId,
      filters,
      this.requireAuthId(authId),
    );
  }

  @Get(':id')
  @ApiObtenerDetalleLote()
  obtenerDetalle(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.obtenerDetalle(
      loteId,
      this.requireAuthId(authId),
    );
  }

  // ---- Asignaciones ----

  @Post(':id/asignaciones')
  @ApiCrearAsignacion()
  crearAsignacion(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Body() dto: CrearAsignacionDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.crearAsignacion(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/asignaciones')
  @ApiListarAsignaciones()
  listarAsignaciones(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Headers('x-auth-id') authId: string,
  ) {
    return this.lotesViveroService.listarAsignaciones(
      loteId,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/asignaciones/:asignacionId/devolucion')
  @ApiDevolverAsignacion()
  devolverAsignacion(
    @Param('id', BigintIdPipe) loteId: number | string,
    @Param('asignacionId', BigintIdPipe) asignacionId: number | string,
    @Body() dto: DevolverAsignacionDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.devolverAsignacion(
      loteId,
      asignacionId,
      dto,
      this.requireAuthId(authId),
    );
  }

  private requireAuthId(authId?: string): string {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    const normalized = authId.trim();
    if (!normalized) {
      throw new BadRequestException('Header x-auth-id no puede estar vacio');
    }

    return normalized;
  }
}
