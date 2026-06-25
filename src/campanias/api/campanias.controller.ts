import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CampaniasService } from '../application/campanias.service';
import {
  ApiAsociarOrganizaciones,
  ApiBorrarCampania,
  ApiCrearCampania,
  ApiDesasociarOrganizacion,
  ApiDetalleCampania,
  ApiEditarCampania,
  ApiListarCampanias,
} from './docs/campanias.swagger';
import { AsociarOrganizacionesDto } from './dto/asociar-organizaciones.dto';
import { CrearCampaniaDto } from './dto/crear-campania.dto';
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
