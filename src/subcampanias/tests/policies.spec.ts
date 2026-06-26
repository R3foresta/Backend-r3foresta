import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { MotivoCierreParcial } from '../domain/enums/motivo-cierre-parcial.enum';
import {
  ActivacionPolicy,
  ActivacionPolicyError,
} from '../domain/policies/activacion.policy';
import {
  CierrePolicy,
  CierrePolicyError,
} from '../domain/policies/cierre.policy';
import {
  EdicionPorEstadoPolicy,
  EdicionPorEstadoPolicyError,
} from '../domain/policies/edicion-por-estado.policy';
import {
  TransicionEstadoPolicy,
  TransicionEstadoPolicyError,
} from '../domain/policies/transicion-estado.policy';

describe('TransicionEstadoPolicy', () => {
  it('permite BORRADOR -> ACTIVA', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.BORRADOR,
        EstadoSubcampania.ACTIVA,
      ),
    ).not.toThrow();
  });

  it('permite ACTIVA -> COMPLETADA', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.ACTIVA,
        EstadoSubcampania.COMPLETADA,
      ),
    ).not.toThrow();
  });

  it('permite ACTIVA -> FINALIZADA_PARCIAL', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.ACTIVA,
        EstadoSubcampania.FINALIZADA_PARCIAL,
      ),
    ).not.toThrow();
  });

  it('rechaza BORRADOR -> COMPLETADA', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.BORRADOR,
        EstadoSubcampania.COMPLETADA,
      ),
    ).toThrow(TransicionEstadoPolicyError);
  });

  it('rechaza COMPLETADA -> ACTIVA', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.COMPLETADA,
        EstadoSubcampania.ACTIVA,
      ),
    ).toThrow(TransicionEstadoPolicyError);
  });

  it('rechaza FINALIZADA_PARCIAL -> COMPLETADA', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.FINALIZADA_PARCIAL,
        EstadoSubcampania.COMPLETADA,
      ),
    ).toThrow(TransicionEstadoPolicyError);
  });

  it('rechaza ACTIVA -> BORRADOR', () => {
    expect(() =>
      TransicionEstadoPolicy.assertTransicionValida(
        EstadoSubcampania.ACTIVA,
        EstadoSubcampania.BORRADOR,
      ),
    ).toThrow(TransicionEstadoPolicyError);
  });
});

describe('ActivacionPolicy', () => {
  const base = {
    estadoActual: EstadoSubcampania.BORRADOR,
    tienePoligono: true,
    tieneCoordinador: true,
    metaTotal: 100,
  };

  it('permite activar cuando se cumplen todas las condiciones', () => {
    expect(() => ActivacionPolicy.assertPuedeActivar(base)).not.toThrow();
  });

  it('rechaza si el estado no es BORRADOR', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({
        ...base,
        estadoActual: EstadoSubcampania.ACTIVA,
      }),
    ).toThrow(ActivacionPolicyError);
  });

  it('rechaza si no hay polígono', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({ ...base, tienePoligono: false }),
    ).toThrow(ActivacionPolicyError);
  });

  it('rechaza si no hay coordinador', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({ ...base, tieneCoordinador: false }),
    ).toThrow(ActivacionPolicyError);
  });

  it('rechaza si meta_total es 0', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({ ...base, metaTotal: 0 }),
    ).toThrow(ActivacionPolicyError);
  });

  it('rechaza si meta_total es negativo', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({ ...base, metaTotal: -1 }),
    ).toThrow(ActivacionPolicyError);
  });

  it('rechaza si no hay reservas activas', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({ ...base, totalReservado: 0 }),
    ).toThrow(ActivacionPolicyError);
  });

  it('rechaza si las reservas no cubren la meta', () => {
    expect(() =>
      ActivacionPolicy.assertPuedeActivar({ ...base, totalReservado: 99 }),
    ).toThrow(ActivacionPolicyError);
  });
});

