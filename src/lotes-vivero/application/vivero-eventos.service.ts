import { Injectable } from '@nestjs/common';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarDescartePreEmbolsadoDto } from '../api/dto/registrar-descarte-pre-embolsado.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { ViveroAdaptabilidadService } from './vivero-adaptabilidad.service';
import { ViveroDescartePreEmbolsadoService } from './vivero-descarte-pre-embolsado.service';
import { ViveroDespachoService } from './vivero-despacho.service';
import { ViveroEmbolsadoService } from './vivero-embolsado.service';
import { ViveroMermaService } from './vivero-merma.service';

@Injectable()
export class ViveroEventosService {
  constructor(
    private readonly embolsadoService: ViveroEmbolsadoService,
    private readonly adaptabilidadService: ViveroAdaptabilidadService,
    private readonly mermaService: ViveroMermaService,
    private readonly despachoService: ViveroDespachoService,
    private readonly descartePreEmbolsadoService: ViveroDescartePreEmbolsadoService,
  ) {}

  registrarEmbolsado(
    loteId: number | string,
    dto: RegistrarEmbolsadoDto,
    authId: string,
  ) {
    return this.embolsadoService.registrar(loteId, dto, authId);
  }

  registrarAdaptabilidad(
    loteId: number | string,
    dto: RegistrarAdaptabilidadDto,
    authId: string,
  ) {
    return this.adaptabilidadService.registrar(loteId, dto, authId);
  }

  registrarMerma(
    loteId: number | string,
    dto: RegistrarMermaDto,
    authId: string,
  ) {
    return this.mermaService.registrar(loteId, dto, authId);
  }

  registrarDespacho(
    loteId: number | string,
    dto: RegistrarDespachoDto,
    authId: string,
  ) {
    return this.despachoService.registrar(loteId, dto, authId);
  }

  registrarDescartePreEmbolsado(
    loteId: number | string,
    dto: RegistrarDescartePreEmbolsadoDto,
    authId: string,
  ) {
    return this.descartePreEmbolsadoService.registrar(loteId, dto, authId);
  }
}
