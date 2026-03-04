import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';
import { ListEvidenciasTrazabilidadDto } from './dto/list-evidencias-trazabilidad.dto';

@ApiTags('evidencias-trazabilidad')
@Controller('evidencias-trazabilidad')
export class EvidenciasTrazabilidadController {
  constructor(
    private readonly evidenciasTrazabilidadService: EvidenciasTrazabilidadService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar evidencias de trazabilidad',
    description:
      'Lista evidencias con filtros por entidad, tipo de entidad y código de trazabilidad.',
  })
  @ApiResponse({ status: 200, description: 'Lista de evidencias obtenida' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  @ApiResponse({ status: 404, description: 'Tipo de entidad no encontrado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async list(@Query() filters: ListEvidenciasTrazabilidadDto) {
    return this.evidenciasTrazabilidadService.list(filters);
  }

  @Get('entidad/:tipoEntidadCodigo/:entidadId')
  @ApiOperation({
    summary: 'Listar evidencias por entidad',
    description:
      'Obtiene evidencias por tipo de entidad (código) y entidad_id. Ejemplo: RECOLECCION/123.',
  })
  @ApiParam({
    name: 'tipoEntidadCodigo',
    description: 'Código de tipo_entidad_evidencia (ej. RECOLECCION)',
    example: 'RECOLECCION',
  })
  @ApiParam({
    name: 'entidadId',
    description: 'ID de la entidad',
    type: Number,
    example: 123,
  })
  @ApiQuery({
    name: 'incluir_eliminadas',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({ status: 200, description: 'Evidencias de la entidad obtenidas' })
  @ApiResponse({ status: 404, description: 'Tipo de entidad no encontrado' })
  async findByEntidad(
    @Param('tipoEntidadCodigo') tipoEntidadCodigo: string,
    @Param('entidadId', ParseIntPipe) entidadId: number,
    @Query('incluir_eliminadas') incluirEliminadas?: string,
  ) {
    const includeDeleted =
      incluirEliminadas === 'true' || incluirEliminadas === '1';

    return this.evidenciasTrazabilidadService.findByEntidad(
      tipoEntidadCodigo,
      entidadId,
      includeDeleted,
    );
  }

  @Get('recolecciones/:recoleccionId')
  @ApiOperation({
    summary: 'Listar evidencias de una recolección',
    description:
      'Atajo para consultar evidencias de tipo entidad RECOLECCION por ID de recolección.',
  })
  @ApiParam({
    name: 'recoleccionId',
    description: 'ID de la recolección',
    type: Number,
    example: 123,
  })
  @ApiQuery({
    name: 'incluir_eliminadas',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Evidencias de recolección obtenidas',
  })
  async findByRecoleccion(
    @Param('recoleccionId', ParseIntPipe) recoleccionId: number,
    @Query('incluir_eliminadas') incluirEliminadas?: string,
  ) {
    const includeDeleted =
      incluirEliminadas === 'true' || incluirEliminadas === '1';

    return this.evidenciasTrazabilidadService.findByRecoleccion(
      recoleccionId,
      includeDeleted,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener evidencia por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de evidencia' })
  @ApiResponse({ status: 200, description: 'Evidencia obtenida' })
  @ApiResponse({ status: 404, description: 'Evidencia no encontrada' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.evidenciasTrazabilidadService.findOne(id);
  }
}

