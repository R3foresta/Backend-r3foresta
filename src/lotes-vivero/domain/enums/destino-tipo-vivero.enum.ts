// TODO(vivero-mvp): este enum diverge del spec oficial — revisar con docs antes de migrar.
//   Spec: RF-VIV-05 y 03_operativo_modulo_vivero.md §6 listan 5 valores separados:
//     [PLANTACION_PROPIA, PLANTACION_COMUNIDAD, DONACION, VENTA, OTRO].
//   Hoy tenemos 4 con DONACION_COMUNIDAD como un único valor combinado, lo que impide
//   distinguir "plantar en tierras comunitarias" de "donar a la comunidad".
//   Sensible: cambiar este enum implica:
//     1) migración SQL nueva (ALTER TYPE destino_tipo_vivero ADD VALUE / rename)
//     2) actualizar la columna evento_lote_vivero.destino_tipo si hay filas con DONACION_COMUNIDAD
//     3) ajustar documentación (modulos/lotes-vivero.md, frontend/lotes-vivero.md)
//     4) coordinar con frontend para la nueva UI de selección.
export enum DestinoTipoVivero {
  PLANTACION_PROPIA = 'PLANTACION_PROPIA',
  DONACION_COMUNIDAD = 'DONACION_COMUNIDAD',
  VENTA = 'VENTA',
  OTRO = 'OTRO',
}
