import { Injectable } from '@nestjs/common';
import { AsociarOrganizacionesDto } from '../api/dto/asociar-organizaciones.dto';
import { CrearCampaniaDto } from '../api/dto/crear-campania.dto';
import { EditarCampaniaDto } from '../api/dto/editar-campania.dto';
import { CampaniasConsultasService } from './campanias-consultas.service';
import { CampaniasCreationService } from './campanias-creation.service';
import { CampaniasEdicionService } from './campanias-edicion.service';
import { CampaniasOrganizacionesService } from './campanias-organizaciones.service';

@Injectable()
export class CampaniasService {
  constructor(
    private readonly creationService: CampaniasCreationService,
    private readonly consultasService: CampaniasConsultasService,
    private readonly edicionService: CampaniasEdicionService,
    private readonly organizacionesService: CampaniasOrganizacionesService,
  ) {}

  crear(dto: CrearCampaniaDto, authId: string) {
    return this.creationService.crear(dto, authId);
  }

  listar() {
    return this.consultasService.listar();
  }

  obtenerPorId(id: number) {
    return this.consultasService.obtenerPorId(id);
  }

  editar(id: number, dto: EditarCampaniaDto, authId: string) {
    return this.edicionService.editar(id, dto, authId);
  }

  borrar(id: number, authId: string) {
    return this.edicionService.borrar(id, authId);
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
