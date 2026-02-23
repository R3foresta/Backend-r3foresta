import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateFlexDivisionDto } from './dto/create-flex-division.dto';
import { ListDivisionesQueryDto } from './dto/list-divisiones-query.dto';
import { UbicacionesService } from './ubicaciones.service';

@ApiTags('ubicaciones')
@Controller('ubicaciones')
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}

  @Get('paises')
  @ApiOperation({
    summary: 'Listar países',
    description:
      'Obtiene el catálogo de países habilitados para ubicar recolecciones y también para ubicar divisiones administrativas (Ej. privincia, municpios, localidad/comunidad).',
  })
  @ApiResponse({ status: 200, description: 'Países obtenidos correctamente' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findPaises() {
    return this.ubicacionesService.findPaises();
  }

  @Get('divisiones')
  @ApiOperation({
    summary: 'Listar divisiones administrativas',
    description:
      'Obtiene divisiones por país y nivel jerárquico. Si no se envía parent_id (que es la división padre a la que corresponde, Ej. En Bolivia cada departamento tiene provincias), devuelve divisiones raíz (Ej. En Bolivia serían los departamentos).',
  })
  @ApiQuery({
    name: 'pais_id',
    required: true,
    type: Number,
    description: 'ID del país',
    example: 1,
  })
  @ApiQuery({
    name: 'parent_id',
    required: false,
    type: Number,
    description:
      'ID de la división padre. Si se omite, se consultan divisiones de nivel raíz (parent_id = null) (Ej. en Bolivia la raíz sería el departamento).',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Divisiones administrativas obtenidas correctamente',
  })
  @ApiResponse({ status: 400, description: 'Parámetros de consulta inválidos' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findDivisiones(@Query() query: ListDivisionesQueryDto) {
    return this.ubicacionesService.findDivisiones(
      Number(query.pais_id),
      query.parent_id === undefined ? undefined : Number(query.parent_id),
    );
  }

  // TODO: verificar si es necesario el endpoint. Realmente no creo que este sea neceesario :)
  @Post('divisiones/flexible')
  @ApiOperation({
    summary: 'Crear o recuperar división flexible',
    description:
      'Busca una división por nombre bajo un parent_id. Si existe, la retorna; si no existe, la crea automáticamente.',
  })
  @ApiBody({ type: CreateFlexDivisionDto })
  @ApiResponse({
    status: 201,
    description: 'División creada correctamente o recuperada si ya existía',
  })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'División padre o tipo no encontrado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async ensureFlexibleDivision(@Body() body: CreateFlexDivisionDto) {
    return this.ubicacionesService.ensureFlexibleDivision(body);
  }
}
