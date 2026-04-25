import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { RecoleccionesService } from '../application/recolecciones.service';
import {
  ApiApproveRecoleccionValidation,
  ApiCreateRecoleccion,
  ApiFindAllRecolecciones,
  ApiFindByViveroRecolecciones,
  ApiFindOneRecoleccion,
  ApiFindPendingValidationRecolecciones,
  ApiRejectRecoleccionValidation,
  ApiSubmitRecoleccionValidation,
  ApiUpdateDraftRecoleccion,
} from './docs/recolecciones.swagger';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';
import { RecoleccionElegibilidadViveroQueryDto } from './dto/recoleccion-elegibilidad-vivero-query.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { RecoleccionFormDataParser } from './parsers/recoleccion-formdata.parser';

@ApiTags('recolecciones')
@Controller('recolecciones')
export class RecoleccionesController {
  constructor(
    private readonly recoleccionesService: RecoleccionesService,
    private readonly formDataParser: RecoleccionFormDataParser,
  ) {}

  @Post()
  @ApiCreateRecoleccion()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async create(
    @Body() bodyRaw: any,
    @Headers('x-auth-id') authId?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    const dto = await this.formDataParser.parseCreateBody(bodyRaw);

    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    return this.recoleccionesService.create(
      dto,
      authId,
      undefined,
      files?.fotos,
    );
  }

  @Patch(':id/draft')
  @ApiUpdateDraftRecoleccion()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'fotos', maxCount: 5 }]))
  async updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() bodyRaw: any,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
    @UploadedFiles() files?: { fotos?: any[] },
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    const dto = await this.formDataParser.parseUpdateDraftBody(bodyRaw);

    return this.recoleccionesService.updateDraft(
      id,
      dto,
      authId,
      userRole || 'GENERAL',
      files?.fotos,
    );
  }

  @Patch(':id/submit')
  @ApiSubmitRecoleccionValidation()
  async submitForValidation(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    return this.recoleccionesService.submitForValidation(
      id,
      authId,
      userRole || 'GENERAL',
    );
  }

  @Patch(':id/approve')
  @ApiApproveRecoleccionValidation()
  async approveValidation(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    if (!userRole) {
      throw new BadRequestException('Header x-user-role es requerido para validar');
    }

    return this.recoleccionesService.approveValidation(id, authId, userRole);
  }

  @Patch(':id/reject')
  @ApiRejectRecoleccionValidation()
  async rejectValidation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectValidationDto,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    if (!userRole) {
      throw new BadRequestException('Header x-user-role es requerido para rechazar');
    }

    return this.recoleccionesService.rejectValidation(id, authId, userRole, dto);
  }

  @Get('pending-validation')
  @ApiFindPendingValidationRecolecciones()
  async findPendingValidation(
    @Query() filters: FiltersRecoleccionDto,
    @Headers('x-auth-id') authId?: string,
    @Headers('x-user-role') userRole?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    if (!userRole) {
      throw new BadRequestException('Header x-user-role es requerido');
    }

    return this.recoleccionesService.findPendingValidation(
      filters,
      authId,
      userRole,
    );
  }

  @Get()
  @ApiFindAllRecolecciones()
  async findAll(
    @Query() filters: FiltersRecoleccionDto,
    @Headers('x-auth-id') authId?: string,
  ) {
    if (!authId) {
      throw new UnauthorizedException('Header x-auth-id es requerido');
    }

    return this.recoleccionesService.findAll(authId, filters);
  }

  @Get('vivero/:viveroId')
  @ApiFindByViveroRecolecciones()
  async findByVivero(
    @Param('viveroId', ParseIntPipe) viveroId: number,
    @Query() filters: FiltersRecoleccionDto,
  ) {
    return this.recoleccionesService.findByVivero(viveroId, filters);
  }

  @Get(':id')
  @ApiFindOneRecoleccion()
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RecoleccionElegibilidadViveroQueryDto,
  ) {
    return this.recoleccionesService.findOne(
      id,
      query.cantidad_solicitada_vivero,
    );
  }
}
