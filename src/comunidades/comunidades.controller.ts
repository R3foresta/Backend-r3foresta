import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ComunidadesService } from './comunidades.service';
import { CreateComunidadDto } from './dto/create-comunidad.dto';
import { ListComunidadesQueryDto } from './dto/list-comunidades-query.dto';
import { UpdateComunidadDto } from './dto/update-comunidad.dto';

@ApiTags('comunidades')
@Controller('comunidades')
export class ComunidadesController {
  constructor(private readonly comunidadesService: ComunidadesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar comunidades',
    description:
      'Lista comunidades (nivel 4) por país, incluyendo ruta administrativa nivel1..4.',
  })
  @ApiQuery({
    name: 'pais_id',
    required: true,
    description: 'ID numérico del país o código ISO2 (ej. 1 o BO)',
    example: 'BO',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Filtro de búsqueda por nombre de comunidad',
    example: 'Tiquipaya',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'incluir_inactivas',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({ status: 200, description: 'Lista de comunidades obtenida' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  @ApiResponse({ status: 404, description: 'País no encontrado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async listar(@Query() query: ListComunidadesQueryDto) {
    return this.comunidadesService.listar(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener comunidad por ID',
    description: 'Retorna una comunidad con su ruta administrativa nivel1..4.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la comunidad' })
  @ApiResponse({ status: 200, description: 'Comunidad obtenida' })
  @ApiResponse({ status: 404, description: 'Comunidad no encontrada' })
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.comunidadesService.obtenerPorId(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear comunidad',
    description:
      'Crea una comunidad (nivel 4) bajo un municipio válido (nivel 3) del mismo país.',
  })
  @ApiBody({ type: CreateComunidadDto })
  @ApiResponse({ status: 201, description: 'Comunidad creada correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'País, municipio o tipos no encontrados' })
  @ApiResponse({ status: 409, description: 'Comunidad duplicada en el municipio' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async crear(@Body() payload: CreateComunidadDto) {
    return this.comunidadesService.crear(payload);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar comunidad',
    description: 'Permite actualizar nombre, municipio padre y/o estado activo.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la comunidad' })
  @ApiBody({ type: UpdateComunidadDto })
  @ApiResponse({ status: 200, description: 'Comunidad actualizada correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Comunidad o municipio no encontrados' })
  @ApiResponse({ status: 409, description: 'Comunidad duplicada en el municipio' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: UpdateComunidadDto,
  ) {
    return this.comunidadesService.actualizar(id, payload);
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar comunidad',
    description: 'Realiza soft delete estableciendo activo=false.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la comunidad' })
  @ApiResponse({ status: 200, description: 'Comunidad desactivada correctamente' })
  @ApiResponse({ status: 404, description: 'Comunidad no encontrada' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.comunidadesService.desactivar(id);
  }
}
