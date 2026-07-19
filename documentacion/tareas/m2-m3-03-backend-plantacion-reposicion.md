# M2-M3-03 - Backend plantacion y reposicion como consumo de asignaciones

## Objetivo

Ajustar `fn_m3_registrar_plantacion` y el servicio NestJS para que plantacion inicial y reposicion consuman stock ya asignado fisicamente, sin generar despachos M2 ni tocar `LOTE_VIVERO.saldo_vivo_actual`.

## Estado actual observado

- La RPC valida asignaciones, proposito y `saldo_asignado_disponible`.
- Luego inserta `EVENTO_LOTE_VIVERO` tipo `DESPACHO` con `AUTOMATICO_PLANTACION`.
- Tambien descuenta `LOTE_VIVERO.saldo_vivo_actual`.
- La respuesta del endpoint devuelve `despachos`.
- La RPC solo permite subcampania `ACTIVA`, lo cual bloquea reposiciones en `COMPLETADA` y `FINALIZADA_PARCIAL`.
- No se encontro validacion de reposicion contra `cantidad_muerta_acumulada - cantidad_repuesta_acumulada`.

## Alcance

- Reescribir `fn_m3_registrar_plantacion`:
  - eliminar insercion de `EVENTO_LOTE_VIVERO`
  - eliminar update de `LOTE_VIVERO.saldo_vivo_actual`
  - eliminar invariante basada en despachos
  - mantener insercion de `REGISTRO_PLANTACION`
  - mantener insercion de `REGISTRO_PLANTACION_DETALLE`
  - mantener update de `ASIGNACION_VIVERO_SUBCAMPANIA.cantidad_consumida`
  - mantener vinculacion de evidencias a `REGISTRO_PLANTACION`
- Ajustar estados permitidos:
  - plantacion inicial: solo `ACTIVA`
  - reposicion: `ACTIVA`, `COMPLETADA`, `FINALIZADA_PARCIAL`
- Validar proposito:
  - `es_reposicion = false` consume `PLANTACION_INICIAL`
  - `es_reposicion = true` consume `REPOSICION`
- Validar reposicion:
  - origen existe y no es reposicion
  - cantidad total de la reposicion no supera `cantidad_muerta_acumulada - cantidad_repuesta_acumulada` del grupo origen
  - reposicion no avanza meta de subcampania
- Validar plantacion inicial contra meta por especie:
  - especie existe en `SUBCAMPANIA_META_ESPECIE`
  - acumulado plantado por especie no supera `cantidad_objetivo`
- Ajustar respuesta del servicio:
  - remover `despachos`
  - exponer detalles consumidos o resumen de asignaciones consumidas si frontend lo requiere.
- Ajustar Swagger y tests.

## Fuera de alcance

- Crear asignacion fisica.
- Devolucion fisica.
- Mortandad como flujo completo si no existe aun; solo usar sus acumulados para validar reposicion.

## Archivos probables

- `migrations/034_m3_registrar_plantacion_rpc.sql`
- nueva migracion `migrations/052_m3_registrar_plantacion_sin_despacho.sql`
- `src/plantaciones/application/plantacion-creation.service.ts`
- `src/plantaciones/api/docs/plantaciones.swagger.ts`
- `src/plantaciones/tests/plantacion-creation.service.spec.ts`
- `test/e2e/p0/subcampanias-p0.e2e-spec.ts`

## Criterios de aceptacion

- Registrar plantacion no crea filas en `EVENTO_LOTE_VIVERO`.
- Registrar plantacion no cambia `LOTE_VIVERO.saldo_vivo_actual`.
- Registrar plantacion aumenta `cantidad_consumida` de las asignaciones usadas.
- Registrar reposicion consume solo asignaciones `REPOSICION`.
- Registrar reposicion bloquea exceso sobre pendiente de reposicion.
- La respuesta API no expone `despachos` como parte del flujo vigente.
- No hay nuevo uso de `AUTOMATICO_PLANTACION`.

## Pruebas esperadas

- Unit test de mapping de servicio sin `despachos`.
- E2E DB de plantacion inicial exitosa.
- E2E DB que confirme cero eventos M2 generados al plantar.
- E2E DB que confirme saldo del lote intacto al plantar.
- E2E DB de reposicion en `COMPLETADA`.
- E2E DB de reposicion bloqueada por exceso.
- E2E DB de plantacion inicial bloqueada por meta de especie.

## Riesgos

- Si el frontend depende de `despachos`, coordinar con `M2-M3-06`.
- La validacion por especie puede requerir queries agregadas nuevas si no existen vistas/materializados.
