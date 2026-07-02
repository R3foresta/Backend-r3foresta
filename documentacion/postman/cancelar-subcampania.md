# Postman: Cancelar subcampaña (`POST /subcampanias/:id/cancelar`)

Endpoint que implementa `RN-PLA-37`: cancelación de subcampaña sin plantaciones.

## Contexto

- **Cuándo usarlo:** para descartar un `BORRADOR` que ya no se va a ejecutar, o para cancelar una subcampaña `ACTIVA` que **aún no plantó nada** (`total_plantado_inicial = 0`). Si ya hay plantaciones, usar cierre `FINALIZADA_PARCIAL` (`POST /subcampanias/:id/cerrar`).
- **Efectos atómicos (`fn_subcampania_cancelar`):**
  1. `estado = 'CANCELADA'`, `deleted_at = NOW()`, `deleted_by = actor` (inactivación, no borrado físico).
  2. Todas las asignaciones activas de vivero pasan a `DEVUELTA` (`cantidad_devuelta += saldo_asignado_disponible`) — el `saldo_vivo_disponible_asignacion` del lote se recupera. **No se genera evento en M2** (`RN-VIV-48`).
  3. Se registra `SUBCAMPANIA_CANCELADA` en `SUBCAMPANIA_HISTORIAL` con el motivo.
- **Post-condiciones:** la subcampaña deja de sumar a `meta_planificada_campania` (`RN-PLA-36`), no vuelve a la vista pública y no es reabrible (`RN-PLA-07`).

## Precondiciones

- El actor debe ser `ADMIN`.
- `estado ∈ {BORRADOR, ACTIVA}`.
- `total_plantado_inicial = 0`.

## Request

```
POST http://localhost:3000/api/subcampanias/5/cancelar
x-auth-id: <auth_id del ADMIN>
Content-Type: application/json
```

Body:

```json
{
  "motivo": "Se descarta la subcampaña por cambio de prioridad institucional."
}
```

## Respuesta 201 (éxito)

```json
{
  "success": true,
  "data": {
    "message": "Subcampaña cancelada correctamente.",
    "id": 5,
    "estado": "CANCELADA",
    "deleted_at": "2026-07-02T00:00:00Z",
    "deleted_by": 42,
    "motivo": "Se descarta la subcampaña por cambio de prioridad institucional."
  }
}
```

## Errores esperados

| Status | Ejemplo de mensaje | Cuándo |
|--------|--------------------|--------|
| 400 | `"motivo es obligatorio."` | Body sin `motivo` o con string vacío. |
| 401 | `"Header x-auth-id es requerido"` | Falta el header de autenticación. |
| 403 | `"Solo el rol ADMIN puede realizar esta operación."` | El actor no es `ADMIN`. |
| 404 | `"Subcampania 99 no encontrada."` | `id` no existe o ya está eliminada físicamente. |
| 409 | `"La subcampania ya tiene plantaciones registradas (total_plantado_inicial = 3). Usar cierre FINALIZADA_PARCIAL."` | Ya hay `PLANTACION_INICIAL` registrada — camino incorrecto. |
| 409 | `"Solo se puede cancelar una subcampania en BORRADOR o ACTIVA (estado actual: COMPLETADA)."` | Estado no permite cancelar (ya cerrada / cancelada). |
| 500 | `"La migración fn_subcampania_cancelar no está aplicada."` | La migración `047_m3_cancelacion_subcampania_y_plan.sql` no corrió en la BD. |

## Verificaciones QA

- Post-cancelación de una ACTIVA con asignaciones vivas:
  - `SELECT saldo_vivo_disponible_asignacion, saldo_vivo_actual FROM lote_vivero WHERE id = <lote>;` → el saldo disponible para asignar debe reflejar la devolución.
  - `SELECT estado, cantidad_devuelta, cantidad_asignada FROM asignacion_vivero_subcampania WHERE subcampania_id = <id>;` → todas las filas activas deben quedar en `DEVUELTA` con `cantidad_devuelta = cantidad_asignada`.
  - `SELECT * FROM subcampania_historial WHERE subcampania_id = <id> ORDER BY created_at DESC LIMIT 1;` → última fila `tipo_historial = SUBCAMPANIA_CANCELADA` con `metadata.asignaciones_liberadas > 0` y `metadata.motivo_devolucion = 'CIERRE_SUBCAMPANIA'`.
- Intentar `POST /lotes-vivero/:loteId/reservas` contra la subcampaña ya cancelada → **409** (ver guard en `RN-VIV-11`).
- `GET /campanias/:id` de la campaña padre: `meta_planificada_campania` debe reducirse en `meta_total_arboles` de la subcampaña recién cancelada.
