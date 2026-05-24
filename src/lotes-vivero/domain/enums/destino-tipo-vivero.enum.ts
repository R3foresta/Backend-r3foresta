// Valores publicos de destino_tipo para DESPACHO MANUAL en el modulo Vivero (M2).
// El enum SQL `destino_tipo_vivero` incluye ademas 'PLANTACION_CAMPANIA', pero ese
// valor esta reservado para despachos automaticos generados desde Modulo 3 y NO
// debe estar disponible en este enum publico: el endpoint manual lo rechaza y la
// RPC fn_vivero_registrar_despacho lo bloquea explicitamente.
export enum DestinoTipoVivero {
  PLANTACION_PROPIA = 'PLANTACION_PROPIA',
  PLANTACION_COMUNIDAD = 'PLANTACION_COMUNIDAD',
  DONACION = 'DONACION',
  VENTA = 'VENTA',
  OTRO = 'OTRO',
}
