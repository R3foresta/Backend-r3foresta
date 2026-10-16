import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  VerifiedActorGuard,
  type ActorRequest,
} from '../../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../../auth/private-response.interceptor';
import { commandId, id, invalidInput, strictObject } from '../dto/comandos.dto';
import { ParticipacionExceptionFilter } from '../participacion-exception.filter';
import type { RpcReply } from '../comando-recibo';
import { ParticipacionCargasService } from './participacion-cargas.service';
import { MAX_FOTO_BYTES } from './participacion-imagen.service';

function operation(value: unknown): void {
  const input = strictObject(value, ['operacion']);
  if (input.operacion !== 'REGISTRAR_PLANTACION_INICIAL')
    invalidInput('operacion');
}
function respond(res: Response, reply: RpcReply) {
  if (reply.http_status === 202) res.setHeader('Retry-After', '2');
  return res.status(reply.http_status).json(reply.body);
}

@ApiTags('participacion-v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ParticipacionCargasController {
  constructor(private readonly service: ParticipacionCargasService) {}

  @Post('participacion/comandos/preparaciones')
  @ApiOperation({
    summary: 'Preparar carga recuperable propia, sin reservar stock.',
  })
  async preparar(
    @Req() req: ActorRequest,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const input = strictObject(body, [
      'comando_id',
      'operacion',
      'subcampania_id',
    ]);
    if (input.operacion !== 'REGISTRAR_PLANTACION_INICIAL')
      invalidInput('operacion');
    return respond(
      res,
      await this.service.preparar(
        req.actor,
        commandId(input.comando_id),
        id(input.subcampania_id, 'subcampania_id'),
      ),
    );
  }

  @Put('participacion/comandos/:comando_id/cargas/:carga_id')
  @ApiOperation({
    summary: 'Subir o reconciliar una foto propia por UUID estable.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['foto'],
      additionalProperties: false,
      properties: { foto: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: { fileSize: MAX_FOTO_BYTES, files: 1, fields: 0 },
    }),
  )
  async subir(
    @Req() req: ActorRequest,
    @Param('comando_id') command: string,
    @Param('carga_id') carga: string,
    @Query() query: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res() res: Response,
  ) {
    operation(query);
    if (!file?.buffer) invalidInput('foto');
    return respond(
      res,
      await this.service.subir(
        req.actor,
        commandId(command),
        commandId(carga),
        file.buffer,
      ),
    );
  }

  @Get('participacion/comandos/:comando_id/cargas')
  async listar(
    @Req() req: ActorRequest,
    @Param('comando_id') command: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    operation(query);
    return respond(
      res,
      await this.service.listar(req.actor, commandId(command)),
    );
  }

  @Post('participacion/comandos/:comando_id/descarte-preparacion')
  async descartar(
    @Req() req: ActorRequest,
    @Param('comando_id') command: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    operation(body);
    return respond(
      res,
      await this.service.descartar(req.actor, commandId(command)),
    );
  }

  @Get('participacion/cargas/:carga_id/preview')
  async preview(
    @Req() req: ActorRequest,
    @Param('carga_id') carga: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    strictObject(query, []);
    return respond(
      res,
      await this.service.preview(req.actor, commandId(carga)),
    );
  }
}

@ApiTags('impact-v1')
@Controller('v1/impact')
@UseFilters(ParticipacionExceptionFilter)
export class ParticipacionFotosPublicasController {
  constructor(private readonly service: ParticipacionCargasService) {}

  @Get('fotos/:evidencia_id')
  @ApiOperation({
    summary: 'Imagen sanitizada de un hecho público elegible; sin cuenta.',
  })
  async foto(
    @Param('evidencia_id') evidencia: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    strictObject(query, []);
    res.setHeader('Cache-Control', 'no-store');
    return respond(
      res,
      await this.service.fotoPublica(id(evidencia, 'evidencia_id')),
    );
  }
}
