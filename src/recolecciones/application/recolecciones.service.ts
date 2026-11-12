import { Injectable } from '@nestjs/common';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { HistorialSemillasQueryDto } from '../api/dto/historial-semillas-query.dto';
import { CreateRecoleccionDto } from '../api/dto/create-recoleccion.dto';
import { FiltersRecoleccionDto } from '../api/dto/filters-recoleccion.dto';
import { UpdateDraftDto } from '../api/dto/update-draft.dto';
import { RegistrarDesechoDto } from '../api/dto/registrar-desecho.dto';
import type { RecoleccionFotoInput } from '../domain/policies/evidencia-completitud.policy';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';
import { RecoleccionCreationService } from './recoleccion-creation.service';
import { RecoleccionDraftService } from './recoleccion-draft.service';
import { RecoleccionDesechoService } from './recoleccion-desecho.service';
import { RecoleccionEliminacionService } from './recoleccion-eliminacion.service';
import { RecoleccionValidacionService } from './recoleccion-validacion.service';

@Injectable()
export class RecoleccionesService {
  constructor(
    private readonly creationService: RecoleccionCreationService,
    private readonly draftService: RecoleccionDraftService,
    private readonly desechoService: RecoleccionDesechoService,
    private readonly validacionService: RecoleccionValidacionService,
    private readonly consultasService: RecoleccionConsultasService,
    private readonly eliminacionService: RecoleccionEliminacionService,
  ) {}

  create(
    createRecoleccionDto: CreateRecoleccionDto,
    authId: string,
    files: RecoleccionFotoInput[] = [],
  ) {
    return this.creationService.create(createRecoleccionDto, authId, files);
  }

  updateDraft(
    id: number,
    dto: UpdateDraftDto,
    authId: string,
    files: RecoleccionFotoInput[] = [],
  ) {
    return this.draftService.updateDraft(id, dto, authId, files);
  }

  registrarDesecho(id: number, dto: RegistrarDesechoDto, authId: string) {
    return this.desechoService.registrar(id, dto, authId);
  }

  eliminarBorrador(id: number, actorUsuarioId: string) {
    return this.eliminacionService.eliminarBorrador(id, actorUsuarioId);
  }

  submitForValidation(id: number, authId: string) {
    return this.validacionService.submitForValidation(id, authId);
  }

  findPendingValidation(filters: FiltersRecoleccionDto, authId: string) {
    return this.consultasService.findPendingValidation(filters, authId);
  }

  findAll(authId: string, filters: FiltersRecoleccionDto) {
    return this.consultasService.findAll(authId, filters);
  }

  findStockSummary(authId: string) {
    return this.consultasService.findStockSummary(authId);
  }

  findHistorialSemillas(
    plantaId: number,
    query: HistorialSemillasQueryDto,
    actor: VerifiedActor,
  ) {
    return this.consultasService.findHistorialSemillas(plantaId, query, actor);
  }

  findByVivero(
    viveroId: number | string,
    filters: FiltersRecoleccionDto,
    actor: VerifiedActor,
  ) {
    return this.consultasService.findByVivero(viveroId, filters, actor);
  }

  findOne(id: number, actor: VerifiedActor, cantidadSolicitadaVivero?: number) {
    return this.consultasService.findOneAutorizado(
      id,
      actor,
      cantidadSolicitadaVivero,
    );
  }
}
