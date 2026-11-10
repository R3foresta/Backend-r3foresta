import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PrivateResponseInterceptor } from '../../auth/private-response.interceptor';
import {
  VerifiedActorGuard,
  type ActorRequest,
} from '../../auth/verified-actor.guard';
import type { EvidenceFileInput } from '../../common/files/evidence-file.policy';
import type { RpcReply } from '../../participacion/comando-recibo';
import {
  commandId,
  id,
  invalidInput,
  strictObject,
} from '../../participacion/dto/comandos.dto';
import { ParticipacionExceptionFilter } from '../../participacion/participacion-exception.filter';
import { ViveroConciliacionService } from '../application/vivero-conciliacion.service';
import {
  CONCILIACION_CARGA_SCHEMA,
  CONCILIACION_FICHA_SCHEMA,
  CONCILIACION_PADRON_SCHEMA,
  CONCILIACION_RECIBO_SCHEMA,
} from './docs/conciliacion-vivero.swagger';
import {
  CONCILIAR_COMANDO_SCHEMA,
  PADRON_COMANDO_SCHEMA,
  idSchema,
  parseConciliacion,
  parsePadron,
  uuidSchema,
} from './dto/conciliacion-vivero.dto';

@ApiTags('conciliacion-vivero-v1')
@ApiBearerAuth()
@Controller('v1/vivero/conciliaciones')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ViveroConciliacionController {
  constructor(private readonly service: ViveroConciliacionService) {}

  @Get()
  @ApiOperation({
    summary:
      'ADMIN: lista candidatos históricos y estado del padrón excepcional.',
  })
  @ApiQuery({ name: 'vivero_id', schema: idSchema, required: false })
  @ApiQuery({ name: 'antes_de_id', schema: idSchema, required: false })
  @ApiQuery({
    name: 'limite',
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    required: false,
  })
  @ApiResponse({ status: 200, schema: CONCILIACION_PADRON_SCHEMA })
  padron(@Req() req: ActorRequest, @Query() query: unknown) {
    const q = strictObject(
      query,
      ['vivero_id', 'antes_de_id', 'limite'],
      'query',
    );
    const limite = q.limite === undefined ? 20 : Number(id(q.limite, 'limite'));
    if (limite > 50) invalidInput('limite');
    return this.service.leer(
      req.actor,
      null,
      q.antes_de_id === undefined ? null : id(q.antes_de_id, 'antes_de_id'),
      limite,
      q.vivero_id === undefined ? null : id(q.vivero_id, 'vivero_id'),
    );
  }

  @Get('comandos/:comando_id')
  @ApiOperation({
    summary:
      'Recuperar el recibo propio, incluso tras el retiro del acceso M2.',
  })
  @ApiParam({ name: 'comando_id', schema: uuidSchema })
  @ApiResponse({ status: 200, schema: CONCILIACION_RECIBO_SCHEMA })
  @ApiResponse({
    status: 202,
    schema: CONCILIACION_RECIBO_SCHEMA,
    description: 'SIN_RESULTADO. Conservar la misma clave.',
  })
  async recuperar(
    @Req() req: ActorRequest,
    @Param('comando_id') comando: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    strictObject(query, [], 'query');
    return this.reply(
      res,
      await this.service.comando(req.actor, commandId(comando)),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Ficha de conciliación por origen para ADMIN o M2 de la custodia.',
  })
  @ApiParam({ name: 'id', schema: idSchema })
  @ApiResponse({ status: 200, schema: CONCILIACION_FICHA_SCHEMA })
  detalle(@Req() req: ActorRequest, @Param('id') origen: string) {
    return this.service.leer(req.actor, id(origen), null, 20);
  }

  @Post(':id/padron')
  @ApiOperation({
    summary:
      'ADMIN: incluir o retirar un origen individual con motivo y revisión.',
  })
  @ApiParam({ name: 'id', schema: idSchema })
  @ApiBody({ schema: PADRON_COMANDO_SCHEMA })
  @ApiResponse({ status: 200, schema: CONCILIACION_RECIBO_SCHEMA })
  @ApiResponse({ status: 409, schema: CONCILIACION_RECIBO_SCHEMA })
  async administrar(
    @Req() req: ActorRequest,
    @Param('id') origen: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const p = parsePadron(origen, body);
    return this.reply(
      res,
      await this.service.comando(req.actor, p.comando_id, p.payload),
    );
  }

  @Post(':id/confirmaciones')
  @ApiOperation({
    summary:
      'Registrar la comprobación física del remanente. Una diferencia genera incidencia.',
  })
  @ApiParam({ name: 'id', schema: idSchema })
  @ApiBody({ schema: CONCILIAR_COMANDO_SCHEMA })
  @ApiResponse({ status: 200, schema: CONCILIACION_RECIBO_SCHEMA })
  @ApiResponse({ status: 409, schema: CONCILIACION_RECIBO_SCHEMA })
  @ApiResponse({
    status: 503,
    description: 'Resultado incierto. Recuperar el mismo UUID.',
  })
  async confirmar(
    @Req() req: ActorRequest,
    @Param('id') origen: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const p = parseConciliacion(origen, body);
    return this.reply(
      res,
      await this.service.comando(req.actor, p.comando_id, p.payload),
    );
  }

  @Post(':id/evidencias')
  @ApiOperation({
    summary:
      'Preparar fotos privadas vinculables al origen, actor y custodia de la comprobación.',
  })
  @ApiParam({ name: 'id', schema: idSchema })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fotos'],
      properties: {
        fotos: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, schema: CONCILIACION_CARGA_SCHEMA })
  @UseInterceptors(
    FilesInterceptor('fotos', 5, {
      limits: { fileSize: 15 * 1024 * 1024, files: 5, fields: 0 },
    }),
  )
  evidencias(
    @Req() req: ActorRequest,
    @Param('id') origen: string,
    @Body() body: unknown,
    @UploadedFiles() files: EvidenceFileInput[],
  ) {
    strictObject(body ?? {}, []);
    return this.service.evidencias(req.actor, id(origen), files ?? []);
  }

  private reply(res: Response, value: RpcReply) {
    if (value.http_status === 202) res.setHeader('Retry-After', '2');
    return res.status(value.http_status).json(value.body);
  }
}
