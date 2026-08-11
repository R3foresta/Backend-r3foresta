import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Comprobar que el backend está activo',
    description:
      'Endpoint público de liveness. No requiere sesión ni consulta servicios externos.',
  })
  @ApiOkResponse({
    description: 'El proceso del backend está activo.',
    schema: {
      example: {
        status: 'ok',
        service: 'r3foresta-backend',
        timestamp: '2026-08-11T12:00:00.000Z',
        uptimeSeconds: 42,
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      service: 'r3foresta-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
