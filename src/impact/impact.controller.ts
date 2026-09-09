import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ImpactEvidenceQueryDto,
  ImpactMonitoringTimelineQueryDto,
} from './impact-query.dto';
import { ImpactService } from './impact.service';

@ApiTags('impact-publico')
@Controller('v1/impact')
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  @Get('organizations')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Listar organizaciones disponibles en el portal de impacto',
    description: 'Endpoint público y de solo lectura. No requiere x-auth-id.',
  })
  @ApiResponse({ status: 200, description: 'Organizaciones activas.' })
  listOrganizations() {
    return this.impactService.listOrganizations();
  }

  @Get('organizations/:organizationId/dashboard')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Consultar el dashboard público de una organización',
    description:
      'Agrega campañas, subcampañas, métricas, evidencias y geometrías GPS sin exponer datos operativos internos.',
  })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, description: 'Dashboard de impacto.' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada.' })
  getOrganizationDashboard(
    @Param('organizationId', ParseIntPipe) organizationId: number,
  ) {
    return this.impactService.getOrganizationDashboard(organizationId);
  }

  @Get('organizations/:organizationId/monitoring-timeline')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Consultar la serie histórica pública de plantación y mortandad',
    description:
      'Construye cortes acumulados a partir de registros de plantación, reposiciones y eventos de mortandad reales.',
  })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiQuery({ name: 'campaignId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Serie histórica de impacto.' })
  @ApiResponse({
    status: 404,
    description: 'Organización o asociación con la campaña no encontrada.',
  })
  getMonitoringTimeline(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query() query: ImpactMonitoringTimelineQueryDto,
  ) {
    return this.impactService.getMonitoringTimeline(organizationId, query);
  }

  @Get('organizations/:organizationId/evidence')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Consultar la galería pública paginada de una organización',
    description:
      'Permite filtrar evidencias de plantación por campaña, especie y rango de fechas.',
  })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiResponse({ status: 200, description: 'Galería pública paginada.' })
  @ApiResponse({
    status: 404,
    description: 'Organización o asociación con la campaña no encontrada.',
  })
  getEvidenceGallery(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Query() query: ImpactEvidenceQueryDto,
  ) {
    return this.impactService.getEvidenceGallery(organizationId, query);
  }

  @Get('organizations/:organizationId/campaigns/:campaignId')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Consultar una campaña del impacto de una organización',
    description:
      'Incluye subcampañas, registros de plantación, especies, evidencias y datos para mapas.',
  })
  @ApiParam({ name: 'organizationId', type: Number })
  @ApiParam({ name: 'campaignId', type: Number })
  @ApiResponse({ status: 200, description: 'Detalle público de campaña.' })
  @ApiResponse({
    status: 404,
    description: 'Organización o asociación con la campaña no encontrada.',
  })
  getCampaignDetail(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    return this.impactService.getCampaignDetail(organizationId, campaignId);
  }
}
