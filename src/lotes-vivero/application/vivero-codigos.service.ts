import { Injectable } from '@nestjs/common';

@Injectable()
export class ViveroCodigosService {
  generateCodigoTrazabilidad(fechaInicio: string): string {
    const year = String(fechaInicio).slice(0, 4);
    const suffix = Date.now().toString(36).toUpperCase();
    return `VIV-${year}-${suffix}`;
  }
}
