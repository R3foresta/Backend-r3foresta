import { Controller, Get } from '@nestjs/common';
import { ViverosService } from './viveros.service';

@Controller('viveros')
export class ViverosController {
  constructor(private readonly viverosService: ViverosService) {}

  @Get()
  async findAll() {
    return this.viverosService.findAll();
  }
}
