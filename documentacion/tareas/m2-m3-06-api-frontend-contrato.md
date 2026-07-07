# M2-M3-06 - Contrato API y frontend para asignacion fisica

## Objetivo

Actualizar la documentacion de API, Swagger y contratos consumidos por frontend para reflejar el nuevo modelo fisico.

## Estado actual observado

- Swagger de plantacion dice que registrar plantacion genera `DESPACHO automatico`.
- Swagger de vivero dice que asignacion "reserva" saldo.
- `GET /lotes-vivero/:id/saldos` documenta `saldo_asignado_total` como reservas activas.
- Existe endpoint alias `POST /lotes-vivero/:id/reservas`.
- El frontend probablemente consume campos basados en reserva logica.

## Alcance

- Actualizar Swagger:
  - `ApiCrearAsignacion`
  - `ApiCancelarAsignacion`
  - `ApiObtenerSaldos`
  - `ApiRegistrarPlantacion`
  - `ApiRegistrarDespacho`
  - `ApiRegistrarMerma`
- Actualizar documentacion frontend local:
  - `documentacion/frontend/modulos/lotes-vivero-m3.md`
  - `documentacion/frontend/modulos/plantaciones.md`
  - otros archivos que hablen de reservas/despacho automatico.
- Definir request/response finales:
  - asignacion fisica con `evidencia_ids`
  - plantacion sin `despachos`
  - devolucion fisica sin fotos obligatorias
  - saldos separados
- Decidir compatibilidad:
  - mantener `POST :id/reservas` como alias legado temporal o removerlo.
  - mantener campos antiguos en response como aliases temporales o removerlos.
- Crear una guia de migracion para frontend:
  - cambios de endpoints
  - cambios de campos
  - mensajes de UI que deben cambiar de "reservar" a "asignar/entregar".

## Fuera de alcance

- Implementar frontend.
- Cambiar logica DB.

## Archivos probables

- `src/lotes-vivero/api/docs/lotes-vivero.swagger.ts`
- `src/plantaciones/api/docs/plantaciones.swagger.ts`
- `documentacion/frontend/modulos/lotes-vivero-m3.md`
- `documentacion/frontend/modulos/plantaciones.md`
- `documentacion/frontend/api-reference.md`

## Criterios de aceptacion

- Ningun texto Swagger presenta `AUTOMATICO_PLANTACION` como flujo vigente.
- Ningun texto Swagger presenta asignacion como reserva logica.
- La documentacion indica que asignar descuenta saldo fisico del lote.
- La documentacion indica que plantar/reponer no genera `EVENTO_LOTE_VIVERO`.
- La documentacion indica que devolucion no requiere fotos en MVP.
- El frontend tiene contrato claro para saldos:
  - saldo fisico en vivero
  - saldo asignado disponible de subcampania

## Pruebas esperadas

- Unit/snapshot de Swagger si aplica.
- Revision manual de `rg "reserva|AUTOMATICO_PLANTACION|despacho automatico"` para confirmar que solo quedan menciones legadas o historicas.

## Riesgos

- Si se actualiza Swagger antes de implementar backend, el frontend puede integrarse contra una API que aun no existe. Marcar cada seccion como "requiere M2-M3-02/03/04/05" hasta que este cerrada.

