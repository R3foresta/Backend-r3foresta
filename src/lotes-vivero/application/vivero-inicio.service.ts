import { Injectable, NotImplementedException } from '@nestjs/common';
import { CrearLoteViveroDto } from '../api/dto/crear-lote-vivero.dto';
import { ViveroAuthService } from './vivero-auth.service';

@Injectable()
export class ViveroInicioService {
  constructor(private readonly authService: ViveroAuthService) {}

  async crearDesdeRecoleccion(dto: CrearLoteViveroDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    throw new NotImplementedException(
      'Pendiente: crear lote de vivero desde recoleccion con consumo atomico.',
    );
  }
}
