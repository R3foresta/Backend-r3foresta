import { TipoMaterial } from '../enums/tipo-material.enum';
import { EstadoRecoleccion } from '../enums/estado-recoleccion.enum';

export class Recoleccion {
  id: number;
  fecha: Date;
  nombreCientifico?: string;
  nombreComercial?: string;
  cantidad: number;
  unidad: string;
  tipoMaterial: TipoMaterial;
  estado: EstadoRecoleccion;
  especieNueva: boolean;
  observaciones?: string;
  usuarioId: number;
  ubicacionId: number;
  viveroId?: number;
  metodoId: number;
  plantaId?: number;
  createdAt: Date;
}
