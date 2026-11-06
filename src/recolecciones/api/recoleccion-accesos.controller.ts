import {
  ApiM1Command,
  ApiM1Read,
  ApiM1Recovery,
} from './docs/recoleccion-accesos.swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { RecoleccionAccesosService } from '../application/recoleccion-accesos.service';
import {
  M1_COMANDO_SCHEMA,
  parseM1Comando,
  parseM1Query,
  type M1Operacion,
} from './dto/acceso-recoleccion.dto';
import type { RpcReply } from '../../participacion/comando-recibo';

@ApiTags('acceso-recoleccion-v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class RecoleccionAccesosController {
  constructor(private readonly service: RecoleccionAccesosService) {}

  @Get('me/acceso-recoleccion')
  @ApiM1Read()
  @ApiOperation({
    summary:
      'Acceso M1 efectivo propio, revisión independiente e historial paginado.',
  })
  @ApiQuery({ name: 'antes_de_id', required: false, type: String })
  @ApiQuery({
    name: 'limite',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  async propio(
    @Req() req: ActorRequest,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const q = parseM1Query(query);
    return this.reply(
      res,
      await this.service.leer(
        req.actor,
        req.actor.usuario_id,
        q.antes_de_id,
        q.limite,
      ),
    );
  }
  @Get('usuarios/:usuario_id/acceso-recoleccion')
  @ApiM1Read()
  @ApiOperation({
    summary: 'ADMIN: consultar acceso M1 e historial de una cuenta.',
  })
  @ApiParam({ name: 'usuario_id', type: String })
  @ApiQuery({ name: 'antes_de_id', required: false, type: String })
  @ApiQuery({
    name: 'limite',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  async administrativo(
    @Req() req: ActorRequest,
    @Param('usuario_id') usuario: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const q = parseM1Query(query);
    // Esta ruta administrativa también exige ADMIN para consultar la propia cuenta.
    if (req.actor.rol !== 'ADMIN') return this.reply(res, denied());
    return this.reply(
      res,
      await this.service.leer(
        req.actor,
        id(usuario, 'usuario_id'),
        q.antes_de_id,
        q.limite,
      ),
    );
  }
  @Post('usuarios/:usuario_id/acceso-recoleccion/otorgamientos')
  @ApiM1Command()
  @ApiOperation({
    summary:
      'ADMIN: otorgar M1 a cuenta activa GENERAL/VALIDADOR sin cambiar su rol.',
  })
  @ApiBody({ schema: M1_COMANDO_SCHEMA })
  otorgar(
    @Req() req: ActorRequest,
    @Param('usuario_id') usuario: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.execute(req, usuario, body, res, 'OTORGAR_ACCESO_RECOLECCION');
  }
  @Post('usuarios/:usuario_id/acceso-recoleccion/retiros')
  @ApiM1Command()
  @ApiOperation({
    summary:
      'ADMIN: retirar vigencia explícita M1 conservando historia; ADMIN mantiene acceso derivado.',
  })
  @ApiBody({ schema: M1_COMANDO_SCHEMA })
  retirar(
    @Req() req: ActorRequest,
    @Param('usuario_id') usuario: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.execute(req, usuario, body, res, 'RETIRAR_ACCESO_RECOLECCION');
  }
  @Get('recoleccion/accesos/comandos/:comando_id')
  @ApiM1Recovery()
  @ApiOperation({
    summary:
      'Recuperar recibo propio M1 incluso tras perder ADMIN; no requiere M1. SIN_RESULTADO no prueba fallo.',
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
      await this.service.recuperar(req.actor, commandId(comando)),
    );
  }
  private async execute(
    req: ActorRequest,
    usuario: string,
    body: unknown,
    res: Response,
    operacion: M1Operacion,
  ) {
    const p = parseM1Comando(usuario, body);
    return this.reply(
      res,
      await this.service.ejecutar(
        req.actor,
        operacion,
        p.comando_id,
        p.payload,
      ),
    );
  }
  private reply(res: Response, value: RpcReply) {
    if (value.http_status === 202) res.setHeader('Retry-After', '2');
    return res.status(value.http_status).json(value.body);
  }
}
function denied(): RpcReply {
  return {
    http_status: 403,
    body: {
      error: {
        codigo: 'CAPACIDAD_INSUFICIENTE',
        mensaje: 'Solo ADMIN consulta esta ruta.',
        campos: [],
        ambitos: [],
        reintento: 'NO_APLICA',
      },
      comando_id: null,
      resultado_concluyente: false,
    },
  };
}
