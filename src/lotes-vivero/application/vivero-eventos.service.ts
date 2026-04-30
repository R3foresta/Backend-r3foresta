import { Injectable, NotImplementedException } from '@nestjs/common';
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { ViveroAuthService } from './vivero-auth.service';
import { ViveroEmbolsadoService } from './vivero-embolsado.service';

@Injectable()
export class ViveroEventosService {
  constructor(
    private readonly authService: ViveroAuthService,
    private readonly embolsadoService: ViveroEmbolsadoService,
  ) {}

  registrarEmbolsado(loteId: number, dto: RegistrarEmbolsadoDto, authId: string) {
    return this.embolsadoService.registrar(loteId, dto, authId);
  }

  async registrarAdaptabilidad(
    loteId: number,
    dto: RegistrarAdaptabilidadDto,
    authId: string,
  ) {
    await this.assertCanWrite(authId);

    throw new NotImplementedException(
      'Pendiente: registrar ADAPTABILIDAD usando fn_vivero_registrar_adaptabilidad.',
    );
  }

  async registrarMerma(loteId: number, dto: RegistrarMermaDto, authId: string) {
    await this.assertCanWrite(authId);

    throw new NotImplementedException(
      'Pendiente: registrar MERMA usando fn_vivero_registrar_merma.',
    );
  }

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
