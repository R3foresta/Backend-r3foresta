import { Injectable } from '@nestjs/common';
import {
  CreateRecoleccionDto,
  type TipoMaterialRecoleccionCanonico,
  type TipoMaterialRecoleccionInput,
  type UnidadCanonicaRecoleccion,
  type UnidadInputRecoleccion,
} from '../api/dto/create-recoleccion.dto';
import { FiltersRecoleccionDto } from '../api/dto/filters-recoleccion.dto';
import { RejectValidationDto } from '../api/dto/reject-validation.dto';
import { UpdateDraftDto } from '../api/dto/update-draft.dto';
import { CantidadUnidadPolicy } from '../domain/policies/cantidad-unidad.policy';
import type { RecoleccionFotoInput } from '../domain/policies/evidencia-completitud.policy';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';
import { RecoleccionCreationService } from './recoleccion-creation.service';
import { RecoleccionDraftService } from './recoleccion-draft.service';
import { RecoleccionValidacionService } from './recoleccion-validacion.service';

@Injectable()
export class RecoleccionesService {
  constructor(
    private readonly creationService: RecoleccionCreationService,
    private readonly draftService: RecoleccionDraftService,
    private readonly validacionService: RecoleccionValidacionService,
    private readonly consultasService: RecoleccionConsultasService,
  ) {}

  create(
    createRecoleccionDto: CreateRecoleccionDto,
    authId: string,
    userRole?: string,
    files: RecoleccionFotoInput[] = [],
  ) {
    return this.creationService.create(
      createRecoleccionDto,
      authId,
      userRole,
      files,
    );
  }

  updateDraft(
    id: number,
    dto: UpdateDraftDto,
    authId: string,
    userRole: string,
    files: RecoleccionFotoInput[] = [],
  ) {
    return this.draftService.updateDraft(id, dto, authId, userRole, files);
  }

  submitForValidation(id: number, authId: string, userRole: string) {
    return this.validacionService.submitForValidation(id, authId, userRole);
  }

  approveValidation(id: number, authId: string, userRole: string) {
    return this.validacionService.approveValidation(id, authId, userRole);
  }

  rejectValidation(
    id: number,
    authId: string,
    userRole: string,
    dto: RejectValidationDto,
  ) {
    return this.validacionService.rejectValidation(id, authId, userRole, dto);
  }

  findPendingValidation(
    filters: FiltersRecoleccionDto,
    authId: string,
    userRole: string,
  ) {
    return this.consultasService.findPendingValidation(filters, authId, userRole);
  }

  findAll(authId: string, filters: FiltersRecoleccionDto) {
    return this.consultasService.findAll(authId, filters);
  }

  findByVivero(viveroId: number, filters: FiltersRecoleccionDto) {
    return this.consultasService.findByVivero(viveroId, filters);
  }

  findOne(id: number, cantidadSolicitadaVivero?: number) {
    return this.consultasService.findOne(id, cantidadSolicitadaVivero);
  }

  private getCanonicalRecoleccionSelect(): string {
    return this.consultasService.getCanonicalRecoleccionSelect();
  }

  private normalizeTipoMaterial(
    tipoMaterial: TipoMaterialRecoleccionInput,
  ): TipoMaterialRecoleccionCanonico {
    return CantidadUnidadPolicy.normalizarTipoMaterial(tipoMaterial);
  }

  private normalizeAndValidateCantidadYUnidad(
    cantidad: number,
    unidadInput: string | null | undefined,
    tipoMaterial: string,
  ): {
    unidad_canonica: 'G' | 'UNIDAD';
    cantidad_canonica: number;
  } {
    return CantidadUnidadPolicy.normalizarYValidar(
      cantidad,
      unidadInput,
      tipoMaterial,
    );
  }

  private validateCanonicalCantidadYUnidad(
    cantidad: number,
    unidadCanonica: UnidadCanonicaRecoleccion,
    tipoMaterial: string,
  ): {
    unidad_canonica: 'G' | 'UNIDAD';
    cantidad_canonica: number;
  } {
    return CantidadUnidadPolicy.validarCanonica(
      cantidad,
      unidadCanonica,
      tipoMaterial,
    );
  }

  private normalizeUnidadInput(
    unidadCanonica: string | null | undefined,
  ): UnidadInputRecoleccion {
    return CantidadUnidadPolicy.normalizarUnidadInput(unidadCanonica);
  }
}