describe('CierrePolicy', () => {
  it('acepta COMPLETADA con ambas fechas', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'COMPLETADA',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: '2029-12-01',
      }),
    ).not.toThrow();
  });

  it('rechaza si falta fecha_cierre_operativo', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'COMPLETADA',
        fechaCierreOperativo: null,
        fechaFinMantenimiento: '2029-12-01',
      }),
    ).toThrow(CierrePolicyError);
  });

  it('rechaza si falta fecha_fin_mantenimiento', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'COMPLETADA',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: null,
      }),
    ).toThrow(CierrePolicyError);
  });

  it('rechaza FINALIZADA_PARCIAL sin motivo', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'FINALIZADA_PARCIAL',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: '2029-12-01',
      }),
    ).toThrow(CierrePolicyError);
  });

  it('acepta FINALIZADA_PARCIAL con motivo válido', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'FINALIZADA_PARCIAL',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: '2029-12-01',
        motivoCierreParcial: MotivoCierreParcial.FALTA_STOCK,
      }),
    ).not.toThrow();
  });

  it('rechaza estado_final inválido', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'ACTIVA',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: '2029-12-01',
      }),
    ).toThrow(CierrePolicyError);
  });

  it('rechaza si fecha_fin_mantenimiento es anterior a fecha_cierre_operativo', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'COMPLETADA',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: '2026-01-01',
      }),
    ).toThrow(CierrePolicyError);
  });

  it('rechaza motivo_cierre_parcial inválido en FINALIZADA_PARCIAL', () => {
    expect(() =>
      CierrePolicy.assertValido({
        estadoFinal: 'FINALIZADA_PARCIAL',
        fechaCierreOperativo: '2026-12-01T00:00:00Z',
        fechaFinMantenimiento: '2029-12-01',
        motivoCierreParcial: 'INVENTADO',
      }),
    ).toThrow(CierrePolicyError);
  });
});

describe('EdicionPorEstadoPolicy', () => {
  it('en BORRADOR permite nombre, descripcion, zona_id, meta_total_arboles, fechas y tolerancia', () => {
    const permitidos = EdicionPorEstadoPolicy.getCamposPermitidos(
      EstadoSubcampania.BORRADOR,
    );
    expect(permitidos.has('nombre')).toBe(true);
    expect(permitidos.has('descripcion')).toBe(true);
    expect(permitidos.has('zona_id')).toBe(true);
    expect(permitidos.has('meta_total_arboles')).toBe(true);
    expect(permitidos.has('fecha_estimada_inicio')).toBe(true);
    expect(permitidos.has('fecha_estimada_fin')).toBe(true);
    expect(permitidos.has('tolerancia_gps_metros')).toBe(true);
    expect(permitidos.has('observaciones_cierre')).toBe(false);
  });

  it('en ACTIVA solo permite descripcion, fecha_estimada_fin y tolerancia', () => {
    const permitidos = EdicionPorEstadoPolicy.getCamposPermitidos(
      EstadoSubcampania.ACTIVA,
    );
    expect(permitidos.has('descripcion')).toBe(true);
    expect(permitidos.has('fecha_estimada_fin')).toBe(true);
    expect(permitidos.has('tolerancia_gps_metros')).toBe(true);
    expect(permitidos.has('nombre')).toBe(false);
    expect(permitidos.has('meta_total_arboles')).toBe(false);
    expect(permitidos.has('zona_id')).toBe(false);
  });

  it('en COMPLETADA solo permite observaciones_cierre', () => {
    const permitidos = EdicionPorEstadoPolicy.getCamposPermitidos(
      EstadoSubcampania.COMPLETADA,
    );
    expect(permitidos.has('observaciones_cierre')).toBe(true);
    expect(permitidos.size).toBe(1);
  });

  it('en FINALIZADA_PARCIAL solo permite observaciones_cierre', () => {
    const permitidos = EdicionPorEstadoPolicy.getCamposPermitidos(
      EstadoSubcampania.FINALIZADA_PARCIAL,
    );
    expect(permitidos.has('observaciones_cierre')).toBe(true);
    expect(permitidos.size).toBe(1);
  });

  it('filtrarCamposPermitidos elimina campos no permitidos', () => {
    const filtrados = EdicionPorEstadoPolicy.filtrarCamposPermitidos(
      EstadoSubcampania.ACTIVA,
      ['nombre', 'descripcion', 'tolerancia_gps_metros'],
    );
    expect(filtrados.has('nombre')).toBe(false);
    expect(filtrados.has('descripcion')).toBe(true);
    expect(filtrados.has('tolerancia_gps_metros')).toBe(true);
  });

  it('assertCamposPermitidos lanza si hay un campo no permitido', () => {
    expect(() =>
      EdicionPorEstadoPolicy.assertCamposPermitidos(EstadoSubcampania.ACTIVA, [
        'nombre',
      ]),
    ).toThrow(EdicionPorEstadoPolicyError);
  });

  it('assertCamposPermitidos no lanza si todos los campos son válidos', () => {
    expect(() =>
      EdicionPorEstadoPolicy.assertCamposPermitidos(EstadoSubcampania.ACTIVA, [
        'descripcion',
        'tolerancia_gps_metros',
      ]),
    ).not.toThrow();
  });
});
