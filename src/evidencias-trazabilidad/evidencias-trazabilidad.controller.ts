import { BigintIdPipe } from '../common/dto/bigint-id';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { ActorRequest } from '../auth/verified-actor.guard';
import { InternalActorGuard } from '../auth/internal-actor.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';
import { CreateEvidenciaRecoleccionDto } from './dto/create-evidencia-recoleccion.dto';
import { ListEvidenciasTrazabilidadDto } from './dto/list-evidencias-trazabilidad.dto';

@ApiTags('evidencias-trazabilidad')
@ApiBearerAuth()
@UseGuards(InternalActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@Controller('evidencias-trazabilidad')
export class EvidenciasTrazabilidadController {
  constructor(
    private readonly evidenciasTrazabilidadService: EvidenciasTrazabilidadService,
  ) {}

  @Post('recolecciones/:recoleccionId')
  @ApiOperation({
    summary: 'Agregar evidencias a una recolección',
    description:
      'Sube 1 a 5 fotos y crea registros en evidencias_trazabilidad para una recolección existente.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'recoleccionId',
    description: 'ID de la recolección',
    type: Number,
    example: 123,
  })
  @ApiBody({
    description: 'Datos y archivos de evidencia (FormData)',
    schema: {
      type: 'object',
      required: ['fotos'],
      properties: {
        titulo: { type: 'string', example: 'Seguimiento de lote' },
        descripcion: {
          type: 'string',
          example: 'Registro posterior a la recolección',
        },
        metadata: {
          type: 'string',
          example: '{"fuente":"app-mobile","dispositivo":"android"}',
        },
        tomado_en: { type: 'string', format: 'date-time' },
        es_principal: { type: 'boolean', example: true },
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Evidencias creadas exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'Bearer ausente o inválido' })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async createForRecoleccion(
    @Param('recoleccionId', BigintIdPipe) recoleccionId: number | string,
    @Body() body: CreateEvidenciaRecoleccionDto,
    @Req() req: ActorRequest,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.evidenciasTrazabilidadService.createForRecoleccion(
      recoleccionId,
      body,
      req.actor.auth_id,
      files?.fotos,
    );
  }

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
  async list(
    @Query() filters: ListEvidenciasTrazabilidadDto,
    @Req() req: ActorRequest,
  ) {
    return this.evidenciasTrazabilidadService.list(filters, req.actor);
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
  @ApiResponse({
    status: 200,
    description: 'Evidencias de la entidad obtenidas',
  })
  @ApiResponse({ status: 404, description: 'Tipo de entidad no encontrado' })
  async findByEntidad(
    @Param('tipoEntidadCodigo') tipoEntidadCodigo: string,
    @Param('entidadId', BigintIdPipe) entidadId: number | string,
    @Req() req: ActorRequest,
    @Query('incluir_eliminadas') incluirEliminadas?: string,
  ) {
    const includeDeleted =
      incluirEliminadas === 'true' || incluirEliminadas === '1';

    return this.evidenciasTrazabilidadService.findByEntidad(
      tipoEntidadCodigo,
      entidadId,
      includeDeleted,
      req.actor,
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
    @Param('recoleccionId', BigintIdPipe) recoleccionId: number | string,
    @Req() req: ActorRequest,
    @Query('incluir_eliminadas') incluirEliminadas?: string,
  ) {
    const includeDeleted =
      incluirEliminadas === 'true' || incluirEliminadas === '1';

    return this.evidenciasTrazabilidadService.findByRecoleccion(
      recoleccionId,
      includeDeleted,
      req.actor,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener evidencia por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de evidencia' })
  @ApiResponse({ status: 200, description: 'Evidencia obtenida' })
  @ApiResponse({ status: 404, description: 'Evidencia no encontrada' })
  async findOne(
    @Param('id', BigintIdPipe) id: number | string,
    @Req() req: ActorRequest,
  ) {
    return this.evidenciasTrazabilidadService.findOne(id, req.actor);
  }
}
