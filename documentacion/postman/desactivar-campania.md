# Postman: desactivar campaña con cancelación masiva

Flujo explícito de `M3-PM-01`. La unidad atómica es una campaña.

## 1. Previsualización

```http
GET http://localhost:3000/api/campanias/15/desactivacion/preview
x-auth-id: <auth_id del ADMIN>
```

Respuesta elegible:

```json
{
  "success": true,
  "data": {
    "campania_id": 15,
    "elegible": true,
    "subcampanias_vivas": 20,
    "subcampanias_a_cancelar": 20,
    "borradores": 18,
    "activas_sin_plantar": 2,
    "ya_canceladas": 0,
    "asignaciones_con_saldo": 3,
    "unidades_a_devolver": 450,
    "bloqueos": []
  }
}
```

La previsualización no modifica ni bloquea datos. Si una subcampaña tiene plantaciones o estado no elegible, responde `200` con `elegible = false` y el detalle en `bloqueos`.

## 2. Ejecución

```http
POST http://localhost:3000/api/campanias/15/desactivar
x-auth-id: <auth_id del ADMIN>
Content-Type: application/json
```

```json
{
  "motivo": "Limpieza de campañas creadas por pruebas automatizadas"
}
```

Respuesta `200`:

```json
{
  "success": true,
  "data": {
    "message": "Campaña desactivada correctamente.",
    "campania_id": 15,
    "deleted_at": "2026-07-23T18:00:00.000Z",
    "subcampanias_canceladas": 20,
    "asignaciones_devueltas": 3,
    "unidades_devueltas": 450
  }
}
```

## 3. Caso bloqueado

Una campaña con una subcampaña `COMPLETADA`, `FINALIZADA_PARCIAL`, `PAUSADA` o con `total_plantado_inicial > 0`:

- aparece como `elegible = false` en preview;
- responde `422` al ejecutar;
- no modifica campaña, subcampañas, asignaciones ni lotes.

## Verificaciones

1. Todas las subcampañas procesadas quedan `CANCELADA` con `deleted_at`/`deleted_by`.
2. La campaña queda soft-deleted, no eliminada físicamente.
3. Cada historial `SUBCAMPANIA_CANCELADA` contiene `metadata.origen = DESACTIVACION_CAMPANIA` y `metadata.campania_id`.
4. Las asignaciones con saldo quedan devueltas y el lote recupera físicamente las unidades.
5. Existen eventos `DEVOLUCION_PLANTACION` (M2) y `DEVOLUCION_A_VIVERO` (M3).
6. Repetir el POST sobre la campaña ya desactivada responde `404`.

## Errores

| Status | Cuándo |
|--------|--------|
| 400 | Motivo ausente, vacío o fuera de 3–1000 caracteres. |
| 401 | Falta `x-auth-id`. |
| 403 | Actor distinto de ADMIN. |
| 404 | Campaña inexistente o ya desactivada. |
| 409 | Conflicto concurrente o fallo de devolución; rollback completo. |
| 422 | Hay al menos una subcampaña no elegible. |
| 500 | La migración `057` no está aplicada o backend no tiene `SUPABASE_SERVICE_ROLE_KEY`. |
