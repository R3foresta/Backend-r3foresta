import { Injectable } from '@nestjs/common';

// TODO(vivero-mvp): servicio probablemente muerto — decidir si borrarlo o reusarlo.
//   El formato actual `VIV-{YYYY}-{base36 timestamp}` NO coincide con el spec.
//   Spec: RN-VIV-01 define `VIV-{codigo_lote_vivero}-{RECOLECCION.codigo_trazabilidad}`
//   (p.ej. `VIV-000123-REC-000045`). La RPC `fn_vivero_crear_lote_desde_recoleccion`
//   (migración 018) genera el código oficial directamente en DB e ignora cualquier
//   código pasado como parámetro (`p_codigo_trazabilidad` está marcado como legacy).
//   Verificar que nadie más invoca generateCodigoTrazabilidad antes de eliminar.
@Injectable()
export class ViveroCodigosService {
  generateCodigoTrazabilidad(fechaInicio: string): string {
    const year = String(fechaInicio).slice(0, 4);
    const suffix = Date.now().toString(36).toUpperCase();
    return `VIV-${year}-${suffix}`;
  }
}
