// Valores publicos de destino_tipo para DESPACHO MANUAL en el modulo Vivero (M2).
// El enum SQL `destino_tipo_vivero` incluye ademas 'PLANTACION_CAMPANIA', pero ese
// valor solo se usa internamente en la asignacion fisica a subcampania
// (origen_despacho = ASIGNACION_SUBCAMPANIA). No debe estar disponible en este
// enum publico: el endpoint manual lo rechaza y la RPC fn_vivero_registrar_despacho
// lo bloquea explicitamente.
export enum DestinoTipoVivero {
  PLANTACION_PROPIA = 'PLANTACION_PROPIA',
  PLANTACION_COMUNIDAD = 'PLANTACION_COMUNIDAD',
  DONACION = 'DONACION',
  VENTA = 'VENTA',
  OTRO = 'OTRO',
}
