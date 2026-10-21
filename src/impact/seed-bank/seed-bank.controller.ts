import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { SeedBankService } from '../application/seed-bank.service';
import { parseSeedQuery, seedId, SeedBankQueryDto } from './seed-bank.dto';
import {
  seedDetailSchema,
  seedOverviewSchema,
  seedPageSchema,
} from './seed-bank.schemas';

@ApiTags('impact-publico: banco de semillas')
@Controller('v1/impact/seed-bank')
@ApiResponse({ status: 400, description: 'Entrada fuera del contrato.' })
@ApiResponse({
  status: 503,
  description: 'Datos no disponibles; no equivale a banco vacío.',
})
export class SeedBankController {
  constructor(private readonly service: SeedBankService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Resumen global anónimo de todas las recolecciones SEMILLA y catálogos completos.',
  })
  @ApiOkResponse({ schema: seedOverviewSchema })
  overview(@Query() query: Record<string, unknown>) {
    parseSeedQuery(query, false);
    return this.service.overview();
  }

  @Get('collections')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Recolecciones SEMILLA públicas, globales y paginadas, sin exigir sesión.',
  })
  @ApiQuery({ type: SeedBankQueryDto })
  @ApiOkResponse({ schema: seedPageSchema })
  collections(@Query() query: Record<string, unknown>) {
    return this.service.collections(parseSeedQuery(query));
  }

  @Get('collections/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Ficha pública de semillas, con fotos sanitizadas cuando estén validadas.',
  })
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ schema: seedDetailSchema })
  @ApiResponse({
    status: 404,
    description: 'No existe una recolección SEMILLA con ese ID.',
  })
  detail(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    parseSeedQuery(query, false);
    return this.service.detail(seedId(id));
  }

  @Get('collections/:id/photos/:photoId')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary:
      'JPEG público sanitizado; revalida recolección VALIDADO, pertenencia y evidencia no eliminada.',
  })
  @ApiParam({ name: 'id', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'photoId', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({
    content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({
    status: 404,
    description: 'Foto no publicable o ajena a la recolección.',
  })
  async photo(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    parseSeedQuery(query, false);
    return response
      .type('image/jpeg')
      .send(await this.service.photo(seedId(id), seedId(photoId, 'photoId')));
  }
}
