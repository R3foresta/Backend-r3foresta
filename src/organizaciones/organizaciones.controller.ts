import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  Headers,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiBorrarLogo,
  ApiBorrarOrganizacion,
  ApiCrearOrganizacion,
  ApiDetalleOrganizacion,
  ApiEditarOrganizacion,
  ApiListarOrganizaciones,
  ApiSubirLogo,
} from './docs/organizaciones.swagger';
import { CrearOrganizacionDto } from './dto/crear-organizacion.dto';
import { EditarOrganizacionDto } from './dto/editar-organizacion.dto';
import { TipoOrganizacion } from './enums/tipo-organizacion.enum';
import { OrganizacionesService } from './organizaciones.service';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_MIMETYPES = '.(png|jpeg|jpg|webp)';

@ApiTags('organizaciones')
@Controller('organizaciones')
export class OrganizacionesController {
  constructor(private readonly organizacionesService: OrganizacionesService) {}

  @Post()
  @ApiCrearOrganizacion()
  @UseInterceptors(FileInterceptor('logo'))
  crear(
    @Body() dto: CrearOrganizacionDto,
    @Headers('x-auth-id') authId: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_LOGO_BYTES }),
          new FileTypeValidator({ fileType: LOGO_MIMETYPES }),
        ],
      }),
    )
    logo?: Express.Multer.File,
  ) {
    return this.organizacionesService.crear(
      dto,
      this.requireAuthId(authId),
      logo,
    );
  }

  @Get()
  @ApiListarOrganizaciones()
  listar(
    @Headers('x-auth-id') authId: string | undefined,
    @Query('activo') activo?: string,
    @Query('tipo') tipo?: string,
  ) {
    this.requireAuthId(authId);
    return this.organizacionesService.listar({
      activo: this.parseBoolean(activo, 'activo'),
      tipo: this.parseTipo(tipo),
    });
  }

  @Get(':id')
  @ApiDetalleOrganizacion()
  obtenerPorId(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    this.requireAuthId(authId);
    return this.organizacionesService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiEditarOrganizacion()
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarOrganizacionDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.organizacionesService.editar(
      id,
      dto,
      this.requireAuthId(authId),
    );
  }

  @Post(':id/logo')
  @ApiSubirLogo()
  @UseInterceptors(FileInterceptor('logo'))
  subirLogo(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_LOGO_BYTES }),
          new FileTypeValidator({ fileType: LOGO_MIMETYPES }),
        ],
      }),
    )
    logo: Express.Multer.File,
  ) {
    return this.organizacionesService.subirLogo(
      id,
      logo,
      this.requireAuthId(authId),
    );
  }

  @Delete(':id/logo')
  @ApiBorrarLogo()
  borrarLogo(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.organizacionesService.borrarLogo(
      id,
      this.requireAuthId(authId),
    );
  }

  @Delete(':id')
  @ApiBorrarOrganizacion()
  borrar(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.organizacionesService.borrar(id, this.requireAuthId(authId));
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

  private parseBoolean(
    value: string | undefined,
    name: string,
  ): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    const n = value.trim().toLowerCase();
    if (n === 'true' || n === '1') return true;
    if (n === 'false' || n === '0') return false;
    throw new BadRequestException(
      `Filtro ${name} debe ser true/false (recibido: ${value})`,
    );
  }

  private parseTipo(value?: string): TipoOrganizacion | undefined {
    if (!value) return undefined;
    const upper = value.trim();
    const permitidos = Object.values(TipoOrganizacion) as string[];
    if (!permitidos.includes(upper)) {
      throw new BadRequestException(
        `Filtro tipo no valido. Permitidos: ${permitidos.join(', ')}`,
      );
    }
    return upper as TipoOrganizacion;
  }
}
