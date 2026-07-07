# M2-M3-02 - Backend asignacion fisica de vivero a subcampania

## Objetivo

Reemplazar el flujo de reserva logica por una asignacion fisica atomica desde un lote de vivero hacia una subcampania.

## Estado actual observado

- `POST /lotes-vivero/:id/asignaciones` y `POST /lotes-vivero/:id/reservas` llaman a `fn_vivero_reservar_stock_lote`.
- La RPC valida contra `saldo_vivo_actual - saldo_reservado`.
- La RPC no descuenta `LOTE_VIVERO.saldo_vivo_actual`.
- La RPC no crea `EVENTO_LOTE_VIVERO`.
- El DTO no recibe evidencia de salida/entrega.

## Alcance

- Crear una RPC transaccional nueva o reemplazar la existente:
  - nombre sugerido: `fn_vivero_asignar_stock_subcampania`.
- Validar:
  - `cantidad_asignada > 0`
  - lote `ACTIVO`
  - lote con evento `EMBOLSADO`
  - `saldo_vivo_actual > 0`
  - `cantidad_asignada <= lote_vivero.saldo_vivo_actual`
  - subcampania existente y no eliminada
  - proposito permitido por estado
  - usuario con permiso: `ADMIN` o `COORDINADOR` de la subcampania
  - evidencia obligatoria de entrega/salida
- Efectos atomicos:
  - insertar `ASIGNACION_VIVERO_SUBCAMPANIA`
  - insertar `EVENTO_LOTE_VIVERO` tipo `DESPACHO` con `origen_despacho = ASIGNACION_SUBCAMPANIA`
  - descontar `LOTE_VIVERO.saldo_vivo_actual`
  - vincular evidencias al evento M2
  - insertar `EVENTO_PLANTACION` tipo `ASIGNACION_VIVERO`
- Actualizar endpoint, DTO, servicio y Swagger.
- Deprecar o eliminar alias `:id/reservas` si producto acepta el cambio de contrato. Si se mantiene por compatibilidad, debe comportarse como asignacion fisica.

## Fuera de alcance

- Reescribir consumo en `fn_m3_registrar_plantacion`.
- Implementar devolucion fisica.
- Implementar UI.

## Archivos probables

- `src/lotes-vivero/api/dto/crear-asignacion.dto.ts`
- `src/lotes-vivero/application/vivero-asignaciones.service.ts`
- `src/lotes-vivero/api/lotes-vivero.controller.ts`
- `src/lotes-vivero/api/docs/lotes-vivero.swagger.ts`
- nueva migracion para RPC fisica
- `src/lotes-vivero/tests/vivero-asignaciones.service.spec.ts`
- `test/e2e/db/*`

## Contrato API esperado

Request minimo:

```json
{
  "subcampania_id": 33,
  "cantidad_asignada": 100,
  "proposito": "PLANTACION_INICIAL",
  "fecha_asignacion": "2026-07-06",
  "evidencia_ids": [501]
}
```

Response minimo:

```json
{
  "success": true,
  "data": {
    "asignacion_id": 123,
    "evento_lote_vivero_id": 456,
    "evento_plantacion_id": 789,
    "lote_vivero_id": 31,
    "subcampania_id": 33,
    "cantidad_asignada": 100,
    "saldo_vivo_antes": 500,
    "saldo_vivo_despues": 400,
    "evidencia_ids_vinculadas": [501]
  }
}
```

## Criterios de aceptacion

- Crear una asignacion descuenta inmediatamente `LOTE_VIVERO.saldo_vivo_actual`.
- La asignacion crea un evento M2 con `ASIGNACION_SUBCAMPANIA`.
- La asignacion exige evidencia propia.
- La validacion de cantidad no resta asignaciones activas previas.
- No queda ningun mensaje de API que hable de "reserva" como comportamiento vigente.
- `POST /lotes-vivero/:id/reservas`, si sigue existiendo, queda documentado como alias legado de asignacion fisica.

## Pruebas esperadas

- Unit test de servicio para payload y errores de RPC.
- E2E DB de asignacion exitosa con descuento de saldo.
- E2E DB de evidencia obligatoria.
- E2E DB de concurrencia: dos asignaciones simultaneas no pueden dejar saldo negativo.
- E2E DB de rechazo por lote sin `EMBOLSADO`.

## Riesgos

- El frontend actual puede seguir mandando solo `subcampania_id` y `cantidad_asignada`; coordinar `M2-M3-06`.
- Si el endpoint cambia response shape, actualizar consumidores antes de cortar compatibilidad.

