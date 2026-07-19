# Tareas

Indice de tareas tecnicas del backend.

## Integracion M2 Vivero - M3 Plantacion

Estas tareas parten de la revision backend de alineacion post aclaraciones de plantacion. El objetivo general es migrar el flujo actual de "reserva logica + despacho automatico al plantar" al contrato vigente de "asignacion fisica + consumo posterior de stock asignado".

Orden sugerido:

1. [M2-M3-01 - BD contrato de asignacion fisica](m2-m3-01-bd-contrato-asignacion-fisica.md)
2. [M2-M3-02 - Backend asignacion fisica](m2-m3-02-backend-asignacion-fisica.md)
3. [M2-M3-03 - Backend plantacion y reposicion](m2-m3-03-backend-plantacion-reposicion.md)
4. [M2-M3-04 - Backend devolucion y cancelacion](m2-m3-04-backend-devolucion-cancelacion.md)
5. [M2-M3-05 - Backend mermas, saldos y consultas](m2-m3-05-backend-mermas-saldos-consultas.md)
6. [M2-M3-06 - Contrato API y frontend](m2-m3-06-api-frontend-contrato.md)
7. [M2-M3-07 - Pruebas de regresion y concurrencia](m2-m3-07-pruebas-regresion-concurrencia.md)

Resumen ejecutivo y desglose por epicas:

- [M2-M3-00 - Plan de epicas](m2-m3-00-plan-epicas.md)

### Estado de implementacion (2026-07-07)

Las 7 tareas estan **implementadas en el repo**:

| Pieza | Artefactos |
|---|---|
| M2-M3-01 | `migrations/051_m2_m3_asignacion_fisica_schema.sql` (enum `ASIGNACION_SUBCAMPANIA`, evento `DEVOLUCION_PLANTACION`, columna `evento_lote_vivero.asignacion_id`, FKs M3, CHECK NOT VALID que bloquea nuevas escrituras `AUTOMATICO_PLANTACION`, vista `v_lote_vivero_saldos` fisica) |
| M2-M3-02 | `migrations/052_vivero_asignar_stock_subcampania_rpc.sql` (+ DROP de `fn_vivero_reservar_stock_lote`), DTO/servicio/controller/Swagger de `POST /lotes-vivero/:id/asignaciones`; alias `POST :id/reservas` eliminado |
| M2-M3-03 | `migrations/053_m3_registrar_plantacion_sin_despacho.sql`, servicio de plantacion con `consumos` (sin `despachos`) |
| M2-M3-04 | `migrations/054_m3_devolucion_fisica.sql` + fix incremental `056_fix_devolucion_saldo_constraint.sql` (`fn_m3_devolver_asignacion_vivero`, `fn_subcampania_cancelar` v2 fisica), `POST /:id/asignaciones/:asignacionId/devolucion`; `DELETE` eliminado |
| M2-M3-05 | `migrations/055_vivero_merma_fisica.sql`, saldos/consultas/despacho manual con semantica fisica (`saldo_asignado_subcampanias`) |
| M2-M3-06 | Swagger actualizado, docs frontend (`modulos/lotes-vivero-m3.md`, `modulos/plantaciones.md`, `modulos/subcampanias.md`, `api-reference.md`), [guia de migracion frontend](../frontend/guia-migracion-asignacion-fisica.md), receta [postman/asignacion-fisica.md](../postman/asignacion-fisica.md) |
| M2-M3-07 | Unit specs actualizados (asignaciones, despacho, plantacion); e2e DB nuevos `test/e2e/db/asignacion_fisica.e2e-spec.ts` y `test/e2e/db/plantacion_fisica.e2e-spec.ts` (reemplazan `reserva_requiere_embolsado` y `merma_lifo`, que probaban el contrato viejo) |

**Pendiente fuera del repo:**

1. Aplicar las migraciones `051` a `056` en Supabase, **en orden y cada una como
   transaccion separada** (051 agrega valores de enum que 052+ usan; el SQL
   Editor de Supabase corre cada script en su propia transaccion, suficiente).
2. Correr `npm run test:e2e:db` contra el entorno con las migraciones aplicadas.
   Verificado localmente el 2026-07-07: `npm test -- --runInBand` pasa
   (`388/388`) y `tsc -p tsconfig.build.json --noEmit` pasa limpio.
3. Desplegar backend + frontend coordinados (breaking changes de API descritos
   en la guia de migracion).
4. Tras confirmar en produccion, propagar cierre a `r3foresta-docs`
   (`ESTADO.md` + contrato) segun el protocolo del proyecto.
