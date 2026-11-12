import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import {
  VerifiedActorGuard,
  type ActorRequest,
} from '../../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../../auth/private-response.interceptor';
import { ParticipacionExceptionFilter } from '../../participacion/participacion-exception.filter';
import {
  commandId,
  id,
  strictObject,
} from '../../participacion/dto/comandos.dto';
import type { EvidenceFileInput } from '../../common/files/evidence-file.policy';
import {
  RECEPCION_COLA_SCHEMA,
  RECEPCION_DETALLE_SCHEMA,
  RECEPCION_RECIBO_SCHEMA,
  RECEPCION_CARGA_SCHEMA,
} from './docs/recepcion-semillas.swagger';
import { parseM1Query } from './dto/acceso-recoleccion.dto';
import {
  parseRecepcionComando,
  parseRecepcionRechazo,
  RECEPCION_RECHAZO_SCHEMA,
  RECEPCION_COMANDO_SCHEMA,
} from './dto/recepcion-semillas.dto';
import { RecoleccionRecepcionService } from '../application/recoleccion-recepcion.service';

@ApiTags('recepcion-semillas-v1')
@ApiBearerAuth()
@Controller('v1/recepcion-semillas')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class RecoleccionRecepcionController {
  constructor(private readonly service: RecoleccionRecepcionService) {}
  @Get()
  @ApiOperation({
    summary:
      'Pendientes de recepción: ADMIN global o VALIDADOR con asignación vigente al vivero. Sin exigir M1.',
  })
  @ApiQuery({ name: 'antes_de_id', type: String, required: false })
  @ApiQuery({ name: 'limite', type: String, required: false })
  @ApiResponse({ status: 200, schema: RECEPCION_COLA_SCHEMA })
  cola(@Req() req: ActorRequest, @Query() query: unknown) {
    const q = parseM1Query(query);
    return this.service.leer(req.actor, null, q.antes_de_id, q.limite);
  }
  @Get('comandos/:comando_id')
  @ApiOperation({
    summary:
      'Recuperación propia tras perder M2/rol. SIN_RESULTADO no prueba rollback ni habilita nueva intención.',
  })
  @ApiParam({ name: 'comando_id', type: String, format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Recibo original CONFIRMADO o error de comando RECHAZADO.',
    schema: RECEPCION_RECIBO_SCHEMA,
  })
  @ApiResponse({
    status: 202,
    description: 'SIN_RESULTADO; conservar la misma clave.',
    schema: RECEPCION_RECIBO_SCHEMA,
  })
  async recuperar(
    @Req() req: ActorRequest,
    @Param('comando_id') comando: string,
    @Res() res: Response,
  ) {
    const r = await this.service.recuperar(req.actor, commandId(comando));
    if (r.http_status === 202) res.setHeader('Retry-After', '2');
    return res.status(r.http_status).json(r.body);
  }
  @Get(':id')
  @ApiOperation({
    summary:
      'Detalle, revisión exacta e historial para ADMIN o VALIDADOR con asignación vigente al vivero.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, schema: RECEPCION_DETALLE_SCHEMA })
  detalle(@Req() req: ActorRequest, @Param('id') origen: string) {
    if (!/^[1-9][0-9]*$/.test(origen)) throw new NotFoundException();
    return this.service.leer(req.actor, id(origen), null, 20);
  }
  @Post(':id/evidencias')
  @ApiOperation({
    summary:
      'Carga de 1–5 fotos multipart con contexto inmutable actor/origen/vivero/revisión; bucket legado público.',
  })
  @ApiParam({ name: 'id', type: String })
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
  @ApiResponse({ status: 201, schema: RECEPCION_CARGA_SCHEMA })
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
  @Post(':id/recibir-validar')
  @ApiOperation({
    summary:
      'Confirma recepción física y validación en una transacción. Cantidad y unidad deben ser conformes. Nunca autorrecepción.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: RECEPCION_COMANDO_SCHEMA })
  @ApiResponse({
    status: 200,
    description:
      'Recibo durable CONFIRMADO; ficha VALIDADO. Anclaje externo posterior fuera de la transacción, sólo en primera ejecución y sin reintento durable.',
    schema: RECEPCION_RECIBO_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description:
      'Revisión obsoleta, material no conforme, estado incompatible o clave reutilizada.',
    schema: RECEPCION_RECIBO_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description:
      'Resultado no determinado: recuperar misma clave; no reenviar automáticamente.',
  })
  async recibir(
    @Req() req: ActorRequest,
    @Param('id') origen: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const p = parseRecepcionComando(origen, body),
      r = await this.service.ejecutar(req.actor, p.comando_id, p.payload);
    return res.status(r.http_status).json(r.body);
  }
  @Post(':id/rechazar')
  @ApiOperation({
    summary:
      'Rechaza la versión revisada con motivo y conserva su snapshot. No requiere fotos; misma autoridad que recibir.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: RECEPCION_RECHAZO_SCHEMA })
  @ApiResponse({
    status: 200,
    description:
      'Comando CONFIRMADO; ficha RECHAZADO para corregir y reenviar el mismo código.',
    schema: RECEPCION_RECIBO_SCHEMA,
  })
  @ApiResponse({
    status: 409,
    description: 'Revisión obsoleta, estado incompatible o clave reutilizada.',
    schema: RECEPCION_RECIBO_SCHEMA,
  })
  @ApiResponse({
    status: 503,
    description:
      'Resultado no determinado: recuperar misma clave; no reenviar automáticamente.',
  })
  async rechazar(
    @Req() req: ActorRequest,
    @Param('id') origen: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const p = parseRecepcionRechazo(origen, body),
      r = await this.service.ejecutar(req.actor, p.comando_id, p.payload);
    return res.status(r.http_status).json(r.body);
  }
}
