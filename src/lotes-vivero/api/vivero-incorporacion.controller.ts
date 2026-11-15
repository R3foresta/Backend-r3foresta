import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VerifiedActorGuard } from '../../auth/verified-actor.guard';
import type { ActorRequest } from '../../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../../auth/private-response.interceptor';
import { ViveroIncorporacionService } from '../application/vivero-incorporacion.service';
import {
  ViveroEvidenciasService,
  ViveroEvidenceFileInput,
} from '../application/vivero-evidencias.service';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import {
  ConsultarEvidenciasIncorporacionDto,
  EvidenciasIncorporacionDto,
  IncorporarPlantasDto,
} from './dto/incorporar-plantas.dto';
import {
  EVIDENCIAS_INCORPORACION_SCHEMA,
  INCORPORACION_RESULTADO_SCHEMA,
} from './docs/incorporacion.swagger';

@ApiTags('lotes-vivero · incorporación')
@ApiBearerAuth()
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@ApiResponse({ status: 401, description: 'Bearer ausente o inválido.' })
@ApiResponse({
  status: 403,
  description: 'Cuenta inactiva, ADMIN global requerido para nuevas altas/fotos o solicitud ajena.',
})
@ApiResponse({
  status: 503,
  description: 'Resultado inconcluso. Conservar clave, intención y evidencias.',
})
@Controller('lotes-vivero/incorporaciones')
export class ViveroIncorporacionController {
  constructor(
    private readonly incorporacion: ViveroIncorporacionService,
    private readonly evidencias: ViveroEvidenciasService,
  ) {}

  @Get(':solicitud_id/evidencias-pendientes')
  @ApiOperation({
    summary: 'Recuperar las fotos pendientes propias de una carga inconclusa.',
    description:
      'Exige ADMIN global actual y cuenta activa; devuelve solamente el contexto propio de la misma solicitud y vivero_id. No confirma ingreso ni demuestra rollback.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Fotos pendientes con IDs exactos y enlaces firmados temporales.',
    schema: EVIDENCIAS_INCORPORACION_SCHEMA,
  })
  recuperarFotos(
    @Param('solicitud_id', new ParseUUIDPipe()) solicitudId: string,
    @Query() dto: ConsultarEvidenciasIncorporacionDto,
    @Req() req: ActorRequest,
  ) {
    return this.evidencias.recuperarPendientesIncorporacion(
      req.actor.usuario_id,
      dto.vivero_id,
      solicitudId,
    );
  }

  @Post(':solicitud_id/evidencias-pendientes')
  @ApiOperation({
    summary:
      'Cargar fotos privadas de recepción/conteo para una solicitud y vivero.',
    description:
      'Exclusivo de ADMIN global activo. La autoridad se comprueba antes de subir Storage y otra vez bajo lock de cuenta en la RPC. No constituye ingreso. No adjuntar documentos sensibles.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['vivero_id', 'fotos'],
      properties: {
        vivero_id: { type: 'string' },
        fotos: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
        },
        titulo: { type: 'string', maxLength: 120 },
        descripcion: { type: 'string', maxLength: 1000 },
        metadata: { type: 'string', description: 'Objeto JSON serializado.' },
        tomado_en: { type: 'string', format: 'date-time' },
        es_principal: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'evidencia_ids exactos y fotos con URL firmada temporal; no hay public_url.',
    schema: EVIDENCIAS_INCORPORACION_SCHEMA,
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }], {
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  cargarFotos(
    @Param('solicitud_id', new ParseUUIDPipe()) solicitudId: string,
    @Body() dto: EvidenciasIncorporacionDto,
    @Req() req: ActorRequest,
    @UploadedFiles() files?: { fotos?: ViveroEvidenceFileInput[] },
  ) {
    return this.evidencias.crearPendienteParaEvento(
      dto,
      req.actor.auth_id,
      files?.fotos ?? [],
      {
        eventoTipo: TipoEventoVivero.INCORPORACION,
        solicitudId,
      },
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Incorporar plantas vivas en un lote nuevo con procedencia.',
    description:
      'Nueva clave exclusiva de ADMIN global activo, sin permiso M1/M2 ni doble aprobación. Lote, evento, extensión y fotos se confirman juntos. Misma clave e intención de un hecho ya CONFIRMADO recupera el recibo propio incluso tras perder ADMIN o M2; sólo exige cuenta activa y no recalcula el saldo actual. La RPC serializa la autorización con cambios de rol/baja. No valida aptitud para entrega.',
  })
  @ApiBody({ type: IncorporarPlantasDto })
  @ApiResponse({ status: 201, schema: INCORPORACION_RESULTADO_SCHEMA })
  @ApiResponse({
    status: 400,
    description:
      'Intención, fechas, fotos o combinación de procedencia inválidas.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Clave usada con otra intención o autoría; no crear otra clave automáticamente.',
  })
  incorporar(@Body() dto: IncorporarPlantasDto, @Req() req: ActorRequest) {
    return this.incorporacion.incorporar(req.actor.usuario_id, dto);
  }

  @Get(':solicitud_id')
  @ApiOperation({
    summary: 'Recuperar el éxito propio de una incorporación.',
    description:
      'Cuenta activa y misma autoría, incluso tras perder ADMIN o vigencia M2. SIN_RESULTADO no acredita rollback ni habilita una nueva clave. No persiste PREPARADO ni rechazos de negocio.',
  })
  @ApiResponse({ status: 200, schema: INCORPORACION_RESULTADO_SCHEMA })
  recuperar(
    @Param('solicitud_id', new ParseUUIDPipe()) solicitudId: string,
    @Req() req: ActorRequest,
  ) {
    return this.incorporacion.recuperar(req.actor.usuario_id, solicitudId);
  }
}
