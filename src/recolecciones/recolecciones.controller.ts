import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  Headers,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as qs from 'qs';
import { RecoleccionesService } from './recolecciones.service';
import { CreateRecoleccionDto } from './dto/create-recoleccion.dto';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';

@ApiTags('recolecciones')
@Controller('recolecciones')
export class RecoleccionesController {
  constructor(private readonly recoleccionesService: RecoleccionesService) {}

  /**
   * POST /api/recolecciones
   * Crea una nueva recolección
   */
  @Post()
  @ApiOperation({
    summary: 'Crear nueva recolección',
    description: `Crea una nueva recolección de material vegetal con fotos, ubicación y datos de planta.
    
**Proceso automático:**
- ✅ Crea registro en base de datos con código de trazabilidad único (REC-YYYY-NNN)
- 📸 Sube fotos a Supabase Storage (máximo 5 fotos de 5MB c/u)
- ☁️ Genera metadata NFT y lo sube a IPFS mediante Pinata
- 🪙 Mintea NFT en blockchain automáticamente
- 🔗 Guarda URL de blockchain, token ID y transaction hash

**Autenticación:** Requiere header \`x-auth-id\` con el auth_id de Supabase.

**Autorización:** Solo usuarios con rol ADMIN o TECNICO pueden crear recolecciones.`,
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({
    name: 'x-auth-id',
    description: 'ID de autenticación del usuario de Supabase',
    required: true,
    example: 'user_2kL9xW3mN5pQ7rT8vY1zX',
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
        fecha: {
          type: 'string',
          format: 'date',
          description: 'Fecha de recolección (no puede ser futura ni mayor a 45 días atrás)',
          example: '2024-01-20',
        },
        cantidad: {
          type: 'number',
          description: 'Cantidad recolectada (mayor a 0)',
          example: 2.5,
        },
        unidad: {
          type: 'string',
          description: 'Unidad de medida',
          example: 'kg',
        },
        tipo_material: {
          type: 'string',
          enum: ['SEMILLA', 'ESTACA', 'PLANTULA', 'INJERTO'],
          description: 'Tipo de material vegetal recolectado',
          example: 'SEMILLA',
        },
        estado: {
          type: 'string',
          enum: ['ALMACENADO', 'EN_PROCESO', 'UTILIZADO', 'DESCARTADO'],
          description: 'Estado actual del material (default: ALMACENADO)',
          example: 'ALMACENADO',
        },
        especie_nueva: {
          type: 'boolean',
          description:
            'Si es true, se debe enviar nueva_planta. Si es false, se debe enviar planta_id',
          example: false,
        },
        planta_id: {
          type: 'number',
          description: 'ID de planta existente (requerido si especie_nueva = false)',
          example: 10,
        },
        metodo_id: {
          type: 'number',
          description: 'ID del método de recolección',
          example: 1,
        },
        vivero_id: {
          type: 'number',
          description: 'ID del vivero (opcional)',
          example: 3,
        },
        nombre_cientifico: {
          type: 'string',
          description: 'Nombre científico de la especie',
          example: 'Swietenia macrophylla',
        },
        nombre_comercial: {
          type: 'string',
          description: 'Nombre comercial o común',
          example: 'Mara',
        },
        observaciones: {
          type: 'string',
          description: 'Observaciones adicionales (máximo 1000 caracteres)',
          example: 'Semillas de alta calidad, bien conservadas',
        },
        'ubicacion[pais]': {
          type: 'string',
          description: 'País',
          example: 'Bolivia',
        },
        'ubicacion[departamento]': {
          type: 'string',
          description: 'Departamento',
          example: 'Santa Cruz',
        },
        'ubicacion[provincia]': {
          type: 'string',
          description: 'Provincia',
          example: 'Velasco',
        },
        'ubicacion[comunidad]': {
          type: 'string',
          description: 'Comunidad',
          example: 'San Ignacio',
        },
        'ubicacion[zona]': {
          type: 'string',
          description: 'Zona específica',
          example: 'Central',
        },
        'ubicacion[latitud]': {
          type: 'number',
          description: 'Latitud (entre -90 y 90)',
          example: -16.5833,
        },
        'ubicacion[longitud]': {
          type: 'number',
          description: 'Longitud (entre -180 y 180)',
          example: -68.15,
        },
        'nueva_planta[especie]': {
          type: 'string',
          description: 'Nombre común de la especie (requerido si especie_nueva = true)',
          example: 'Jacarandá',
        },
        'nueva_planta[nombre_cientifico]': {
          type: 'string',
          description: 'Nombre científico (requerido si especie_nueva = true)',
          example: 'Jacaranda mimosifolia',
        },
        'nueva_planta[variedad]': {
          type: 'string',
          description: 'Variedad (requerido si especie_nueva = true)',
          example: 'Común',
        },
        'nueva_planta[tipo_planta]': {
          type: 'string',
          description: 'Tipo de planta',
          example: 'Árbol',
        },
        'nueva_planta[tipo_planta_otro]': {
          type: 'string',
          description: 'Si tipo_planta es "Otro"',
          example: 'Palmera',
        },
        'nueva_planta[fuente]': {
          type: 'string',
          enum: ['NATIVA', 'INTRODUCIDA', 'ENDEMICA'],
          description: 'Origen de la especie',
          example: 'NATIVA',
        },
        fotos: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Fotos de la recolección (máximo 5, 5MB cada una, formatos: JPG, JPEG, PNG)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Recolección creada exitosamente con NFT minteado',
    schema: {
      example: {
        success: true,
        data: {
          id: 123,
          codigo_trazabilidad: 'REC-2024-045',
          fecha: '2024-01-20',
          cantidad: 2.5,
          unidad: 'kg',
          tipo_material: 'SEMILLA',
          estado: 'ALMACENADO',
          blockchain_url:
            'https://shannon-explorer.somnia.network/token/0x4bb21533f7803BBce74421f6bdfc4B6c57706EA2/instance/456',
          token_id: '456',
          transaction_hash: '0xabc123...',
          usuario: {
            id: 10,
            nombre: 'Juan Pérez',
            username: 'jperez',
          },
          planta: {
            id: 5,
            especie: 'Mara',
            nombre_cientifico: 'Swietenia macrophylla',
          },
          ubicacion: {
            pais: 'Bolivia',
            departamento: 'Santa Cruz',
            latitud: -16.5833,
            longitud: -68.15,
          },
          fotos: [
            {
              id: 500,
              url: 'https://supabase.co/storage/.../foto1.jpg',
              peso_bytes: 2048576,
              formato: 'JPG',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación en los datos',
    schema: {
      example: {
        statusCode: 400,
        message:
          'Validación fallida: La fecha debe ser válida; La cantidad debe ser mayor a 0',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado - falta header x-auth-id',
    schema: {
      example: {
        statusCode: 401,
        message: 'Header x-auth-id es requerido',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Prohibido - usuario sin permisos',
    schema: {
      example: {
        statusCode: 403,
        message:
          'No tienes permisos para crear recolecciones. Solo usuarios con rol ADMIN o TECNICO pueden realizar esta acción.',
        error: 'Forbidden',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Recurso no encontrado (usuario, planta, vivero o método)',
    schema: {
      example: {
        statusCode: 404,
        message: 'Usuario con auth_id user_123 no encontrado',
        error: 'Not Found',
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  // @UseGuards(JwtAuthGuard) // Descomentar cuando tengas el guard configurado
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async create(
    @Body() bodyRaw: any,
    @Headers('x-auth-id') authId?: string,
    // @Request() req: any, // Descomentar cuando tengas el guard
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    // Parsear datos anidados de FormData (ubicacion[pais], nueva_planta[especie], etc.)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const parsedBody: any = qs.parse(bodyRaw);
    
    // Convertir strings a tipos correctos
    if (parsedBody.cantidad) {
      parsedBody.cantidad = parseFloat(parsedBody.cantidad);
    }
    if (parsedBody.vivero_id) {
      parsedBody.vivero_id = parseInt(parsedBody.vivero_id, 10);
    }
    if (parsedBody.metodo_id) {
      parsedBody.metodo_id = parseInt(parsedBody.metodo_id, 10);
    }
    if (parsedBody.planta_id) {
      parsedBody.planta_id = parseInt(parsedBody.planta_id, 10);
    }
    if (parsedBody.especie_nueva !== undefined) {
      parsedBody.especie_nueva = parsedBody.especie_nueva === 'true';
    }
    
    // Convertir coordenadas a números
    if (parsedBody.ubicacion) {
      if (parsedBody.ubicacion.latitud) {
        parsedBody.ubicacion.latitud = parseFloat(parsedBody.ubicacion.latitud);
      }
      if (parsedBody.ubicacion.longitud) {
        parsedBody.ubicacion.longitud = parseFloat(parsedBody.ubicacion.longitud);
      }
    }
    
    // Convertir a DTO y validar
    const createRecoleccionDto = plainToInstance(CreateRecoleccionDto, parsedBody);
    const errors = await validate(createRecoleccionDto);
    
    if (errors.length > 0) {
      const messages = errors.map(err => Object.values(err.constraints || {}).join(', ')).join('; ');
      throw new BadRequestException(`Validación fallida: ${messages}`);
    }
    
    // Validar que se envió el auth_id
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    // TODO: Descomentar cuando tengas autenticación JWT
    // const authId = req.user.sub; // auth_id desde el JWT
    // const userRole = req.user.rol;
    
    const userRole = 'ADMIN'; // Cambiar por req.user.rol cuando tengas JWT

    return this.recoleccionesService.create(
      createRecoleccionDto,
      authId,
      userRole,
      files?.fotos,
    );
  }

  /**
   * GET /api/recolecciones
   * Lista recolecciones del usuario autenticado con filtros
   */
  @Get()
  @ApiOperation({
    summary: 'Listar recolecciones del usuario',
    description: `Obtiene todas las recolecciones del usuario autenticado con filtros opcionales y paginación.

**Autenticación:** Requiere header \`x-auth-id\` con el auth_id de Supabase.

**Filtros disponibles:**
- 📅 Por rango de fechas (fecha_inicio, fecha_fin)
- 📦 Por estado (ALMACENADO, EN_PROCESO, UTILIZADO, DESCARTADO)
- 🏭 Por vivero (vivero_id)
- 🌱 Por tipo de material (SEMILLA, ESTACA, PLANTULA, INJERTO)
- 🔍 Búsqueda por nombre de planta (search)

**Paginación:** Soporta \`page\` y \`limit\` (máximo 50 registros por página).`,
  })
  @ApiSecurity('x-auth-id')
  @ApiHeader({
    name: 'x-auth-id',
    description: 'ID de autenticación del usuario de Supabase',
    required: true,
    example: 'user_2kL9xW3mN5pQ7rT8vY1zX',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Registros por página (default: 10, max: 50)',
    example: 10,
  })
  @ApiQuery({
    name: 'fecha_inicio',
    required: false,
    type: String,
    description: 'Fecha de inicio del filtro (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'fecha_fin',
    required: false,
    type: String,
    description: 'Fecha de fin del filtro (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['ALMACENADO', 'EN_PROCESO', 'UTILIZADO', 'DESCARTADO'],
    description: 'Filtrar por estado de recolección',
    example: 'ALMACENADO',
  })
  @ApiQuery({
    name: 'tipo_material',
    required: false,
    enum: ['SEMILLA', 'ESTACA', 'PLANTULA', 'INJERTO'],
    description: 'Filtrar por tipo de material',
    example: 'SEMILLA',
  })
  @ApiQuery({
    name: 'vivero_id',
    required: false,
    type: Number,
    description: 'Filtrar por ID de vivero',
    example: 3,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Buscar por nombre científico o comercial',
    example: 'mara',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de recolecciones obtenida exitosamente',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 123,
            codigo_trazabilidad: 'REC-2024-045',
            fecha: '2024-01-20',
            cantidad: 2.5,
            unidad: 'kg',
            tipo_material: 'SEMILLA',
            estado: 'ALMACENADO',
            usuario: { id: 10, nombre: 'Juan Pérez', username: 'jperez' },
            planta: {
              id: 5,
              especie: 'Mara',
              nombre_cientifico: 'Swietenia macrophylla',
            },
            ubicacion: {
              departamento: 'Santa Cruz',
              comunidad: 'San Ignacio',
            },
            vivero: { id: 3, nombre: 'Vivero Central' },
            fotos: [],
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 45,
          totalPages: 5,
          hasNextPage: true,
          hasPrevPage: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado - falta header x-auth-id',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  // @UseGuards(JwtAuthGuard) // Descomentar cuando tengas el guard configurado
  async findAll(
    @Query() filters: FiltersRecoleccionDto,
    @Headers('x-auth-id') authId?: string,
    // @Request() req: any, // Descomentar cuando tengas el guard
  ) {
    // Validar que se envió el auth_id
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    // TODO: Descomentar cuando tengas autenticación JWT
    // const authId = req.user.sub; // auth_id desde el JWT
    
    return this.recoleccionesService.findAll(authId, filters);
  }

  /**
   * GET /api/recolecciones/vivero/:viveroId
   * Lista recolecciones por vivero
   */
  @Get('vivero/:viveroId')
  @ApiOperation({
    summary: 'Listar recolecciones por vivero',
    description: `Obtiene todas las recolecciones asociadas a un vivero específico con filtros y paginación.

**Nota:** Este endpoint NO requiere autenticación y es público.

**Filtros disponibles:** Mismos filtros que el endpoint principal.`,
  })
  @ApiParam({
    name: 'viveroId',
    type: Number,
    description: 'ID del vivero',
    example: 3,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número de página (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Registros por página (default: 10, max: 50)',
  })
  @ApiQuery({
    name: 'fecha_inicio',
    required: false,
    type: String,
    description: 'Fecha de inicio (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'fecha_fin',
    required: false,
    type: String,
    description: 'Fecha de fin (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['ALMACENADO', 'EN_PROCESO', 'UTILIZADO', 'DESCARTADO'],
    description: 'Filtrar por estado',
  })
  @ApiQuery({
    name: 'tipo_material',
    required: false,
    enum: ['SEMILLA', 'ESTACA', 'PLANTULA', 'INJERTO'],
    description: 'Filtrar por tipo de material',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Buscar por nombre',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de recolecciones del vivero',
  })
  @ApiResponse({
    status: 404,
    description: 'Vivero no encontrado',
  })
  async findByVivero(
    @Param('viveroId', ParseIntPipe) viveroId: number,
    @Query() filters: FiltersRecoleccionDto,
  ) {
    return this.recoleccionesService.findByVivero(viveroId, filters);
  }

  /**
   * GET /api/recolecciones/:id
   * Obtiene detalle de una recolección
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle de recolección',
    description: `Obtiene todos los detalles de una recolección específica incluyendo:

- 📋 Información completa de la recolección
- 👤 Datos del usuario que la registró
- 🌍 Ubicación geográfica completa
- 🌱 Información de la planta/especie
- 🏭 Datos del vivero (si aplica)
- 🔧 Método de recolección utilizado
- 📸 Todas las fotos asociadas
- 🔗 Información de blockchain (URL, token ID, transaction hash)

**Nota:** Este endpoint es público y no requiere autenticación.`,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la recolección',
    example: 123,
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la recolección obtenido exitosamente',
    schema: {
      example: {
        success: true,
        data: {
          id: 123,
          codigo_trazabilidad: 'REC-2024-045',
          fecha: '2024-01-20',
          nombre_cientifico: 'Swietenia macrophylla',
          nombre_comercial: 'Mara',
          cantidad: 2.5,
          unidad: 'kg',
          tipo_material: 'SEMILLA',
          estado: 'ALMACENADO',
          especie_nueva: false,
          observaciones: 'Semillas en buen estado',
          blockchain_url:
            'https://shannon-explorer.somnia.network/token/0x.../instance/456',
          token_id: '456',
          transaction_hash: '0xabc123...',
          created_at: '2024-01-20T10:30:00Z',
          usuario: {
            id: 10,
            nombre: 'Juan Pérez',
            username: 'jperez',
            correo: 'juan@example.com',
          },
          ubicacion: {
            id: 200,
            pais: 'Bolivia',
            departamento: 'Santa Cruz',
            provincia: 'Velasco',
            comunidad: 'San Ignacio',
            zona: 'Central',
            latitud: -16.5833,
            longitud: -68.15,
          },
          vivero: {
            id: 3,
            codigo: 'VIV-003',
            nombre: 'Vivero Central',
          },
          metodo: {
            id: 1,
            nombre: 'Manual',
            descripcion: 'Recolección manual directa',
          },
          planta: {
            id: 5,
            especie: 'Mara',
            nombre_cientifico: 'Swietenia macrophylla',
            variedad: 'Común',
            fuente: 'NATIVA',
          },
          fotos: [
            {
              id: 500,
              recoleccion_id: 123,
              url: 'https://supabase.co/storage/.../foto1.jpg',
              peso_bytes: 2048576,
              formato: 'JPG',
              created_at: '2024-01-20T10:30:05Z',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Recolección no encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Recolección no encontrada',
        error: 'Not Found',
      },
    },
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recoleccionesService.findOne(id);
  }
}
