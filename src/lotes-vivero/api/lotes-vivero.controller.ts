import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { LotesViveroService } from '../application/lotes-vivero.service';
import {
  ApiCrearEvidenciaPendiente,
  ApiCrearEvidenciasPendientesAdaptabilidad,
  ApiCrearEvidenciasPendientesEmbolsado,
  ApiCrearEvidenciasPendientesMerma,
  ApiCrearLoteDesdeRecoleccion,
  ApiListarLotes,
  ApiObtenerAdaptabilidades,
  ApiObtenerContextoEmbolsado,
  ApiObtenerDetalleLote,
  ApiObtenerMermas,
  ApiObtenerResultadoEmbolsado,
  ApiObtenerTimeline,
  ApiRegistrarAdaptabilidad,
  ApiRegistrarDespacho,
  ApiRegistrarEmbolsado,
  ApiRegistrarMerma,
} from './docs/lotes-vivero.swagger';
import { CrearEvidenciaPendienteViveroDto } from './dto/crear-evidencia-pendiente-vivero.dto';
import { CrearLoteViveroDto } from './dto/crear-lote-vivero.dto';
import { FiltrarLotesViveroDto } from './dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from './dto/filtrar-timeline-lote.dto';
import { RegistrarAdaptabilidadDto } from './dto/registrar-adaptabilidad.dto';
import { RegistrarDespachoDto } from './dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from './dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from './dto/registrar-merma.dto';

// TODO(vivero-mvp): revisar política de autenticación para endpoints GET.
//   Spec: RF-VIV-07 (timeline / cadena de custodia) y RF-VIV-09 (listado operativo)
//   indican "control de acceso por rol". Hoy todos los GET de este controller son
//   públicos (no exigen `x-auth-id`), mientras que los POST sí lo exigen.
//   Esto es una inconsistencia y un posible problema de privacidad de datos
//   operativos. Confirmar con producto si los GET deben ir tras `x-auth-id`
//   (y eventualmente rol), o si quedan abiertos por diseño. Sincronizar también
//   con la doc del módulo (modulos/lotes-vivero.md sección "Autenticación").
@ApiTags('lotes-vivero')
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
  obtenerContextoEmbolsado(@Param('id', ParseIntPipe) loteId: number) {
    return this.lotesViveroService.obtenerContextoEmbolsado(loteId);
  }

  @Post(':id/embolsado/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesEmbolsado()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesEmbolsado(
    @Param('id', ParseIntPipe) loteId: number,
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
    @Param('id', ParseIntPipe) loteId: number,
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
  obtenerResultadoEmbolsado(@Param('id', ParseIntPipe) loteId: number) {
    return this.lotesViveroService.obtenerResultadoEmbolsado(loteId);
  }

  // ---- Adaptabilidad ----

  @Post(':id/adaptabilidad/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesAdaptabilidad()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesAdaptabilidad(
    @Param('id', ParseIntPipe) loteId: number,
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
    @Param('id', ParseIntPipe) loteId: number,
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
  obtenerAdaptabilidades(@Param('id', ParseIntPipe) loteId: number) {
    return this.lotesViveroService.obtenerAdaptabilidades(loteId);
  }

  @Post(':id/merma/evidencias-pendientes')
  @ApiCrearEvidenciasPendientesMerma()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  crearEvidenciasPendientesMerma(
    @Param('id', ParseIntPipe) loteId: number,
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
    @Param('id', ParseIntPipe) loteId: number,
    @Body() dto: RegistrarMermaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarMerma(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/despacho')
  @ApiRegistrarDespacho()
  registrarDespacho(
    @Param('id', ParseIntPipe) loteId: number,
    @Body() dto: RegistrarDespachoDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.registrarDespacho(
      loteId,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Get(':id/merma')
  @ApiObtenerMermas()
  obtenerMermas(@Param('id', ParseIntPipe) loteId: number) {
    return this.lotesViveroService.obtenerMermas(loteId);
  }

  @Get()
  @ApiListarLotes()
  listarLotes(@Query() filters: FiltrarLotesViveroDto) {
    return this.lotesViveroService.listarLotes(filters);
  }

  @Get(':id/timeline')
  @ApiObtenerTimeline()
  obtenerTimeline(
    @Param('id', ParseIntPipe) loteId: number,
    @Query() filters: FiltrarTimelineLoteDto,
  ) {
    return this.lotesViveroService.obtenerTimeline(loteId, filters);
  }

  @Get(':id')
  @ApiObtenerDetalleLote()
  obtenerDetalle(@Param('id', ParseIntPipe) loteId: number) {
    return this.lotesViveroService.obtenerDetalle(loteId);
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