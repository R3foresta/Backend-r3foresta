export class Ubicacion {
  id: number;
  pais?: string;
  departamento?: string;
  provincia?: string;
  comunidad?: string;
  zona?: string;
  latitud: number;
  longitud: number;
  createdAt: Date;
}
