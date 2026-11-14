export enum ModalidadIncorporacion {
  RECEPCION = 'RECEPCION',
  SALDO_INICIAL = 'SALDO_INICIAL',
}

export enum ProcedenciaIncorporacion {
  COMPRA = 'COMPRA',
  DONACION = 'DONACION',
  PRODUCCION_PROPIA = 'PRODUCCION_PROPIA',
  DESCONOCIDA = 'DESCONOCIDA',
}

/** La producción nueva conserva el camino M1; el saldo inicial registra remanentes. */
export function validarProcedenciaIncorporacion(input: {
  modalidad: ModalidadIncorporacion;
  procedencia: ProcedenciaIncorporacion;
  observaciones?: string;
}): string | null {
  if (
    input.modalidad === ModalidadIncorporacion.RECEPCION &&
    ![
      ProcedenciaIncorporacion.COMPRA,
      ProcedenciaIncorporacion.DONACION,
    ].includes(input.procedencia)
  )
    return 'RECEPCION admite solamente COMPRA o DONACION.';
  if (
    input.procedencia === ProcedenciaIncorporacion.DESCONOCIDA &&
    !input.observaciones?.trim()
  )
    return 'La procedencia DESCONOCIDA requiere explicar sus límites en observaciones.';
  return null;
}
