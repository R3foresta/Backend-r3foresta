import { Injectable, NotImplementedException } from '@nestjs/common';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { ViveroAdaptabilidadService } from './vivero-adaptabilidad.service';
import { ViveroAuthService } from './vivero-auth.service';
import { ViveroEmbolsadoService } from './vivero-embolsado.service';
import { ViveroMermaService } from './vivero-merma.service';

@Injectable()
export class ViveroEventosService {
  constructor(
    private readonly authService: ViveroAuthService,
    private readonly embolsadoService: ViveroEmbolsadoService,
    private readonly adaptabilidadService: ViveroAdaptabilidadService,
    private readonly mermaService: ViveroMermaService,
  ) {}

  registrarEmbolsado(loteId: number, dto: RegistrarEmbolsadoDto, authId: string) {
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

  // TODO(vivero-mvp): implementar DESPACHO — requisito BLOQUEANTE del MVP.
  //   Spec: RF-VIV-05, RN-VIV-08, RN-VIV-20, RN-VIV-23, doc operativo §4.5.
  //   La RPC `fn_vivero_registrar_despacho` ya existe en migración 020 con la firma
  //   esperada (p_lote_id, p_fecha_evento, p_responsable_id, p_cantidad_despachada,
  //   p_destino_tipo, p_destino_referencia, p_comunidad_destino_id, p_observaciones,
  //   p_evidencia_ids). Falta conectarla desde aquí (o desde un ViveroDespachoService
  //   nuevo, siguiendo el patrón de embolsado/merma/adaptabilidad).
  //   Sensible: el enum `DestinoTipoVivero` actual diverge del spec — ver TODO en
  //   domain/enums/destino-tipo-vivero.enum.ts antes de implementar.
  //   Cierre automático: la RPC debe llamar `fn_vivero_cerrar_lote_si_corresponde`
  //   cuando saldo_vivo llegue a 0 (igual que merma — ver migración 020 línea 286).
  async registrarDespacho(
    loteId: number,
    dto: RegistrarDespachoDto,
    authId: string,
  ) {
    await this.assertCanWrite(authId);

    throw new NotImplementedException(
      'Pendiente: registrar DESPACHO usando fn_vivero_registrar_despacho.',
    );
  }

  private async assertCanWrite(authId: string): Promise<void> {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);
  }
}
