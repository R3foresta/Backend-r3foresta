import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateFlexDivisionDto } from './dto/create-flex-division.dto';
import { ListDivisionesQueryDto } from './dto/list-divisiones-query.dto';
import { UbicacionesService } from './ubicaciones.service';

@Controller('ubicaciones')
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}

  @Get('paises')
  async findPaises() {
    return this.ubicacionesService.findPaises();
  }

  @Get('divisiones')
  async findDivisiones(@Query() query: ListDivisionesQueryDto) {
    return this.ubicacionesService.findDivisiones(
      Number(query.pais_id),
      query.parent_id === undefined ? undefined : Number(query.parent_id),
    );
  }

  @Post('divisiones/flexible')
  async ensureFlexibleDivision(@Body() body: CreateFlexDivisionDto) {
    return this.ubicacionesService.ensureFlexibleDivision(body);
  }
}

