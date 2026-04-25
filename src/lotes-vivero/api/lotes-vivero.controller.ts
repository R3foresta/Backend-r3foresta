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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LotesViveroService } from '../application/lotes-vivero.service';
import { CrearLoteViveroDto } from './dto/crear-lote-vivero.dto';
import { FiltrarLotesViveroDto } from './dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from './dto/filtrar-timeline-lote.dto';
import { RegistrarAdaptabilidadDto } from './dto/registrar-adaptabilidad.dto';
import { RegistrarDespachoDto } from './dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from './dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from './dto/registrar-merma.dto';

@ApiTags('lotes-vivero')
@Controller('lotes-vivero')
export class LotesViveroController {
  constructor(private readonly lotesViveroService: LotesViveroService) {}

  @Post()
  crearDesdeRecoleccion(
    @Body() dto: CrearLoteViveroDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.lotesViveroService.crearDesdeRecoleccion(
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/embolsado')
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

  @Post(':id/adaptabilidad')
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

  @Post(':id/merma')
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

  @Get()
  listarLotes(@Query() filters: FiltrarLotesViveroDto) {
    return this.lotesViveroService.listarLotes(filters);
  }

  @Get(':id/timeline')
  obtenerTimeline(
    @Param('id', ParseIntPipe) loteId: number,
    @Query() filters: FiltrarTimelineLoteDto,
  ) {
    return this.lotesViveroService.obtenerTimeline(loteId, filters);
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
