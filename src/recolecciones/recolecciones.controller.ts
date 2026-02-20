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
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import * as qs from 'qs';
import { RecoleccionesService } from './recolecciones.service';
import { CreateRecoleccionDto } from './dto/create-recoleccion.dto';
import { FUENTES_UBICACION } from './dto/create-ubicacion.dto';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';

@ApiTags('recolecciones')
@Controller('recolecciones')
export class RecoleccionesController {
  constructor(private readonly recoleccionesService: RecoleccionesService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear nueva recolección',
    description:
      'Crea una nueva recolección con ubicación bajo el nuevo modelo (pais_id/division_id/sitio físico).',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({
    name: 'x-auth-id',
    description: 'ID de autenticación del usuario de Supabase',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos de la recolección (FormData)',
    schema: {
      type: 'object',
      required: [
        'fecha',
        'cantidad',
        'unidad',
        'tipo_material',
        'especie_nueva',
        'metodo_id',
        'ubicacion[latitud]',
        'ubicacion[longitud]',
      ],
      properties: {
        fecha: { type: 'string', format: 'date', example: '2024-01-20' },
        cantidad: { type: 'number', example: 2.5 },
        unidad: { type: 'string', example: 'kg' },
        tipo_material: {
          type: 'string',
          enum: ['SEMILLA', 'ESTACA', 'PLANTULA', 'INJERTO'],
        },
        estado: {
          type: 'string',
          enum: ['ALMACENADO', 'EN_PROCESO', 'UTILIZADO', 'DESCARTADO'],
        },
        especie_nueva: { type: 'boolean', example: false },
        planta_id: { type: 'number', example: 10 },
        metodo_id: { type: 'number', example: 1 },
        vivero_id: { type: 'number', example: 3 },
        nombre_cientifico: { type: 'string', example: 'Swietenia macrophylla' },
        nombre_comercial: { type: 'string', example: 'Mara' },
        observaciones: { type: 'string', example: 'Semillas en buen estado' },
        'ubicacion[pais_id]': { type: 'number', example: 1 },
        'ubicacion[division_id]': { type: 'number', example: 999 },
        'ubicacion[nombre]': { type: 'string', example: 'Parcela Don Lucho' },
        'ubicacion[referencia]': { type: 'string', example: 'Zona Sur' },
        'ubicacion[latitud]': { type: 'number', example: -16.5833 },
        'ubicacion[longitud]': { type: 'number', example: -68.15 },
        'ubicacion[precision_m]': { type: 'number', example: 10 },
        'ubicacion[fuente]': {
          type: 'string',
          enum: [...FUENTES_UBICACION],
          example: 'GPS_MOVIL',
        },
        'nueva_planta[especie]': { type: 'string', example: 'Jacarandá' },
        'nueva_planta[nombre_cientifico]': {
          type: 'string',
          example: 'Jacaranda mimosifolia',
        },
        'nueva_planta[variedad]': { type: 'string', example: 'Común' },
        'nueva_planta[tipo_planta]': { type: 'string', example: 'Árbol' },
        'nueva_planta[tipo_planta_otro]': { type: 'string', example: 'Palmera' },
        'nueva_planta[fuente]': {
          type: 'string',
          enum: ['NATIVA', 'INTRODUCIDA', 'ENDEMICA'],
        },
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Recolección creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Error de validación en los datos' })
  @ApiResponse({ status: 401, description: 'No autorizado - falta header x-auth-id' })
  @ApiResponse({ status: 403, description: 'Prohibido - usuario sin permisos' })
  @ApiResponse({ status: 404, description: 'Recurso no encontrado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async create(
    @Body() bodyRaw: any,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const parsedBody: any = qs.parse(bodyRaw);

    if (parsedBody.ubicacion) {
      this.assertNoLegacyUbicacionFields(parsedBody.ubicacion);
    }

    this.normalizeNumericFields(parsedBody);

    const createRecoleccionDto = plainToInstance(CreateRecoleccionDto, parsedBody);
    const errors = await validate(createRecoleccionDto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const messages = this.collectValidationMessages(errors).join('; ');
      throw new BadRequestException(`Validación fallida: ${messages}`);
    }

    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    const userRole = 'ADMIN';

    return this.recoleccionesService.create(
      createRecoleccionDto,
      authId,
      userRole,
      files?.fotos,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Listar recolecciones del usuario',
    description: 'Obtiene recolecciones con filtros opcionales y paginación.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({
    name: 'x-auth-id',
    description: 'ID de autenticación del usuario de Supabase',
    required: true,
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fecha_inicio', required: false, type: String })
  @ApiQuery({ name: 'fecha_fin', required: false, type: String })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['ALMACENADO', 'EN_PROCESO', 'UTILIZADO', 'DESCARTADO'],
  })
  @ApiQuery({
    name: 'tipo_material',
    required: false,
    enum: ['SEMILLA', 'ESTACA', 'PLANTULA', 'INJERTO'],
  })
  @ApiQuery({ name: 'vivero_id', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query() filters: FiltersRecoleccionDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    return this.recoleccionesService.findAll(authId, filters);
  }

  @Get('vivero/:viveroId')
  @ApiOperation({ summary: 'Listar recolecciones por vivero' })
  @ApiParam({ name: 'viveroId', type: Number, description: 'ID del vivero' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fecha_inicio', required: false, type: String })
  @ApiQuery({ name: 'fecha_fin', required: false, type: String })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['ALMACENADO', 'EN_PROCESO', 'UTILIZADO', 'DESCARTADO'],
  })
  @ApiQuery({
    name: 'tipo_material',
    required: false,
    enum: ['SEMILLA', 'ESTACA', 'PLANTULA', 'INJERTO'],
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findByVivero(
    @Param('viveroId', ParseIntPipe) viveroId: number,
    @Query() filters: FiltersRecoleccionDto,
  ) {
    return this.recoleccionesService.findByVivero(viveroId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de recolección' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recoleccionesService.findOne(id);
  }

  private normalizeNumericFields(parsedBody: any): void {
    if (parsedBody.cantidad !== undefined) {
      parsedBody.cantidad = Number(parsedBody.cantidad);
    }
    if (parsedBody.vivero_id !== undefined) {
      parsedBody.vivero_id = Number(parsedBody.vivero_id);
    }
    if (parsedBody.metodo_id !== undefined) {
      parsedBody.metodo_id = Number(parsedBody.metodo_id);
    }
    if (parsedBody.planta_id !== undefined) {
      parsedBody.planta_id = Number(parsedBody.planta_id);
    }
    if (parsedBody.especie_nueva !== undefined) {
      parsedBody.especie_nueva =
        parsedBody.especie_nueva === true ||
        parsedBody.especie_nueva === 'true';
    }

    if (parsedBody.ubicacion) {
      if (parsedBody.ubicacion.latitud !== undefined) {
        parsedBody.ubicacion.latitud = Number(parsedBody.ubicacion.latitud);
      }
      if (parsedBody.ubicacion.longitud !== undefined) {
        parsedBody.ubicacion.longitud = Number(parsedBody.ubicacion.longitud);
      }
      if (parsedBody.ubicacion.pais_id !== undefined) {
        parsedBody.ubicacion.pais_id = Number(parsedBody.ubicacion.pais_id);
      }
      if (parsedBody.ubicacion.division_id !== undefined) {
        parsedBody.ubicacion.division_id = Number(parsedBody.ubicacion.division_id);
      }
      if (parsedBody.ubicacion.precision_m !== undefined) {
        parsedBody.ubicacion.precision_m = Number(parsedBody.ubicacion.precision_m);
      }
    }
  }

  private assertNoLegacyUbicacionFields(ubicacion: Record<string, unknown>): void {
    const legacyFields = [
      'pais',
      'departamento',
      'provincia',
      'municipio',
      'comunidad',
      'zona',
    ];

    const foundLegacyField = legacyFields.find(
      (field) => ubicacion[field] !== undefined,
    );

    if (foundLegacyField) {
      throw new BadRequestException(
        `El campo legacy ubicacion.${foundLegacyField} ya no se soporta. Usa pais_id/division_id/nombre/referencia/latitud/longitud/precision_m/fuente.`,
      );
    }
  }

  private collectValidationMessages(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children && error.children.length > 0) {
        messages.push(...this.collectValidationMessages(error.children));
      }
    }

    return messages;
  }
}
