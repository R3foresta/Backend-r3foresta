/** M1 no concede revisión ni facultades de Vivero. La RPC revalida bajo locks. */
export class AccesoRecoleccionPolicy {
  static rolInterno(rol: string): boolean {
    return ['ADMIN', 'GENERAL', 'VALIDADOR'].includes(rol);
  }
  static puedeMantener(
    rol: string,
    actor: string | number,
    autor: string | number,
  ): boolean {
    return rol === 'ADMIN' || String(actor) === String(autor);
  }
}
