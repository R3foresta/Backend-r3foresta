import { Injectable } from '@nestjs/common';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
import { CrearLoteViveroDto } from '../api/dto/crear-lote-vivero.dto';
import { FiltrarLotesViveroDto } from '../api/dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { ViveroConsultasService } from './vivero-consultas.service';
import { ViveroEventosService } from './vivero-eventos.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';
import { ViveroInicioService } from './vivero-inicio.service';

@Injectable()
export class LotesViveroService {
  constructor(
    private readonly inicioService: ViveroInicioService,
    private readonly eventosService: ViveroEventosService,
    private readonly consultasService: ViveroConsultasService,
    private readonly evidenciasService: ViveroEvidenciasService,
  ) {}

  crearEvidenciaPendiente(
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[] = [],
  ) {
    return this.evidenciasService.crearPendienteParaEvento(dto, authId, files);
  }

  crearDesdeRecoleccion(dto: CrearLoteViveroDto, authId: string) {
    return this.inicioService.crearDesdeRecoleccion(dto, authId);
  }

  registrarEmbolsado(
    loteId: number,
    dto: RegistrarEmbolsadoDto,
    authId: string,
  ) {
    return this.eventosService.registrarEmbolsado(loteId, dto, authId);
  }

  registrarAdaptabilidad(
    loteId: number,
    dto: RegistrarAdaptabilidadDto,
    authId: string,
  ) {
    return this.eventosService.registrarAdaptabilidad(loteId, dto, authId);
  }

  registrarMerma(loteId: number, dto: RegistrarMermaDto, authId: string) {
    return this.eventosService.registrarMerma(loteId, dto, authId);
  }

  registrarDespacho(loteId: number, dto: RegistrarDespachoDto, authId: string) {
    return this.eventosService.registrarDespacho(loteId, dto, authId);
  }

  listarLotes(filters: FiltrarLotesViveroDto) {
    return this.consultasService.listarLotes(filters);
  }

  obtenerTimeline(loteId: number, filters: FiltrarTimelineLoteDto) {
    return this.consultasService.obtenerTimeline(loteId, filters);
  }
}
