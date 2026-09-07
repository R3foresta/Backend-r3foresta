import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
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
