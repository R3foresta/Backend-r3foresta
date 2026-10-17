import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ImpactService } from './impact.service';

@ApiTags('impact-publico')
@Controller('v1/impact')
export class ImpactImagenController {
  constructor(private readonly impactService: ImpactService) {}

  @Get('imagenes/:evidenciaId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'JPEG público sanitizado de una evidencia vinculada elegible, sin cuenta.',
  })
  @ApiResponse({
    status: 200,
    description: 'image/jpeg sin EXIF; no revela URL del original.',
  })
  async imagenPublica(
    @Param('evidenciaId') evidenciaId: string,
    @Res() res: Response,
  ) {
    const bytes = await this.impactService.imagenPublica(evidenciaId);
    return res.type('image/jpeg').send(bytes);
  }

}
