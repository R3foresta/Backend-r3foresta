import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { PlantacionesService } from '../application/plantaciones.service';
import {
  ApiCrearEvidenciaPendientePlantacion,
  ApiRegistrarPlantacion,
} from './docs/plantaciones.swagger';
import { CrearEvidenciaPendientePlantacionDto } from './dto/crear-evidencia-pendiente-plantacion.dto';
import { RegistrarPlantacionDto } from './dto/registrar-plantacion.dto';

@ApiTags('plantaciones')
@Controller('registros-plantacion')
export class PlantacionesController {
  constructor(private readonly plantacionesService: PlantacionesService) {}

  @Post('evidencias-pendientes')
  @ApiCrearEvidenciaPendientePlantacion()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 10 }]))
  crearEvidenciaPendiente(
    @Body() dto: CrearEvidenciaPendientePlantacionDto,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.plantacionesService.crearEvidenciasPendientes(
      dto,
      this.requireAuthId(authId),
      files?.fotos || [],
    );
  }

  @Post()
  @ApiRegistrarPlantacion()
  registrar(
    @Body() dto: RegistrarPlantacionDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    return this.plantacionesService.registrar(dto, this.requireAuthId(authId));
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
}
