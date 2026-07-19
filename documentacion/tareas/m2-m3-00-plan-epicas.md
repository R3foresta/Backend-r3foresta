# M2-M3-00 - Plan de epicas de alineacion Vivero - Plantacion

## Contexto

El backend actual implementa principalmente el flujo anterior:

- `ASIGNACION_VIVERO_SUBCAMPANIA` funciona como reserva logica.
- `fn_m3_registrar_plantacion` genera `EVENTO_LOTE_VIVERO` tipo `DESPACHO` con `origen_despacho = AUTOMATICO_PLANTACION`.
- El descuento de `LOTE_VIVERO.saldo_vivo_actual` ocurre al plantar/reponer.
- Devoluciones y cancelacion liberan reservas, pero no retornan stock fisico al lote.

El contrato vigente exige:

- La asignacion es entrega fisica.
- Al asignar baja `LOTE_VIVERO.saldo_vivo_actual`.
- Plantar/reponer solo consume `ASIGNACION_VIVERO_SUBCAMPANIA.saldo_asignado_disponible`.
- No se usa `AUTOMATICO_PLANTACION` en el flujo nuevo.
- La devolucion fisica aumenta `cantidad_devuelta` y tambien `LOTE_VIVERO.saldo_vivo_actual`.

## Fuentes

- `../../../r3foresta-docs/ESTADO.md`
- `../../../r3foresta-docs/90-contratos-integracion/02_contrato_vivero_a_plantacion.md`
- `../../../r3foresta-docs/03-plantacion-module/01_reglas_de_negocio_plantacion.md`
- `../../../r3foresta-docs/03-plantacion-module/02_Procesos_Modulo_3_Plantacion.md`
- `../../../r3foresta-docs/03-plantacion-module/00_Requerimientos_Modulo_3_Plantacion.json`

## Epicas

### Epica 1 - Base de datos del nuevo contrato

Tarea: `M2-M3-01`

Preparar enums, CHECKs, FKs, columnas y vistas para que BD pueda representar el nuevo flujo sin contradicciones.

### Epica 2 - Asignacion fisica desde vivero

Tarea: `M2-M3-02`

Cambiar el endpoint/RPC de asignacion para crear una entrega fisica atomica: asignacion, evento M2, descuento de saldo, evidencia y evento M3.

### Epica 3 - Plantacion y reposicion como consumo de asignaciones

Tarea: `M2-M3-03`

Modificar `fn_m3_registrar_plantacion` para dejar de generar despachos M2 y consumir exclusivamente asignaciones activas por proposito.

### Epica 4 - Devolucion fisica y cancelacion

Tarea: `M2-M3-04`

Implementar retorno fisico al vivero y usarlo en cancelacion de subcampania sin plantaciones.

### Epica 5 - Saldos, mermas y consultas

Tarea: `M2-M3-05`

Separar saldo fisico en vivero de stock asignado a subcampania. Ajustar merma M2 para que no afecte asignaciones entregadas.

### Epica 6 - Contrato API y frontend

Tarea: `M2-M3-06`

Actualizar Swagger, documentacion de frontend y contratos de request/response para que el cliente deje de usar lenguaje de reservas y despachos automaticos.

### Epica 7 - Pruebas y regresion

Tarea: `M2-M3-07`

Agregar cobertura unitaria/e2e de saldos, concurrencia, no uso de `AUTOMATICO_PLANTACION`, evidencias y cancelacion/devolucion.

## Dependencias

```text
M2-M3-01
  -> M2-M3-02
      -> M2-M3-03
      -> M2-M3-04
      -> M2-M3-05
          -> M2-M3-06
          -> M2-M3-07
```

`M2-M3-06` puede empezar en paralelo como ajuste documental, pero no debe cerrarse hasta que las respuestas reales del backend esten definidas.

## Criterio global de cierre

- No hay codigo nuevo que emita `origen_despacho = AUTOMATICO_PLANTACION`.
- La asignacion fisica descuenta `LOTE_VIVERO.saldo_vivo_actual`.
- Plantacion/reposicion no modifican `LOTE_VIVERO.saldo_vivo_actual`.
- Devolucion fisica aumenta `LOTE_VIVERO.saldo_vivo_actual`.
- Mermas M2 solo afectan saldo fisico en vivero.
- Las APIs de consulta no presentan la identidad antigua como saldo vigente.
- Tests unitarios y e2e cubren el flujo completo.
