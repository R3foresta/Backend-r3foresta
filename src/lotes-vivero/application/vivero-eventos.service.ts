import { Injectable } from '@nestjs/common';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { ViveroAdaptabilidadService } from './vivero-adaptabilidad.service';
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
  ) {}

  registrarEmbolsado(
    loteId: number,
    dto: RegistrarEmbolsadoDto,
    authId: string,
  ) {
    return this.embolsadoService.registrar(loteId, dto, authId);
  }

  registrarAdaptabilidad(
    loteId: number,
    dto: RegistrarAdaptabilidadDto,
    authId: string,
  ) {
    return this.adaptabilidadService.registrar(loteId, dto, authId);
  }

  registrarMerma(loteId: number, dto: RegistrarMermaDto, authId: string) {
    return this.mermaService.registrar(loteId, dto, authId);
  }

  registrarDespacho(loteId: number, dto: RegistrarDespachoDto, authId: string) {
    return this.despachoService.registrar(loteId, dto, authId);
  }
}
