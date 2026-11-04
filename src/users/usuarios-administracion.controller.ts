import {
  Controller,
  Get,
  Query,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  VerifiedActorGuard,
  type ActorRequest,
} from '../auth/verified-actor.guard';
import { PrivateResponseInterceptor } from '../auth/private-response.interceptor';
import { ParticipacionExceptionFilter } from '../participacion/participacion-exception.filter';
import { UsuariosAdministracionService } from './application/usuarios-administracion.service';
import { parseUsuariosAdministracionQuery } from './dto/usuarios-administracion.dto';

@ApiTags('Administración de usuarios v1')
@ApiBearerAuth()
@Controller('v1/usuarios')
@UseGuards(VerifiedActorGuard)
@UseInterceptors(PrivateResponseInterceptor)
@UseFilters(ParticipacionExceptionFilter)
export class UsuariosAdministracionController {
  constructor(private readonly service: UsuariosAdministracionService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seleccionar usuarios activos para asignar roles globales (solo ADMIN)',
  })
  listar(@Req() request: ActorRequest, @Query() query: unknown) {
    return this.service.listar(
      request.actor,
      parseUsuariosAdministracionQuery(query),
    );
  }
}
