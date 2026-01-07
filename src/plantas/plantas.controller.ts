import { Controller, Get, Query } from '@nestjs/common';
import { PlantasService } from './plantas.service';

@Controller('plantas')
export class PlantasController {
  constructor(private readonly plantasService: PlantasService) {}

  @Get()
  async findAll(@Query('q') search?: string) {
    return this.plantasService.findAll(search);
  }

  @Get('search')
  async search(@Query('q') term: string) {
    return this.plantasService.search(term);
  }
}
