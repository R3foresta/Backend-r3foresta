import { Controller, Get } from '@nestjs/common';
import { MetodosRecoleccionService } from './metodos-recoleccion.service';

@Controller('metodos-recoleccion')
export class MetodosRecoleccionController {
  constructor(
    private readonly metodosRecoleccionService: MetodosRecoleccionService,
  ) {}

  @Get()
  async findAll() {
    return this.metodosRecoleccionService.findAll();
  }
}
