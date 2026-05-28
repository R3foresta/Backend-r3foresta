import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubcampaniasService } from '../application/subcampanias.service';
import { AgregarMiembroEquipoDto } from './dto/agregar-miembro-equipo.dto';
import { CerrarSubcampaniaDto } from './dto/cerrar-subcampania.dto';
import { CrearSubcampaniaDto } from './dto/crear-subcampania.dto';
import { EditarSubcampaniaDto } from './dto/editar-subcampania.dto';
import { SetearPoligonoDto } from './dto/setear-poligono.dto';
import {
  ApiActivarSubcampania,
  ApiAgregarMiembrosEquipo,
  ApiBorrarSubcampania,
  ApiCerrarSubcampania,
  ApiCrearSubcampania,
  ApiDetalleSubcampania,
  ApiEditarSubcampania,
  ApiListarEquipo,
  ApiListarSubcampanias,
  ApiQuitarMiembroEquipo,
  ApiSetearPoligono,
} from './docs/subcampanias.swagger';

@ApiTags('subcampanias')
@Controller('subcampanias')
export class SubcampaniasController {
  constructor(private readonly subcampaniasService: SubcampaniasService) {}

  @Post()
  @ApiCrearSubcampania()
  crear(
    @Body() dto: CrearSubcampaniaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.crear(dto, this.requireAuthId(authId));
  }

  @Get()
  @ApiListarSubcampanias()
  listar(
    @Query('campania_id') campaniaId?: string,
    @Query('estado') estado?: string,
    @Query('zona_id') zonaId?: string,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.subcampaniasService.listar({
      campania_id: this.parseIntQuery('campania_id', campaniaId),
      estado: estado ?? undefined,
      zona_id: this.parseIntQuery('zona_id', zonaId),
    });
  }

  @Get(':id')
  @ApiDetalleSubcampania()
  obtenerPorId(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.subcampaniasService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiEditarSubcampania()
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarSubcampaniaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.editar(
      id,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/poligono')
  @ApiSetearPoligono()
  setearPoligono(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetearPoligonoDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.setearPoligono(
      id,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/activar')
  @ApiActivarSubcampania()
  activar(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.activar(id, this.requireAuthId(authId));
  }

  @Post(':id/cerrar')
  @ApiCerrarSubcampania()
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CerrarSubcampaniaDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.cerrar(
      id,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Delete(':id')
  @ApiBorrarSubcampania()
  borrar(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.borrar(id, this.requireAuthId(authId));
  }

  @Get(':id/equipo')
  @ApiListarEquipo()
  listarEquipo(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.subcampaniasService.listarEquipo(id);
  }

  @Post(':id/equipo')
  @ApiAgregarMiembrosEquipo()
  agregarMiembros(
    @Param('id', ParseIntPipe) id: number,
    @Body(
      new ParseArrayPipe({
        items: AgregarMiembroEquipoDto,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    miembros: AgregarMiembroEquipoDto[],
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.agregarMiembrosEquipo(
      id,
      miembros,
      this.requireAuthId(authId),
    );
  }

  @Delete(':id/equipo/:usuarioId')
  @ApiQuitarMiembroEquipo()
  quitarMiembro(
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.subcampaniasService.quitarMiembroEquipo(
      id,
      usuarioId,
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

  private parseIntQuery(
    paramName: string,
    raw?: string,
  ): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(
        `Query param ${paramName} debe ser un entero positivo.`,
      );
    }
    return parsed;
  }
}
