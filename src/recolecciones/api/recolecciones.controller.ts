import { InternalActorGuard } from '../../auth/internal-actor.guard';
import type { ActorRequest } from '../../auth/verified-actor.guard';
import { BigintIdPipe } from '../../common/dto/bigint-id';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RecoleccionesService } from '../application/recolecciones.service';
import {
  ApiCreateRecoleccion,
  ApiDeleteDraftRecoleccion,
  ApiFindAllRecolecciones,
  ApiFindByViveroRecolecciones,
  ApiFindOneRecoleccion,
  ApiFindPendingValidationRecolecciones,
  ApiRegistrarDesecho,
  ApiFindStockSummaryRecolecciones,
  ApiFindHistorialSemillas,
  ApiSubmitRecoleccionValidation,
  ApiUpdateDraftRecoleccion,
} from './docs/recolecciones.swagger';
import { HistorialSemillasQueryDto } from './dto/historial-semillas-query.dto';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';
import { RecoleccionElegibilidadViveroQueryDto } from './dto/recoleccion-elegibilidad-vivero-query.dto';
import { RegistrarDesechoDto } from './dto/registrar-desecho.dto';
import { RecoleccionFormDataParser } from './parsers/recoleccion-formdata.parser';

@ApiTags('recolecciones')
@ApiBearerAuth()
@UseGuards(InternalActorGuard)
@Controller('recolecciones')
export class RecoleccionesController {
  constructor(
    private readonly service: RecoleccionesService,
    private readonly parser: RecoleccionFormDataParser,
  ) {}
  @Post()
  @ApiCreateRecoleccion()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 10 }]))
  async create(
    @Body() body: unknown,
    @Req() req: ActorRequest,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.service.create(
      await this.parser.parseCreateBody(body),
      req.actor.auth_id,
      undefined,
      files?.fotos,
    );
  }
  @Patch(':id/draft')
  @ApiUpdateDraftRecoleccion()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 10 }]))
  async updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: ActorRequest,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    return this.service.updateDraft(
      id,
      await this.parser.parseUpdateDraftBody(body),
      req.actor.auth_id,
      req.actor.rol,
      files?.fotos,
    );
  }
  @Delete(':id')
  @ApiDeleteDraftRecoleccion()
  eliminarBorrador(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ActorRequest,
  ) {
    return this.service.eliminarBorrador(id, req.actor.usuario_id);
  }
  @Patch(':id/submit')
  @ApiSubmitRecoleccionValidation()
  submitForValidation(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ActorRequest,
  ) {
    return this.service.submitForValidation(
      id,
      req.actor.auth_id,
      req.actor.rol,
    );
  }
  @Post(':id/desecho')
  @ApiRegistrarDesecho()
  registrarDesecho(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RegistrarDesechoDto,
    @Req() req: ActorRequest,
  ) {
    return this.service.registrarDesecho(id, body, req.actor.auth_id);
  }
  @Get('pending-validation')
  @ApiFindPendingValidationRecolecciones()
  findPendingValidation(
    @Query() filters: FiltersRecoleccionDto,
    @Req() req: ActorRequest,
  ) {
    return this.service.findPendingValidation(
      filters,
      req.actor.auth_id,
      req.actor.rol,
    );
  }
  @Get('stock-summary')
  @ApiFindStockSummaryRecolecciones()
  findStockSummary(@Req() req: ActorRequest) {
    return this.service.findStockSummary(req.actor.auth_id);
  }
  @Get('stock-summary/:plantaId/historial')
  @ApiFindHistorialSemillas()
  findHistorialSemillas(
    @Param('plantaId', ParseIntPipe) plantaId: number,
    @Query() query: HistorialSemillasQueryDto,
    @Req() req: ActorRequest,
  ) {
    if (!Number.isSafeInteger(plantaId) || plantaId <= 0)
      throw new BadRequestException(
        'plantaId debe ser un entero positivo válido',
      );
    return this.service.findHistorialSemillas(plantaId, query, req.actor);
  }
  @Get()
  @ApiFindAllRecolecciones()
  findAll(@Query() filters: FiltersRecoleccionDto, @Req() req: ActorRequest) {
    return this.service.findAll(req.actor.auth_id, filters);
  }
  @Get('vivero/:viveroId')
  @ApiFindByViveroRecolecciones()
  findByVivero(
    @Param('viveroId', BigintIdPipe) viveroId: string,
    @Query() filters: FiltersRecoleccionDto,
    @Req() req: ActorRequest,
  ) {
    return this.service.findByVivero(viveroId, filters, req.actor);
  }
  @Get(':id')
  @ApiFindOneRecoleccion()
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RecoleccionElegibilidadViveroQueryDto,
    @Req() req: ActorRequest,
  ) {
    return this.service.findOne(
      id,
      req.actor,
      query.cantidad_solicitada_vivero,
    );
  }
}
