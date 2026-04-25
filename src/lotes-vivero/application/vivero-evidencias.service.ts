import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class ViveroEvidenciasService {
  async vincularEvidenciaEvento(): Promise<never> {
    throw new NotImplementedException(
      'Pendiente: vincular evidencia obligatoria al evento de vivero.',
    );
  }
}
