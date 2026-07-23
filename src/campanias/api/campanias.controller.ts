import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CampaniasService } from '../application/campanias.service';
import {
  ApiActivityCampania,
  ApiAsociarOrganizaciones,
  ApiBorrarCampania,
  ApiCrearCampania,
  ApiDesactivarCampaniaMasivamente,
  ApiDesactivacionCampaniaPreview,
  ApiDesasociarOrganizacion,
  ApiDetalleCampania,
  ApiEditarCampania,
  ApiListarCampanias,
  ApiMetricsCampania,
  ApiResumenGlobalCampanias,
} from './docs/campanias.swagger';
import { AsociarOrganizacionesDto } from './dto/asociar-organizaciones.dto';
import { CrearCampaniaDto } from './dto/crear-campania.dto';
import { DesactivarCampaniaDto } from './dto/desactivar-campania.dto';
import { EditarCampaniaDto } from './dto/editar-campania.dto';

@ApiTags('campanias')
@Controller('campanias')
export class CampaniasController {
  constructor(private readonly campaniasService: CampaniasService) {}

  @Post()
  @ApiCrearCampania()
  crear(@Body() dto: CrearCampaniaDto, @Headers('x-auth-id') authId?: string) {
    return this.campaniasService.crear(dto, this.requireAuthId(authId));
  }

  @Get()
  @ApiListarCampanias()
  listar(@Headers('x-auth-id') authId?: string) {
    this.requireAuthId(authId);
    return this.campaniasService.listar();
  }

  @Get('resumen')
  @ApiResumenGlobalCampanias()
  obtenerResumenGlobal(@Headers('x-auth-id') authId?: string) {
    this.requireAuthId(authId);
    return this.campaniasService.obtenerResumenGlobal();
  }

  @Get(':id')
  @ApiDetalleCampania()
  obtenerPorId(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.campaniasService.obtenerPorId(id);
  }

  @Get(':id/subcampanias')
  listarSubcampanias(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.campaniasService.listarSubcampanias(id);
  }

  @Get(':id/metrics')
  @ApiMetricsCampania()
  obtenerMetrics(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.campaniasService.obtenerMetrics(id);
  }

  @Get(':id/activity')
  @ApiActivityCampania()
  obtenerActivity(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.campaniasService.obtenerActivity(id, limit);
  }

  @Patch(':id')
  @ApiEditarCampania()
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCampaniaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.campaniasService.editar(id, dto, this.requireAuthId(authId));
  }

  @Delete(':id')
  @ApiBorrarCampania()
  borrar(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.campaniasService.borrar(id, this.requireAuthId(authId));
  }

  @Get(':id/desactivacion/preview')
  @ApiDesactivacionCampaniaPreview()
  previewDesactivacion(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.campaniasService.previewDesactivacion(
      id,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiDesactivarCampaniaMasivamente()
  desactivarMasivamente(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DesactivarCampaniaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.campaniasService.desactivarMasivamente(
      id,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/organizaciones')
  @ApiAsociarOrganizaciones()
  asociarOrganizaciones(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsociarOrganizacionesDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.campaniasService.asociarOrganizaciones(
      id,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Delete(':id/organizaciones/:orgId')
  @ApiDesasociarOrganizacion()
  desasociarOrganizacion(
    @Param('id', ParseIntPipe) id: number,
    @Param('orgId', ParseIntPipe) orgId: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.campaniasService.desasociarOrganizacion(
      id,
      orgId,
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
