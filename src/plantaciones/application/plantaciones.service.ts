import { Injectable } from '@nestjs/common';
import { CrearEvidenciaPendientePlantacionDto } from '../api/dto/crear-evidencia-pendiente-plantacion.dto';
import { DescartarEvidenciasPendientesPlantacionDto } from '../api/dto/descartar-evidencias-pendientes-plantacion.dto';
import { RegistrarPlantacionDto } from '../api/dto/registrar-plantacion.dto';
import { PlantacionCreationService } from './plantacion-creation.service';
import {
  PlantacionEvidenceFileInput,
  PlantacionEvidenciasService,
} from './plantacion-evidencias.service';

@Injectable()
export class PlantacionesService {
  constructor(
    private readonly creationService: PlantacionCreationService,
    private readonly evidenciasService: PlantacionEvidenciasService,
  ) {}

  registrar(dto: RegistrarPlantacionDto, authId: string) {
    return this.creationService.registrar(dto, authId);
  }

  crearEvidenciasPendientes(
    dto: CrearEvidenciaPendientePlantacionDto,
    authId: string,
    files: PlantacionEvidenceFileInput[],
  ) {
    return this.evidenciasService.crearPendienteParaRegistro(
      dto,
      authId,
      files,
    );
  }

  descartarEvidenciasPendientes(
    dto: DescartarEvidenciasPendientesPlantacionDto,
    authId: string,
  ) {
    return this.evidenciasService.descartarPendientesParaRegistro(dto, authId);
  }
}
