import { ViveroAuthService } from './vivero-auth.service';
import { Injectable } from '@nestjs/common';
import { CrearAsignacionDto } from '../api/dto/crear-asignacion.dto';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
import { DevolverAsignacionDto } from '../api/dto/devolver-asignacion.dto';
import { CrearLoteViveroDto } from '../api/dto/crear-lote-vivero.dto';
import { FiltrarLotesViveroDto } from '../api/dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarDescartePreEmbolsadoDto } from '../api/dto/registrar-descarte-pre-embolsado.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { ViveroAdaptabilidadService } from './vivero-adaptabilidad.service';
import { ViveroAsignacionesService } from './vivero-asignaciones.service';
import { ViveroConsultasService } from './vivero-consultas.service';
import { ViveroDescartePreEmbolsadoService } from './vivero-descarte-pre-embolsado.service';
import { ViveroDespachoService } from './vivero-despacho.service';
import { ViveroEmbolsadoService } from './vivero-embolsado.service';
import { ViveroEventosService } from './vivero-eventos.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';
import { ViveroInicioService } from './vivero-inicio.service';
import { ViveroMermaService } from './vivero-merma.service';
import { ViveroSaldosService } from './vivero-saldos.service';

@Injectable()
export class LotesViveroService {
  constructor(
    private readonly authService: ViveroAuthService,
    private readonly inicioService: ViveroInicioService,
    private readonly eventosService: ViveroEventosService,
    private readonly consultasService: ViveroConsultasService,
    private readonly evidenciasService: ViveroEvidenciasService,
    private readonly embolsadoService: ViveroEmbolsadoService,
    private readonly adaptabilidadService: ViveroAdaptabilidadService,
    private readonly mermaService: ViveroMermaService,
    private readonly despachoService: ViveroDespachoService,
    private readonly descartePreEmbolsadoService: ViveroDescartePreEmbolsadoService,
    private readonly saldosService: ViveroSaldosService,
    private readonly asignacionesService: ViveroAsignacionesService,
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
    loteId: number | string,
    dto: RegistrarEmbolsadoDto,
    authId: string,
  ) {
    return this.eventosService.registrarEmbolsado(loteId, dto, authId);
  }

  async obtenerContextoEmbolsado(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.embolsadoService.obtenerContexto(loteId);
  }

  crearEvidenciasPendientesEmbolsado(
    loteId: number | string,
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[],
  ) {
    return this.embolsadoService.crearEvidenciasPendientes(
      loteId,
      dto,
      authId,
      files,
    );
  }

  async obtenerResultadoEmbolsado(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.embolsadoService.obtenerResultado(loteId);
  }

  registrarAdaptabilidad(
    loteId: number | string,
    dto: RegistrarAdaptabilidadDto,
    authId: string,
  ) {
    return this.eventosService.registrarAdaptabilidad(loteId, dto, authId);
  }

  crearEvidenciasPendientesAdaptabilidad(
    loteId: number | string,
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[],
  ) {
    return this.adaptabilidadService.crearEvidenciasPendientes(
      loteId,
      dto,
      authId,
      files,
    );
  }

  async obtenerAdaptabilidades(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.adaptabilidadService.obtenerAdaptabilidades(loteId);
  }

  registrarMerma(
    loteId: number | string,
    dto: RegistrarMermaDto,
    authId: string,
  ) {
    return this.eventosService.registrarMerma(loteId, dto, authId);
  }

  crearEvidenciasPendientesMerma(
    loteId: number | string,
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[],
  ) {
    return this.mermaService.crearEvidenciasPendientes(
      loteId,
      dto,
      authId,
      files,
    );
  }

  async obtenerMermas(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.mermaService.obtenerMermas(loteId);
  }

  registrarDespacho(
    loteId: number | string,
    dto: RegistrarDespachoDto,
    authId: string,
  ) {
    return this.eventosService.registrarDespacho(loteId, dto, authId);
  }

  crearEvidenciasPendientesDespacho(
    loteId: number | string,
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[],
  ) {
    return this.despachoService.crearEvidenciasPendientes(
      loteId,
      dto,
      authId,
      files,
    );
  }

  async obtenerDespachos(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.despachoService.obtenerDespachos(loteId);
  }

  registrarDescartePreEmbolsado(
    loteId: number | string,
    dto: RegistrarDescartePreEmbolsadoDto,
    authId: string,
  ) {
    return this.eventosService.registrarDescartePreEmbolsado(
      loteId,
      dto,
      authId,
    );
  }

  crearEvidenciasPendientesDescartePreEmbolsado(
    loteId: number | string,
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[],
  ) {
    return this.descartePreEmbolsadoService.crearEvidenciasPendientes(
      loteId,
      dto,
      authId,
      files,
    );
  }

  async listarLotes(filters: FiltrarLotesViveroDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    const ambitos = await this.authService.ambitos(usuario);
    if (filters.vivero_id)
      await this.authService.assertVivero(usuario, filters.vivero_id);
    if (filters.lote_vivero_id)
      await this.authService.assertLote(usuario, filters.lote_vivero_id);
    return this.consultasService.listarLotes(filters, ambitos);
  }

  async obtenerDetalle(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.consultasService.obtenerDetalle(loteId);
  }

  async obtenerTimeline(
    loteId: number | string,
    filters: FiltrarTimelineLoteDto,
    authId: string,
  ) {
    await this.authorizeLote(loteId, authId);
    return this.consultasService.obtenerTimeline(loteId, filters);
  }

  async obtenerSaldos(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.saldosService.obtenerSaldos(loteId);
  }

  async listarStockDisponiblePorEspecie(authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    const ambitos = await this.authService.ambitos(usuario);
    return this.saldosService.listarStockDisponiblePorEspecie(ambitos);
  }

  crearAsignacion(
    loteId: number | string,
    dto: CrearAsignacionDto,
    authId: string,
  ) {
    return this.asignacionesService.crearAsignacion(loteId, dto, authId);
  }

  async listarAsignaciones(loteId: number | string, authId: string) {
    await this.authorizeLote(loteId, authId);
    return this.asignacionesService.listarAsignaciones(loteId);
  }

  devolverAsignacion(
    loteId: number | string,
    asignacionId: number | string,
    dto: DevolverAsignacionDto,
    authId: string,
  ) {
    return this.asignacionesService.devolverAsignacion(
      loteId,
      asignacionId,
      dto,
      authId,
    );
  }
  private async authorizeLote(loteId: number | string, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    await this.authService.assertLote(usuario, loteId);
  }
}
