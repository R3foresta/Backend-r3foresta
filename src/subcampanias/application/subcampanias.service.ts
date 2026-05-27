import { Injectable } from '@nestjs/common';
import { AgregarMiembroEquipoDto } from '../api/dto/agregar-miembro-equipo.dto';
import { CerrarSubcampaniaDto } from '../api/dto/cerrar-subcampania.dto';
import { CrearSubcampaniaDto } from '../api/dto/crear-subcampania.dto';
import { EditarSubcampaniaDto } from '../api/dto/editar-subcampania.dto';
import { SetearPoligonoDto } from '../api/dto/setear-poligono.dto';
import { SubcampaniasActivacionService } from './subcampanias-activacion.service';
import { SubcampaniasCierreService } from './subcampanias-cierre.service';
import {
  ListarSubcampaniasFiltros,
  SubcampaniasConsultasService,
} from './subcampanias-consultas.service';
import { SubcampaniasCreationService } from './subcampanias-creation.service';
import { SubcampaniasEdicionService } from './subcampanias-edicion.service';
import { SubcampaniasEquipoService } from './subcampanias-equipo.service';
import { SubcampaniasPoligonoService } from './subcampanias-poligono.service';

@Injectable()
export class SubcampaniasService {
  constructor(
    private readonly creationService: SubcampaniasCreationService,
    private readonly consultasService: SubcampaniasConsultasService,
    private readonly edicionService: SubcampaniasEdicionService,
    private readonly poligonoService: SubcampaniasPoligonoService,
    private readonly activacionService: SubcampaniasActivacionService,
    private readonly cierreService: SubcampaniasCierreService,
    private readonly equipoService: SubcampaniasEquipoService,
  ) {}

  crear(dto: CrearSubcampaniaDto, authId: string) {
    return this.creationService.crear(dto, authId);
  }

  listar(filtros: ListarSubcampaniasFiltros) {
    return this.consultasService.listar(filtros);
  }

  obtenerPorId(id: number) {
    return this.consultasService.obtenerPorId(id);
  }

  editar(id: number, dto: EditarSubcampaniaDto, authId: string) {
    return this.edicionService.editar(id, dto, authId);
  }

  borrar(id: number, authId: string) {
    return this.edicionService.borrar(id, authId);
  }

  setearPoligono(id: number, dto: SetearPoligonoDto, authId: string) {
    return this.poligonoService.setear(id, dto, authId);
  }

  activar(id: number, authId: string) {
    return this.activacionService.activar(id, authId);
  }

  cerrar(id: number, dto: CerrarSubcampaniaDto, authId: string) {
    return this.cierreService.cerrar(id, dto, authId);
  }

  listarEquipo(subcampaniaId: number) {
    return this.equipoService.listar(subcampaniaId);
  }

  agregarMiembroEquipo(
    subcampaniaId: number,
    dto: AgregarMiembroEquipoDto,
    authId: string,
  ) {
    return this.equipoService.agregar(subcampaniaId, dto, authId);
  }

  quitarMiembroEquipo(
    subcampaniaId: number,
    usuarioId: number,
    authId: string,
  ) {
    return this.equipoService.quitar(subcampaniaId, usuarioId, authId);
  }
}
