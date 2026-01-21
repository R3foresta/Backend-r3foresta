import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import * as qs from 'qs';
import { LotesFaseViveroService } from './lotes-fase-vivero.service';
import { FiltersLoteFaseViveroDto } from './dto/filters-lote-fase-vivero.dto';
import { CreateLoteFaseViveroDto } from './dto/create-lote-fase-vivero.dto';

@Controller('lotes-fase-vivero')
export class LotesFaseViveroController {
  constructor(private readonly lotesFaseViveroService: LotesFaseViveroService) {}

  @Get()
  async findAll(@Query() filters: FiltersLoteFaseViveroDto) {
    return this.lotesFaseViveroService.findAll(filters);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.lotesFaseViveroService.findOne(id);
  }

  /**
   * POST /api/lotes-fase-vivero
   * Crea un lote en fase vivero
   */
  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async create(
    @Body() bodyRaw: any,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    const parsedBody: any = qs.parse(bodyRaw);

    if (parsedBody.planta_id) {
      parsedBody.planta_id = Number(parsedBody.planta_id);
    }
    if (parsedBody.vivero_id) {
      parsedBody.vivero_id = Number(parsedBody.vivero_id);
    }
    if (parsedBody.responsable_id) {
      parsedBody.responsable_id = Number(parsedBody.responsable_id);
    }
    if (parsedBody.cantidad_inicio) {
      parsedBody.cantidad_inicio = Number(parsedBody.cantidad_inicio);
    }

    if (parsedBody.recoleccion_ids) {
      if (Array.isArray(parsedBody.recoleccion_ids)) {
        parsedBody.recoleccion_ids = parsedBody.recoleccion_ids.map((id: string) =>
          Number(id),
        );
      } else if (typeof parsedBody.recoleccion_ids === 'string') {
        const rawIds = parsedBody.recoleccion_ids.trim();
        if (rawIds.startsWith('[')) {
          try {
            parsedBody.recoleccion_ids = JSON.parse(rawIds).map((id: string) =>
              Number(id),
            );
          } catch (error) {
            throw new BadRequestException('recoleccion_ids no es valido');
          }
        } else if (rawIds.includes(',')) {
          parsedBody.recoleccion_ids = rawIds
            .split(',')
            .map((id: string) => Number(id.trim()));
        } else {
          parsedBody.recoleccion_ids = [Number(rawIds)];
        }
      }
    }

    const createLoteFaseViveroDto = plainToClass(
      CreateLoteFaseViveroDto,
      parsedBody,
    );
    const errors = await validate(createLoteFaseViveroDto);

    if (errors.length > 0) {
      const messages = errors
        .map((err) => Object.values(err.constraints || {}).join(', '))
        .join('; ');
      throw new BadRequestException(`Validacion fallida: ${messages}`);
    }

    return this.lotesFaseViveroService.create(
      createLoteFaseViveroDto,
      files?.fotos,
    );
  }
}
