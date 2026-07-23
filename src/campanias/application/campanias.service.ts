import { Injectable } from '@nestjs/common';
import { SubcampaniasService } from '../../subcampanias/application/subcampanias.service';
import { AsociarOrganizacionesDto } from '../api/dto/asociar-organizaciones.dto';
import { CrearCampaniaDto } from '../api/dto/crear-campania.dto';
import { DesactivarCampaniaDto } from '../api/dto/desactivar-campania.dto';
import { EditarCampaniaDto } from '../api/dto/editar-campania.dto';
import { CampaniasActivityService } from './campanias-activity.service';
import { CampaniasConsultasService } from './campanias-consultas.service';
import { CampaniasCreationService } from './campanias-creation.service';
import { CampaniasDesactivacionService } from './campanias-desactivacion.service';
import { CampaniasEdicionService } from './campanias-edicion.service';
import { CampaniasMetricsService } from './campanias-metrics.service';
import { CampaniasOrganizacionesService } from './campanias-organizaciones.service';

@Injectable()
export class CampaniasService {
  constructor(
    private readonly creationService: CampaniasCreationService,
    private readonly consultasService: CampaniasConsultasService,
    private readonly edicionService: CampaniasEdicionService,
    private readonly desactivacionService: CampaniasDesactivacionService,
    private readonly organizacionesService: CampaniasOrganizacionesService,
    private readonly subcampaniasService: SubcampaniasService,
    private readonly metricsService: CampaniasMetricsService,
    private readonly activityService: CampaniasActivityService,
  ) {}

  crear(dto: CrearCampaniaDto, authId: string) {
    return this.creationService.crear(dto, authId);
  }

  listar() {
    return this.consultasService.listar();
  }

  async obtenerResumenGlobal() {
    const data = await this.metricsService.obtenerResumenGlobal();
    return { success: true, data };
  }

  obtenerPorId(id: number) {
    return this.consultasService.obtenerPorId(id);
  }

  async listarSubcampanias(id: number) {
    await this.consultasService.asegurarExiste(id);
    return this.subcampaniasService.listar({ campania_id: id });
  }

  async obtenerMetrics(id: number) {
    const data = await this.metricsService.obtener(id);
    return { success: true, data };
  }

  async obtenerActivity(id: number, limit: number) {
    const data = await this.activityService.listar(id, limit);
    return { success: true, data };
  }

  editar(id: number, dto: EditarCampaniaDto, authId: string) {
    return this.edicionService.editar(id, dto, authId);
  }

  borrar(id: number, authId: string) {
    return this.edicionService.borrar(id, authId);
  }

  previewDesactivacion(id: number, authId: string) {
    return this.desactivacionService.preview(id, authId);
  }

  desactivarMasivamente(
    id: number,
    dto: DesactivarCampaniaDto,
    authId: string,
  ) {
    return this.desactivacionService.desactivar(id, dto, authId);
  }

  asociarOrganizaciones(
    id: number,
    dto: AsociarOrganizacionesDto,
    authId: string,
  ) {
    return this.organizacionesService.asociar(id, dto, authId);
  }

  desasociarOrganizacion(campaniaId: number, orgId: number, authId: string) {
    return this.organizacionesService.desasociar(campaniaId, orgId, authId);
  }
}
