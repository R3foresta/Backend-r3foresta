import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { PlantasService } from './plantas.service';
import { CreatePlantaDto } from './dto/create-planta.dto';
import { CreateTipoPlantaDto } from './dto/create-tipo-planta.dto';

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

  @Get('tipos-planta')
  async findAllTiposPlanta() {
    return this.plantasService.findAllTiposPlanta();
  }

  @Post('tipos-planta')
  async createTipoPlanta(@Body() createTipoPlantaDto: CreateTipoPlantaDto) {
    return this.plantasService.createTipoPlanta(createTipoPlantaDto);
  }

  @Post()
  async create(@Body() createPlantaDto: CreatePlantaDto) {
    return this.plantasService.create(createPlantaDto);
  }
}
