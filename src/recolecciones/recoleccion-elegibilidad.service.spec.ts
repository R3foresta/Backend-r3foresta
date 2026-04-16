import { BadRequestException } from '@nestjs/common';
import { RecoleccionElegibilidadService } from './recoleccion-elegibilidad.service';
import { EstadoRegistro } from './enums/estado-registro.enum';

describe('RecoleccionElegibilidadService', () => {
  let service: RecoleccionElegibilidadService;

  beforeEach(() => {
    service = new RecoleccionElegibilidadService();
  });

  it('marca como elegible una recoleccion validada, abierta, con planta y saldo suficiente', () => {
    const resultado = service.evaluarRecoleccionElegibleParaInicioVivero(
      {
        estado_registro: EstadoRegistro.VALIDADO,
        estado_operativo: 'ABIERTO',
        saldo_actual: 120,
        planta_id: 55,
      },
      80,
    );

    expect(resultado).toEqual({
      elegible: true,
      motivo_no_elegibilidad: null,
      cantidad_solicitada: 80,
      saldo_actual: 120,
      estado_operativo: 'ABIERTO',
    });
  });

  it('rechaza cuando la recoleccion no esta validada', () => {
    const resultado = service.evaluarRecoleccionElegibleParaInicioVivero({
      estado_registro: EstadoRegistro.PENDIENTE_VALIDACION,
      estado_operativo: 'ABIERTO',
      saldo_actual: 120,
      planta_id: 55,
    });

    expect(resultado.elegible).toBe(false);
    expect(resultado.motivo_no_elegibilidad).toBe(
      'La recoleccion no esta validada.',
    );
  });

  it('rechaza cuando la recoleccion esta cerrada', () => {
    const resultado = service.evaluarRecoleccionElegibleParaInicioVivero({
      estado_registro: EstadoRegistro.VALIDADO,
      estado_operativo: 'CERRADO',
      saldo_actual: 0,
      planta_id: 55,
    });

    expect(resultado.elegible).toBe(false);
    expect(resultado.motivo_no_elegibilidad).toBe(
      'La recoleccion esta cerrada para consumo hacia vivero.',
    );
  });

  it('rechaza cuando estado_operativo trae un valor invalido', () => {
    const resultado = service.evaluarRecoleccionElegibleParaInicioVivero({
      estado_registro: EstadoRegistro.VALIDADO,
      estado_operativo: 'INCONSISTENTE',
      saldo_actual: 80,
      planta_id: 55,
    });

    expect(resultado.elegible).toBe(false);
    expect(resultado.estado_operativo).toBe('CERRADO');
    expect(resultado.motivo_no_elegibilidad).toBe(
      'La recoleccion tiene un estado_operativo invalido.',
    );
  });

  it('rechaza cuando no existe planta asociada', () => {
    const resultado = service.evaluarRecoleccionElegibleParaInicioVivero({
      estado_registro: EstadoRegistro.VALIDADO,
      estado_operativo: 'ABIERTO',
      saldo_actual: 50,
      planta_id: null,
    });

    expect(resultado.elegible).toBe(false);
    expect(resultado.motivo_no_elegibilidad).toBe(
      'La recoleccion no tiene planta asociada.',
    );
  });

  it('rechaza cuando el saldo no alcanza para la cantidad solicitada', () => {
    const resultado = service.evaluarRecoleccionElegibleParaInicioVivero(
      {
        estado_registro: EstadoRegistro.VALIDADO,
        estado_operativo: 'ABIERTO',
        saldo_actual: 25,
        planta_id: 55,
      },
      30,
    );

    expect(resultado.elegible).toBe(false);
    expect(resultado.motivo_no_elegibilidad).toBe(
      'La recoleccion no tiene saldo suficiente para la cantidad solicitada.',
    );
  });

  it('lanza error cuando se exige validar una cantidad invalida', () => {
    expect(() =>
      service.validarRecoleccionElegibleParaInicioVivero(
        {
          estado_registro: EstadoRegistro.VALIDADO,
          estado_operativo: 'ABIERTO',
          saldo_actual: 25,
          planta_id: 55,
        },
        0,
      ),
    ).toThrow(BadRequestException);
  });
});
