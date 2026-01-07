import { FuentePlanta } from '../enums/fuente-planta.enum';

export class Planta {
  id: number;
  especie: string;
  nombreCientifico: string;
  variedad: string;
  tipoPlanta?: string;
  tipoPlantaOtro?: string;
  fuente: FuentePlanta;
  createdAt: Date;
}
