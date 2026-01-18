import { Controller, Get } from '@nestjs/common';

@Controller('pingrepet')
export class PingrepetController {
  @Get('health')
  health() {
    return { status: 'ok', time: new Date() };
  }
}
