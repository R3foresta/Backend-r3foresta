import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
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
import {
  CreateRecoleccionDto,
  TIPOS_MATERIAL_RECOLECCION_INPUT,
} from './dto/create-recoleccion.dto';
import { FUENTES_UBICACION } from './dto/create-ubicacion.dto';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';
import { RecoleccionElegibilidadViveroQueryDto } from './dto/recoleccion-elegibilidad-vivero-query.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';

@ApiTags('recolecciones')
@Controller('recolecciones')
export class RecoleccionesController {
  constructor(private readonly recoleccionesService: RecoleccionesService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Creación
  // ─────────────────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Crear nueva recolección (Canónica)',
    description:
      'Crea una recolección bajo la verdad canónica del módulo (sin campos legacy). Se crea en estado BORRADOR.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({
    name: 'x-auth-id',
    description: 'ID de autenticación del usuario de Supabase',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos canónicos de la recolección (FormData)',
    schema: {
      type: 'object',
      required: [
        'fecha',
        'cantidad_inicial_canonica',
        'unidad_canonica',
        'tipo_material',
        'planta_id',
        'metodo_id',
        'ubicacion[latitud]',
        'ubicacion[longitud]',
        'fotos',
      ],
      properties: {
        fecha: { type: 'string', format: 'date', example: '2026-03-04' },
        cantidad_inicial_canonica: { type: 'number', example: 250 },
        unidad_canonica: {
          type: 'string',
          enum: ['KG', 'G', 'UNIDAD'],
          example: 'G',
        },
        tipo_material: {
          type: 'string',
          enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
          example: 'SEMILLA',
        },
        planta_id: { type: 'number', example: 10 },
        metodo_id: { type: 'number', example: 1 },
        vivero_id: { type: 'number', example: 3 },
        observaciones: { type: 'string', example: 'Registro canónico de recolección' },
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
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Recolección creada exitosamente en estado BORRADOR' })
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
    return this.handleCreateCanonico(bodyRaw, authId, files?.fotos);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Flujo de estados
  // ─────────────────────────────────────────────────────────────────────────────

  @Patch(':id/draft')
  @ApiOperation({
    summary: 'Editar borrador de recolección',
    description:
      'Permite editar una recolección en BORRADOR o RECHAZADO. Si estaba RECHAZADO, vuelve a BORRADOR.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({ name: 'x-auth-id', description: 'ID de autenticación del usuario', required: true })
  @ApiHeader({ name: 'x-user-role', description: 'Rol del usuario (ADMIN, GENERAL, VALIDADOR, VOLUNTARIO)', required: true })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', format: 'date', example: '2026-03-04' },
        cantidad_inicial_canonica: { type: 'number', example: 250 },
        unidad_canonica: {
          type: 'string',
          enum: ['KG', 'G', 'UNIDAD'],
          example: 'G',
        },
        tipo_material: {
          type: 'string',
          enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
          example: 'SEMILLA',
        },
        observaciones: { type: 'string', example: 'Actualización de datos' },
        vivero_id: { type: 'number', example: 3 },
        metodo_id: { type: 'number', example: 1 },
        planta_id: { type: 'number', example: 10 },
        fotos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Borrador actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Estado no permite edición' })
  @ApiResponse({ status: 403, description: 'Sin permisos para editar' })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() bodyRaw: any,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    const dto = await this.parseAndValidateUpdateDraftBody(bodyRaw);

    return this.recoleccionesService.updateDraft(
      id,
      dto,
      authId,
      userRole || 'GENERAL',
      files?.fotos,
    );
  }

  @Patch(':id/submit')
  @ApiOperation({
    summary: 'Enviar recolección a validación',
    description: 'Cambia el estado de BORRADOR a PENDIENTE_VALIDACION. Solo el creador o ADMIN.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({ name: 'x-auth-id', description: 'ID de autenticación del usuario', required: true })
  @ApiHeader({ name: 'x-user-role', description: 'Rol del usuario', required: true })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' })
  @ApiResponse({ status: 200, description: 'Recolección enviada a validación' })
  @ApiResponse({ status: 400, description: 'Estado no permite envío a validación' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  async submitForValidation(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    return this.recoleccionesService.submitForValidation(id, authId, userRole || 'GENERAL');
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Aprobar validación de recolección',
    description:
      'Cambia PENDIENTE_VALIDACION → VALIDADO. Solo VALIDADOR o ADMIN. Ejecuta Pinata + Blockchain.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({ name: 'x-auth-id', description: 'ID de autenticación del usuario', required: true })
  @ApiHeader({ name: 'x-user-role', description: 'Rol del usuario (VALIDADOR o ADMIN)', required: true })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' })
  @ApiResponse({ status: 200, description: 'Recolección validada y minteada en blockchain' })
  @ApiResponse({ status: 400, description: 'Estado no permite aprobación' })
  @ApiResponse({ status: 403, description: 'Sin permisos de validador' })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  async approveValidation(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    if (!userRole) {
      throw new BadRequestException('Header x-user-role es requerido para validar');
    }

    return this.recoleccionesService.approveValidation(id, authId, userRole);
  }

  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Rechazar validación de recolección',
    description:
      'Cambia PENDIENTE_VALIDACION → RECHAZADO. Solo VALIDADOR o ADMIN. Requiere motivo.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({ name: 'x-auth-id', description: 'ID de autenticación del usuario', required: true })
  @ApiHeader({ name: 'x-user-role', description: 'Rol del usuario (VALIDADOR o ADMIN)', required: true })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' })
  @ApiBody({ type: RejectValidationDto })
  @ApiResponse({ status: 200, description: 'Recolección rechazada' })
  @ApiResponse({ status: 400, description: 'Estado no permite rechazo' })
  @ApiResponse({ status: 403, description: 'Sin permisos de validador' })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  async rejectValidation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectValidationDto,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    if (!userRole) {
      throw new BadRequestException('Header x-user-role es requerido para rechazar');
    }

    return this.recoleccionesService.rejectValidation(id, authId, userRole, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Consultas
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('pending-validation')
  @ApiOperation({
    summary: 'Listar recolecciones pendientes de validación',
    description: 'Devuelve recolecciones en estado PENDIENTE_VALIDACION con filtros y paginación. Usuarios con rol VALIDADOR o ADMIN ven TODAS las recolecciones pendientes, otros roles solo ven las suyas.',
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({ name: 'x-auth-id', description: 'ID de autenticación del usuario', required: true })
  @ApiHeader({ name: 'x-user-role', description: 'Rol del usuario (ADMIN, GENERAL, VALIDADOR, VOLUNTARIO)', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fecha_inicio', required: false, type: String })
  @ApiQuery({ name: 'fecha_fin', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'cantidad_solicitada_vivero',
    required: false,
    type: Number,
    description:
      'Cantidad a evaluar contra el saldo materializado para determinar elegibilidad hacia vivero.',
  })
  @ApiResponse({ status: 200, description: 'Lista de recolecciones pendientes de validación' })
  @ApiResponse({ status: 400, description: 'Header x-user-role es requerido' })
  @ApiResponse({ status: 401, description: 'Header x-auth-id es requerido' })
  async findPendingValidation(
    @Query() filters: FiltersRecoleccionDto,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    if (!userRole) {
      throw new BadRequestException('Header x-user-role es requerido');
    }

    return this.recoleccionesService.findPendingValidation(filters, authId, userRole);
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
    name: 'tipo_material',
    required: false,
    enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
  })
  @ApiQuery({ name: 'vivero_id', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'cantidad_solicitada_vivero',
    required: false,
    type: Number,
    description:
      'Cantidad a evaluar contra el saldo materializado para determinar elegibilidad hacia vivero.',
  })
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
  @ApiOperation({
    summary: 'Listar recolecciones por vivero',
    description:
      'Devuelve recolecciones del vivero con saldo materializado, estado operativo y elegibilidad para inicio de lote de vivero.',
  })
  @ApiParam({ name: 'viveroId', type: Number, description: 'ID del vivero' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'fecha_inicio', required: false, type: String })
  @ApiQuery({ name: 'fecha_fin', required: false, type: String })
  @ApiQuery({
    name: 'tipo_material',
    required: false,
    enum: [...TIPOS_MATERIAL_RECOLECCION_INPUT],
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'cantidad_solicitada_vivero',
    required: false,
    type: Number,
    description:
      'Cantidad a evaluar contra el saldo materializado para determinar elegibilidad hacia vivero.',
  })
  async findByVivero(
    @Param('viveroId', ParseIntPipe) viveroId: number,
    @Query() filters: FiltersRecoleccionDto,
  ) {
    return this.recoleccionesService.findByVivero(viveroId, filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle de recolección',
    description:
      'Devuelve saldo actual, estado operativo y elegibilidad para uso como origen de vivero.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la recolección' })
  @ApiQuery({
    name: 'cantidad_solicitada_vivero',
    required: false,
    type: Number,
    description:
      'Cantidad a evaluar contra el saldo materializado para determinar elegibilidad hacia vivero.',
  })
  @ApiResponse({ status: 404, description: 'Recolección no encontrada' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RecoleccionElegibilidadViveroQueryDto,
  ) {
    return this.recoleccionesService.findOne(
      id,
      query.cantidad_solicitada_vivero,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers privados del controller
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleCreateCanonico(
    bodyRaw: any,
    authId?: string,
    fotos?: any[],
  ) {
    const parsedBody = this.parseBodyRaw(bodyRaw);
    this.applyLegacyFieldAliases(parsedBody);

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

    return this.recoleccionesService.create(
      createRecoleccionDto,
      authId,
      undefined,
      fotos,
    );
  }

  private normalizeNumericFields(parsedBody: any): void {
    if (parsedBody.cantidad_inicial_canonica !== undefined) {
      parsedBody.cantidad_inicial_canonica = Number(
        parsedBody.cantidad_inicial_canonica,
      );
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

  private async parseAndValidateUpdateDraftBody(
    bodyRaw: any,
  ): Promise<UpdateDraftDto> {
    const parsedBody = this.parseBodyRaw(bodyRaw);
    this.applyLegacyFieldAliases(parsedBody);
    this.normalizeUpdateDraftNumericFields(parsedBody);

    const updateDraftDto = plainToInstance(UpdateDraftDto, parsedBody);
    const errors = await validate(updateDraftDto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const messages = this.collectValidationMessages(errors).join('; ');
      throw new BadRequestException(`Validación fallida: ${messages}`);
    }

    return updateDraftDto;
  }

  private parseBodyRaw(bodyRaw: any): any {
    if (!bodyRaw) {
      return {};
    }

    if (typeof bodyRaw === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return this.parsePotentialJsonFields(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        qs.parse(bodyRaw),
      );
    }

    if (typeof bodyRaw === 'object') {
      const entries = Object.entries(bodyRaw);
      const hasBracketNotation = entries.some(([key]) => key.includes('['));

      if (hasBracketNotation) {
        const queryString = entries
          .map(
            ([key, value]) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(this.valueToString(value))}`,
          )
          .join('&');

        return this.parsePotentialJsonFields(qs.parse(queryString));
      }

      return this.parsePotentialJsonFields(bodyRaw);
    }

    return {};
  }

  private parsePotentialJsonFields(parsedBody: any): any {
    if (
      parsedBody &&
      typeof parsedBody === 'object' &&
      typeof parsedBody.ubicacion === 'string'
    ) {
      const rawUbicacion = String(parsedBody.ubicacion).trim();
      if (rawUbicacion.startsWith('{') && rawUbicacion.endsWith('}')) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          parsedBody.ubicacion = JSON.parse(rawUbicacion);
        } catch {
          // Si no es JSON válido, se deja tal cual para que class-validator responda.
        }
      }
    }

    return parsedBody;
  }

  private valueToString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private applyLegacyFieldAliases(parsedBody: any): void {
    if (!parsedBody || typeof parsedBody !== 'object') {
      return;
    }

    if (
      parsedBody.cantidad_inicial_canonica === undefined &&
      parsedBody.cantidadInicialCanonica !== undefined
    ) {
      parsedBody.cantidad_inicial_canonica = parsedBody.cantidadInicialCanonica;
    }

    if (
      parsedBody.unidad_canonica === undefined &&
      parsedBody.unidadCanonica !== undefined
    ) {
      parsedBody.unidad_canonica = parsedBody.unidadCanonica;
    }

    if (
      parsedBody.tipo_material === undefined &&
      parsedBody.tipoMaterial !== undefined
    ) {
      parsedBody.tipo_material = parsedBody.tipoMaterial;
    }

    if (parsedBody.metodo_id === undefined && parsedBody.metodoId !== undefined) {
      parsedBody.metodo_id = parsedBody.metodoId;
    }

    if (parsedBody.vivero_id === undefined && parsedBody.viveroId !== undefined) {
      parsedBody.vivero_id = parsedBody.viveroId;
    }

    if (parsedBody.planta_id === undefined) {
      if (parsedBody.plantaId !== undefined) {
        parsedBody.planta_id = parsedBody.plantaId;
      } else if (
        parsedBody.planta &&
        typeof parsedBody.planta === 'object' &&
        parsedBody.planta.id !== undefined
      ) {
        parsedBody.planta_id = parsedBody.planta.id;
      } else if (
        parsedBody.planta !== undefined &&
        (typeof parsedBody.planta === 'string' ||
          typeof parsedBody.planta === 'number')
      ) {
        parsedBody.planta_id = parsedBody.planta;
      }
    }
  }

  private normalizeUpdateDraftNumericFields(parsedBody: any): void {
    if (parsedBody.cantidad_inicial_canonica !== undefined) {
      parsedBody.cantidad_inicial_canonica = Number(
        parsedBody.cantidad_inicial_canonica,
      );
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
