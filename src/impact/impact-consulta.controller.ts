import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  VerifiedActorGuard,
  type ActorRequest,
} from '../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import { id } from '../participacion/dto/comandos.dto';
import { ParticipacionExceptionFilter } from '../participacion/participacion-exception.filter';
import { ImpactoConsultaService } from './application/impacto-consulta.service';
import { ImpactoImagenPropiaService } from './application/impacto-imagen-propia.service';
import { parseImpactoQuery } from './impacto-consulta.dto';

@ApiTags('impact-publico')
@Controller('v1/impact')
@UseFilters(ParticipacionExceptionFilter)
export class ImpactoConsultaController {
  constructor(private readonly service: ImpactoConsultaService) {}

  @Get('global')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Impacto global público sin sesión, con mapa y registros grupales',
  })
  global(@Query() query: unknown) {
    return this.service.publico(parseImpactoQuery(query, 'global'));
  }

  @Get('campanias/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Campaña pública, únicamente ámbitos elegibles' })
  campania(@Param('id') scope: string, @Query() query: unknown) {
    return this.service.publico({
      ...parseImpactoQuery(query, 'campania'),
      campania_id: id(scope),
    });
  }

  @Get('subcampanias/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Subcampaña pública: inicial, meta, faltantes y seguimiento separados',
  })
  subcampania(@Param('id') scope: string, @Query() query: unknown) {
    return this.service.publico({
      ...parseImpactoQuery(query, 'subcampania'),
      subcampania_id: id(scope),
    });
  }

  @Get('registros/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Registro grupal público con snapshots y fotografías elegibles',
  })
  registro(@Param('id') registro: string, @Query() query: unknown) {
    return this.service.publico(
      parseImpactoQuery(query, 'registro'),
      id(registro),
    );
  }
}

@ApiTags('Participación: Mis registros')
@ApiBearerAuth()
@Controller('v1/plantaciones')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class MisRegistrosController {
  constructor(
    private readonly service: ImpactoConsultaService,
    private readonly imagenes: ImpactoImagenPropiaService,
  ) {}

  @Get('mis-registros')
  @ApiOperation({
    summary:
      'Unión deduplicada de autoría y participación histórica de la cuenta activa',
  })
  propios(@Req() req: ActorRequest, @Query() query: unknown) {
    return this.service.propios(req.actor, parseImpactoQuery(query, 'propio'));
  }

  @Get(':registroId/imagenes/:evidenciaId')
  @ApiOperation({
    summary: 'JPEG sanitizado de una foto del registro propio histórico',
  })
  @ApiResponse({
    status: 200,
    description: 'image/jpeg; requiere relación histórica y Bearer.',
  })
  async imagenPropia(
    @Req() req: ActorRequest,
    @Param('registroId') registroId: string,
    @Param('evidenciaId') evidenciaId: string,
    @Res() res: Response,
  ) {
    const bytes = await this.imagenes.imagen(
      req.actor,
      id(registroId),
      id(evidenciaId),
    );
    return res.type('image/jpeg').send(bytes);
  }
}
