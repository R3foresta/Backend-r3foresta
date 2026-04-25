import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class ViveroSnapshotsService {
  async resolveDesdeRecoleccion(): Promise<never> {
    throw new NotImplementedException(
      'Pendiente: resolver snapshots heredados desde RECOLECCION validada.',
    );
  }
}
