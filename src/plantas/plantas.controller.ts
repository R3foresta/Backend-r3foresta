import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlantasService } from './plantas.service';
import { CreatePlantaDto } from './dto/create-planta.dto';
import { CreateTipoPlantaDto } from './dto/create-tipo-planta.dto';
import { ListPlantasQueryDto } from './dto/list-plantas-query.dto';
import { UpdatePlantaDto } from './dto/update-planta.dto';

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // 5 MB — el frontend comprime, pero el límite real de entrada es 5 MB
const IMAGEN_MIMETYPES = '.(png|jpeg|jpg|webp)';

@ApiTags('plantas')
@Controller('plantas')
export class PlantasController {
  constructor(private readonly plantasService: PlantasService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar plantas',
    description:
      'Lista paginada del catalogo de plantas. Por defecto solo retorna activas.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Filtro de busqueda por especie, nombre cientifico o nombres comunes',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'incluir_inactivas',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiQuery({
    name: 'tipo_planta_id',
    required: false,
    type: Number,
    description: 'Filtra por tipo de planta',
  })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente' })
  @ApiResponse({ status: 400, description: 'Parametros invalidos' })
  async listar(@Query() query: ListPlantasQueryDto) {
    return this.plantasService.listar(query);
  }

  @Get('tipos-planta')
  @ApiOperation({
    summary: 'Listar tipos de planta',
    description:
      'Catalogo de tipos de planta disponibles (Arbol, Arbusto, etc.).',
  })
  @ApiResponse({ status: 200, description: 'Tipos obtenidos correctamente' })
  async listarTiposPlanta() {
    return this.plantasService.listarTiposPlanta();
  }

  @Post('tipos-planta')
  @ApiOperation({ summary: 'Crear un tipo de planta' })
  @ApiBody({ type: CreateTipoPlantaDto })
  @ApiResponse({ status: 201, description: 'Tipo creado correctamente' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 409, description: 'Tipo duplicado' })
  async crearTipoPlanta(@Body() dto: CreateTipoPlantaDto) {
    return this.plantasService.crearTipoPlanta(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener planta por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Planta obtenida' })
  @ApiResponse({ status: 404, description: 'Planta no encontrada' })
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    return this.plantasService.obtenerPorId(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear planta',
    description:
      'Crea una planta en el catalogo. El campo `imagen` es opcional (multipart/form-data, max 2MB, png/jpg/jpeg/webp).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['especie', 'nombre_cientifico', 'variedad', 'tipo_planta_id'],
      properties: {
        especie: { type: 'string', example: 'Caoba' },
        nombre_cientifico: { type: 'string', example: 'Swietenia macrophylla' },
        variedad: { type: 'string', example: 'Hondurena' },
        tipo_planta_id: { type: 'number', example: 1 },
        nombre_comun_principal: { type: 'string', example: 'Caoba' },
        nombres_comunes: { type: 'string', example: 'Caoba, Mahogany' },
        notas: { type: 'string' },
        imagen: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Planta creada' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 404, description: 'tipo_planta_id no encontrado' })
  @ApiResponse({ status: 409, description: 'Planta duplicada' })
  @UseInterceptors(FileInterceptor('imagen'))
  async crear(
    @Body() dto: CreatePlantaDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGEN_BYTES }),
          new FileTypeValidator({ fileType: IMAGEN_MIMETYPES }),
        ],
      }),
    )
    imagen?: Express.Multer.File,
  ) {
    return this.plantasService.crear(dto, imagen);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar planta',
    description:
      'Actualiza campos parciales. multipart/form-data; todos los campos son opcionales incluyendo `imagen`.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        especie: { type: 'string' },
        nombre_cientifico: { type: 'string' },
        variedad: { type: 'string' },
        tipo_planta_id: { type: 'number' },
        nombre_comun_principal: { type: 'string' },
        nombres_comunes: { type: 'string' },
        notas: { type: 'string' },
        activo: { type: 'boolean' },
        imagen: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Planta actualizada' })
  @ApiResponse({ status: 404, description: 'Planta o tipo no encontrado' })
  @ApiResponse({ status: 409, description: 'Planta duplicada' })
  @UseInterceptors(FileInterceptor('imagen'))
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantaDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGEN_BYTES }),
          new FileTypeValidator({ fileType: IMAGEN_MIMETYPES }),
        ],
      }),
    )
    imagen?: Express.Multer.File,
  ) {
    return this.plantasService.actualizar(id, dto, imagen);
  }

  @Patch(':id/desactivar')
  @ApiOperation({
    summary: 'Desactivar planta',
    description:
      'Soft delete: marca activo=false. La planta deja de aparecer en el listado pero las referencias en recolecciones y lotes-vivero se conservan.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Planta desactivada' })
  @ApiResponse({ status: 404, description: 'Planta no encontrada' })
  async desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.plantasService.desactivar(id);
  }
}
