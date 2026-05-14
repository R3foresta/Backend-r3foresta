import { Injectable, NotImplementedException } from '@nestjs/common';

// TODO(vivero-mvp): servicio sin uso — decidir si borrarlo.
//   Los snapshots heredados de RECOLECCION (nombre_cientifico_snapshot,
//   nombre_comercial_snapshot, tipo_material_snapshot, variedad_snapshot,
//   nombre_comunidad_origen_snapshot, nombre_responsable_snapshot) se resuelven
//   y congelan dentro de la RPC `fn_vivero_crear_lote_desde_recoleccion`
//   (migración 018 líneas 200-240), no en TS.
//   Spec: RN-VIV-07, RN-VIV-16A.
//   Si se conserva como punto de extensión futura (p.ej. preview en frontend),
//   documentarlo. Si no, eliminar la clase y su registro en lotes-vivero.module.ts.
@Injectable()
export class ViveroSnapshotsService {
  async resolveDesdeRecoleccion(): Promise<never> {
    throw new NotImplementedException(
      'Pendiente: resolver snapshots heredados desde RECOLECCION validada.',
    );
  }
}
