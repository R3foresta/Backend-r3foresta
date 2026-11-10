import {
  ApiM2Command,
  ApiM2Read,
  ApiM2Recovery,
} from './docs/vivero-accesos.swagger';
import {
  Body,
  UnprocessableEntityException,
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
  invalidInput,
  strictObject,
} from '../../participacion/dto/comandos.dto';
import { ViveroAccesosService } from '../application/vivero-accesos.service';
import {
  M2_COMANDO_SCHEMA,
  parseM2Comando,
  parseM2Query,
  type M2Operacion,
} from './dto/acceso-viveros.dto';
import type { RpcReply } from '../../participacion/comando-recibo';
import { ORIGENES_SCHEMA } from './docs/conciliacion-vivero.swagger';

@ApiTags('acceso-viveros-v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class ViveroAccesosController {
  constructor(private readonly service: ViveroAccesosService) {}

  @Get('vivero/origenes')
  @ApiOperation({
    summary:
      'Material M1 mínimo almacenado en un vivero autorizado, sin conceder edición del origen.',
  })
  @ApiQuery({ name: 'vivero_id', type: String, required: true })
  @ApiQuery({ name: 'recoleccion_id', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'incluir_pendientes',
    type: Boolean,
    required: false,
    description:
      'Incluye saldo pendiente de recepción o conciliación y su motivo.',
  })
  @ApiQuery({
    name: 'incluir_requisitos_inicio',
    type: Boolean,
    required: false,
    description:
      'Añade el saldo decimal exacto y el motivo de bloqueo de INICIO. Requiere incluir_pendientes=true.',
  })
  @ApiResponse({ status: 200, schema: ORIGENES_SCHEMA })
  origenes(@Req() req: ActorRequest, @Query() value: unknown) {
    const q = strictObject(
      value,
      [
        'vivero_id',
        'recoleccion_id',
        'page',
        'limit',
        'incluir_pendientes',
        'incluir_requisitos_inicio',
      ],
      'query',
    );
    const page = q.page === undefined ? 1 : Number(id(q.page, 'page'));
    const limit = q.limit === undefined ? 20 : Number(id(q.limit, 'limit'));
    if (page > 1000000 || limit > 50)
      throw new UnprocessableEntityException('Paginación inválida.');
    if (
      q.incluir_pendientes !== undefined &&
      q.incluir_pendientes !== 'true' &&
      q.incluir_pendientes !== 'false'
    )
      invalidInput('incluir_pendientes');
    const requisitosInicio = q.incluir_requisitos_inicio;
    if (
      requisitosInicio !== undefined &&
      requisitosInicio !== 'false' &&
      (requisitosInicio !== 'true' || q.incluir_pendientes !== 'true')
    )
      invalidInput('incluir_requisitos_inicio');
    return this.service.origenes(
      req.actor,
      id(q.vivero_id, 'vivero_id'),
      q.recoleccion_id === undefined
        ? null
        : id(q.recoleccion_id, 'recoleccion_id'),
      page,
      limit,
      q.incluir_pendientes === 'true',
      requisitosInicio === 'true',
    );
  }
  @Get('me/acceso-viveros')
  @ApiM2Read()
  @ApiOperation({
    summary:
      'Acceso M2 efectivo propio, revisión independiente e historial paginado.',
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
    const q = parseM2Query(query);
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
  @Get('usuarios/:usuario_id/acceso-viveros')
  @ApiM2Read()
  @ApiOperation({
    summary: 'ADMIN: consultar acceso M2 e historial de una cuenta.',
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
    const q = parseM2Query(query);
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
  @Post('usuarios/:usuario_id/acceso-viveros/otorgamientos')
  @ApiM2Command()
  @ApiOperation({
    summary:
      'ADMIN: otorgar M2 a cuenta activa GENERAL/VALIDADOR sin cambiar su rol.',
  })
  @ApiBody({ schema: M2_COMANDO_SCHEMA })
  otorgar(
    @Req() req: ActorRequest,
    @Param('usuario_id') usuario: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.execute(req, usuario, body, res, 'OTORGAR_ACCESO_VIVERO');
  }
  @Post('usuarios/:usuario_id/acceso-viveros/retiros')
  @ApiM2Command()
  @ApiOperation({
    summary:
      'ADMIN: retirar vigencia explícita M2 conservando historia; ADMIN mantiene acceso derivado.',
  })
  @ApiBody({ schema: M2_COMANDO_SCHEMA })
  retirar(
    @Req() req: ActorRequest,
    @Param('usuario_id') usuario: string,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    return this.execute(req, usuario, body, res, 'RETIRAR_ACCESO_VIVERO');
  }
  @Get('vivero/accesos/comandos/:comando_id')
  @ApiM2Recovery()
  @ApiOperation({
    summary:
      'Recuperar recibo propio M2 incluso tras perder ADMIN; no requiere M2. SIN_RESULTADO no prueba fallo.',
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
    operacion: M2Operacion,
  ) {
    const p = parseM2Comando(usuario, body);
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
