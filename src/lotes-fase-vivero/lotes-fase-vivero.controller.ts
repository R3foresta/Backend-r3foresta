import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { LotesFaseViveroService } from './lotes-fase-vivero.service';
import { FiltersLoteFaseViveroDto } from './dto/filters-lote-fase-vivero.dto';

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
}
