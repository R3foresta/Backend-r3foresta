# Postman: Asignación física y devolución (`/lotes-vivero/:id/asignaciones`)

Flujo del contrato físico M2 ↔ M3 (RF-VIV-11 / RF-VIV-12, RN-VIV-47/48/54).
Asignar = **entregar plantas** a una subcampaña (descuenta saldo del lote);
devolver = **retorno físico** (aumenta saldo del lote).

## 1. Subir evidencia de la entrega (obligatoria, RN-VIV-54)

```
POST {{base_url}}/lotes-vivero/evidencias-pendientes
x-auth-id: {{auth_id}}
Content-Type: multipart/form-data
```

Form-data: `fotos` (1..n archivos JPG/PNG), `titulo`, `descripcion` opcionales.
Guardar los `evidencia_ids` de la respuesta.

## 2. Asignar (entregar) stock a la subcampaña

```
POST {{base_url}}/lotes-vivero/31/asignaciones
x-auth-id: {{auth_id}}   ← ADMIN o COORDINADOR de la subcampaña
Content-Type: application/json
```

```json
{
  "subcampania_id": 33,
  "cantidad_asignada": 100,
  "proposito": "PLANTACION_INICIAL",
  "fecha_asignacion": "2026-07-06",
  "evidencia_ids": [501],
  "observaciones": "Entrega para sector A"
}
```

### Respuesta 201

```json
{
  "success": true,
  "data": {
    "asignacion_id": 123,
    "evento_lote_vivero_id": 456,
    "evento_plantacion_id": 789,
    "lote_vivero_id": 31,
    "codigo_trazabilidad_lote": "VIV-000031-REC-2026-057",
    "subcampania_id": 33,
    "subcampania_nombre": "Subcampaña Zona A",
    "campania_id": 7,
    "proposito": "PLANTACION_INICIAL",
    "estado": "ACTIVA",
    "cantidad_asignada": 100,
    "saldo_vivo_antes": 500,
    "saldo_vivo_despues": 400,
    "evidencia_ids_vinculadas": [501],
    "lote_finalizado": false,
    "motivo_cierre": null
  }
}
```

### Errores frecuentes

| Status | Mensaje (fragmento) | Causa |
|--------|---------------------|-------|
| 422 | `requiere al menos una evidencia de entrega/salida (RN-VIV-54)` | `evidencia_ids` vacío |
| 422 | `excede el saldo vivo fisico del lote` | `cantidad_asignada > saldo_vivo_actual` |
| 422 | `no tiene EMBOLSADO registrado` | Lote sin EMBOLSADO (RN-VIV-61) |
| 422 | `Solo ADMIN o el COORDINADOR de la subcampania...` | Actor sin permiso |
| 409 | `subcampaña en estado BORRADOR/CANCELADA` | Guard RN-VIV-11 |
| 500 | `fn_vivero_asignar_stock_subcampania no está aplicada` | Falta migración 052 |

## 3. Devolver stock no consumido (sin fotos en MVP)

```
POST {{base_url}}/lotes-vivero/31/asignaciones/123/devolucion
x-auth-id: {{auth_id}}   ← ADMIN o COORDINADOR
Content-Type: application/json
```

```json
{
  "cantidad_devuelta": 40,
  "motivo_devolucion": "SOBRANTE_OPERATIVO",
  "fecha_devolucion": "2026-07-07",
  "observaciones": "Sobró tras la plantación inicial"
}
```

### Respuesta 201

```json
{
  "success": true,
  "data": {
    "asignacion_id": 123,
    "estado": "ACTIVA",
    "cantidad_devuelta": 40,
    "cantidad_devuelta_total": 40,
    "saldo_asignado_disponible": 0,
    "lote_vivero_id": 31,
    "saldo_vivo_antes": 400,
    "saldo_vivo_despues": 440,
    "lote_reabierto": false,
    "evento_lote_vivero_id": 460,
    "evento_plantacion_id": 795
  }
}
```

Devolución **total** de una asignación sin consumo → `estado: "DEVUELTA"`.

## Verificaciones QA

- `SELECT saldo_vivo_actual FROM lote_vivero WHERE id = 31;` → baja al asignar, sube al devolver.
- `SELECT * FROM evento_lote_vivero WHERE asignacion_id = 123;` → un `DESPACHO` (`origen_despacho = ASIGNACION_SUBCAMPANIA`, `destino_tipo = PLANTACION_CAMPANIA`, `registro_plantacion_id IS NULL`) y un `DEVOLUCION_PLANTACION`, ambos con `saldo_vivo_antes/despues`.
- `SELECT * FROM evento_plantacion WHERE asignacion_id = 123;` → `ASIGNACION_VIVERO` y `DEVOLUCION_A_VIVERO`.
- Registrar una plantación que consuma la asignación y verificar que **no** aparece ningún evento M2 nuevo (`RN-VIV-52`) y que `saldo_vivo_actual` del lote no cambia.
