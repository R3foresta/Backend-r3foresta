# Módulo: Campañas

Base URL: `/api/campanias`

---

## POST /campanias

**Rol mínimo**: ADMIN
**Descripción**: Crea una campaña. El código de trazabilidad (`CMP-YYYY-NNN`) se genera automáticamente.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| nombre | string | ✓ | min 3, max 200, unique |
| tipo | TipoCampania enum | ✓ | REFORESTACION, ARBORIZACION, FORESTACION |
| descripcion | string | — | max 1000 caracteres |
| fecha_estimada_inicio | string (ISO date) | — | formato YYYY-MM-DD |
| fecha_estimada_fin | string (ISO date) | — | formato YYYY-MM-DD, >= fecha_estimada_inicio |
| organizacion_ids | number[] | — | Array de IDs de organizaciones existentes |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Campaña Norte 2026",
    "tipo": "REFORESTACION",
    "codigo_trazabilidad": "CMP-2026-001",
    "descripcion": "Reforestación de la zona norte del país",
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-12-31",
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida: fechas incoherentes, tipo inválido |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 409 | Ya existe una campaña con ese nombre |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/campanias \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "nombre": "Campaña Norte 2026",
    "tipo": "REFORESTACION",
    "descripcion": "Reforestación de la zona norte",
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-12-31",
    "organizacion_ids": [1, 2]
  }'
```

---

## GET /campanias

**Rol mínimo**: GENERAL
**Descripción**: Lista todas las campañas.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nombre": "Campaña Norte 2026",
      "tipo": "REFORESTACION",
      "codigo_trazabilidad": "CMP-2026-001",
      "descripcion": "Reforestación zona norte",
      "fecha_estimada_inicio": "2026-06-01",
      "fecha_estimada_fin": "2026-12-31",
      "estado_derivado": "BORRADOR",
      "count_subcampanias": 3,
      "meta_planificada_campania": 1500,
      "organizaciones": [],
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

Nota sobre `meta_planificada_campania` (RN-PLA-36):

- Derivado en tiempo real, nunca persistido en `CAMPANIA`.
- Suma `meta_total_arboles` de las subcampañas cuyo `estado <> CANCELADA` — incluye `BORRADOR`, `ACTIVA`, `COMPLETADA`, `FINALIZADA_PARCIAL`.
- Consumo interno (admin/coordinador). La vista pública debe agregar aparte solo `ACTIVA | COMPLETADA | FINALIZADA_PARCIAL`.

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/campanias \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /campanias/resumen

**Autenticación**: header `x-auth-id`

**Descripción**: Resumen global para las tarjetas del dashboard. Considera campañas vigentes y sus subcampañas no eliminadas.

**Headers**
| Header | Requerido |
|--------|-----------|
| x-auth-id | ✓ |

**Respuesta exitosa** `200`

```json
{
  "success": true,
  "data": {
    "arboles_plantados_total": 12500,
    "avance_meta_pct": 80,
    "supervivencia_pct": 88,
    "hectareas_total": 42.75,
    "campanias_activas": 3,
    "campanias_totales": 5,
    "subcampanias_activas": 8,
    "subcampanias_totales": 12
  }
}
```

**Reglas de cálculo**

| Campo | Regla |
|-------|-------|
| `arboles_plantados_total` | Suma de `total_plantado_inicial`; no incluye reposiciones. |
| `avance_meta_pct` | Plantación inicial / meta total × 100. No cuenta reposiciones y se acota a 0–100. |
| `supervivencia_pct` | Árboles vivos / (plantación inicial + reposiciones) × 100, acotado a 0–100. |
| `hectareas_total` | Suma de `area_hectareas`; `null` cuenta como 0. |
| `campanias_activas` | Campañas cuyo estado derivado es `ACTIVA`. |
| `subcampanias_activas` | Subcampañas cuyo estado es `ACTIVA`. |
| Totales | Excluyen registros con soft-delete. |

```bash
curl http://localhost:3000/api/campanias/resumen \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /campanias/:id

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene detalle completo de una campaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la campaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Campaña Norte 2026",
    "tipo": "REFORESTACION",
    "codigo_trazabilidad": "CMP-2026-001",
    "descripcion": "Reforestación zona norte",
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-12-31",
    "estado_derivado": "BORRADOR",
    "count_subcampanias": 3,
    "meta_planificada_campania": 1500,
    "organizaciones": [
      { "id": 4, "nombre": "ONG Verde", "tipo": "ONG", "activo": true, "logo_url": null }
    ],
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

`meta_planificada_campania` sigue la misma regla que en `GET /campanias`: `SUM(subcampania.meta_total_arboles)` con `estado <> CANCELADA` (incluye `BORRADOR`).

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Campaña no encontrada |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/campanias/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /campanias/:id/subcampanias

**Rol mínimo**: GENERAL
**Descripción**: Lista las subcampañas de una campaña con **payload enriquecido para dashboard** (2026-07-04). Es equivalente a `GET /subcampanias?campania_id=:id`, pero valida primero que la campaña exista.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la campaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "campania_id": 1,
      "nombre": "Subcampaña Zona A",
      "descripcion": "Plantación en zona A",
      "tipo": "REFORESTACION",
      "estado": "ACTIVA",
      "fase_mantenimiento": "NO_APLICA",
      "zona_id": 10,
      "zona_nombre": "Comunidad Sur",
      "area_hectareas": 2.5,
      "meta_total_arboles": 500,
      "codigo_trazabilidad": "SUB-001-CMP-2026-001",
      "total_plantado_inicial": 120,
      "total_repuesto": 0,
      "total_muerto_acumulado": 0,
      "saldo_vivo_actual": 120,
      "plantados": 120,
      "avance_pct": 24,
      "has_plan_especies": true,
      "personas_count": 3,
      "lotes_count": 2,
      "eventos_count": 5,
      "equipo": [
        {
          "usuario_id": 7,
          "nombre_usuario": "Coord Pepe",
          "rol": "COORDINADOR",
          "foto_perfil_url": null
        },
        {
          "usuario_id": 12,
          "nombre_usuario": "Op Ana",
          "rol": "OPERARIO",
          "foto_perfil_url": null
        }
      ],
      "coordinador": { "id": 7, "nombre": "Coord Pepe" },
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

**Campos agregados (2026-07-04, para dashboard)**

| Campo | Tipo | Semántica |
|-------|------|-----------|
| `zona_nombre` | string \| null | Nombre de la zona; prefiere `nombre_zona_snapshot` si la subcampaña ya se activó, si no se resuelve desde `division_administrativa`. |
| `plantados` | number | Alias de `total_plantado_inicial`. |
| `avance_pct` | number \| null | `plantados / meta_total_arboles × 100`, acotado a `[0, 100]`; `null` si la meta es 0. |
| `has_plan_especies` | boolean | `true` si existen filas en `SUBCAMPANIA_META_ESPECIE` para la subcampaña. |
| `personas_count` | number | Cantidad de miembros en `SUBCAMPANIA_EQUIPO` (COORDINADOR + OPERARIO). |
| `lotes_count` | number | **Lotes distintos** (`lote_vivero_id` únicos) actualmente entregados en asignaciones físicas con `estado = 'ACTIVA'`. |
| `eventos_count` | number | Suma de eventos operativos (`registro_plantacion` + `evento_plantacion`) de la subcampaña. |
| `equipo` | `EquipoMember[]` | Siempre array, aunque esté vacío. Se recomienda usar esto en el dashboard en lugar de `coordinador`. |

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Campaña no encontrada |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/campanias/1/subcampanias \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /campanias/:id/metrics

**Rol mínimo**: GENERAL
**Descripción**: Métricas agregadas de una campaña para el dashboard (agregado 2026-07-04). Reutiliza `/activity` para `ultima_actividad` filtrada a subcampañas vivas, mientras que el resto de los agregados excluyen soft-deleted (RN-PLA-36 / RN-PLA-38).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| id | number | ID de la campaña |

**Respuesta exitosa** `200`

```json
{
  "success": true,
  "data": {
    "supervivencia_pct": 82.5,
    "co2_proyectado_ton": 3.3,
    "hectareas": 4.75,
    "comunidades_count": 2,
    "eventos_count": 12,
    "ultima_actividad": {
      "autor": "Ana Pérez",
      "detalle": "12 árboles",
      "timestamp": "2026-07-03T15:20:00Z"
    }
  }
}
```

**Cálculos**

| Campo | Fórmula |
|-------|---------|
| `supervivencia_pct` | `SUM(saldo_vivo_actual) / SUM(total_plantado_inicial + total_repuesto) × 100` sobre subcampañas vivas (soft-deleted excluidas). `0` si el denominador es 0. |
| `co2_proyectado_ton` | **Placeholder MVP**: `SUM(saldo_vivo_actual) × 0.022` (~22 kg CO₂/árbol/año). Fórmula final pendiente de producto — no depender del valor exacto. |
| `hectareas` | `SUM(subcampania.area_hectareas)` sobre subcampañas vivas, tratando `null` como 0. |
| `comunidades_count` | Cantidad de `zona_id` distintos en las subcampañas vivas. |
| `eventos_count` | `COUNT(registro_plantacion) + COUNT(evento_plantacion)` para las subcampañas vivas. |
| `ultima_actividad` | Primer item de `GET /campanias/:id/activity?limit=1` con `soloSubcampaniasVivas`. `null` si no hay actividad. |

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Campaña no encontrada |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/campanias/1/metrics \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /campanias/:id/activity

**Rol mínimo**: GENERAL
**Descripción**: Actividad reciente de una campaña (agregado 2026-07-04). Fuentes: `registro_plantacion` (para `plantacion`) y `subcampania_historial` (para `nueva_subcampana`, `activacion`, `cancelacion`, `cambio_coordinador`). Incluye por diseño subcampañas soft-deleted para no ocultar cancelaciones (la RPC de cancelación marca `deleted_at` en la misma transacción que inserta el historial).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| id | number | ID de la campaña |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| limit | number | — | Cantidad máxima (default `5`, rango `1..50`). |

**Respuesta exitosa** `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "registro-42",
      "tipo": "plantacion",
      "autor": "Ana Pérez",
      "detalle": "12 árboles",
      "ubicacion": "Subcampaña Zona A · Comunidad Sur",
      "timestamp": "2026-07-03T15:20:00Z"
    },
    {
      "id": "historial-91",
      "tipo": "activacion",
      "autor": "Coord Pepe",
      "detalle": "",
      "ubicacion": "Subcampaña Zona A · Comunidad Sur",
      "timestamp": "2026-07-01T10:15:00Z"
    }
  ]
}
```

**Tipos de evento**

| `tipo` | Fuente | Detalle típico |
|--------|--------|----------------|
| `plantacion` | `registro_plantacion` | `"N árboles"` |
| `nueva_subcampana` | `subcampania_historial.BORRADOR_CREADO` | `observaciones` o `""` |
| `activacion` | `subcampania_historial.SUBCAMPANIA_ACTIVADA` | `observaciones` o `""` |
| `cancelacion` | `subcampania_historial.SUBCAMPANIA_CANCELADA` | `observaciones` (motivo) |
| `cambio_coordinador` | `subcampania_historial.COORDINADOR_CAMBIADO` | `observaciones` o `""` |

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | `limit` fuera de rango. |
| 401 | Header x-auth-id ausente |
| 404 | Campaña no encontrada |

**Ejemplo cURL**
```bash
curl -X GET "http://localhost:3000/api/campanias/1/activity?limit=10" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## PATCH /campanias/:id

**Rol mínimo**: ADMIN
**Descripción**: Edita datos generales de una campaña (**RN-PLA-38**, 2026-07-04). Permite corregir `nombre`, `descripcion` y fechas sin cascada. El cambio de `tipo` está bloqueado en cuanto exista **cualquier** subcampaña asociada (incluidas `CANCELADA` e historicas soft-deleted). Las organizaciones se gestionan con endpoints separados (ver más abajo).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la campaña |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación / Regla |
|-------|------|-----------|--------------------|
| nombre | string | — | min 3, max 200, unique. Editable siempre. |
| descripcion | string | — | max 1000 caracteres. Editable siempre. |
| fecha_estimada_inicio | string | — | ISO date. Editable siempre. |
| fecha_estimada_fin | string | — | ISO date, `>= fecha_estimada_inicio`. Editable siempre. |
| tipo | TipoCampania | — | Solo editable si **no existe ninguna subcampaña asociada** (RN-PLA-38). |

`codigo_trazabilidad` no se edita nunca.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Campaña Norte 2026 - Actualizada",
    "tipo": "REFORESTACION",
    "codigo_trazabilidad": "CMP-2026-001",
    "descripcion": "Reforestación zona norte - Nueva descripción",
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-12-31",
    "updated_at": "2026-05-28T11:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida (fechas incoherentes, `tipo` inválido). |
| 401 | Header x-auth-id ausente. |
| 403 | Rol distinto de ADMIN. |
| 404 | Campaña no encontrada. |
| 422 | Cambio de `tipo` con subcampañas asociadas, o nombre duplicado. |

**Ejemplo cURL**
```bash
curl -X PATCH http://localhost:3000/api/campanias/1 \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "descripcion": "Nueva descripción",
    "fecha_estimada_fin": "2027-01-31"
  }'
```

---

## DELETE /campanias/:id

**Rol mínimo**: ADMIN
**Descripción**: **Soft-delete** (inactivación lógica) de una campaña (**RN-PLA-38**, 2026-07-04). Marca `deleted_at`/`deleted_by`. Permitido cuando:

- la campaña **no tiene subcampañas asociadas**, o
- todas las subcampañas asociadas están en estado `CANCELADA`.

Si existe al menos una subcampaña en `BORRADOR`, `ACTIVA`, `COMPLETADA`, `FINALIZADA_PARCIAL` o `PAUSADA` → **422** con mensaje: `"No se puede desactivar una campaña con subcampañas no canceladas."`

> El `DELETE` físico (hard delete) sólo es posible internamente si no hay ninguna subcampaña asociada (defensa reforzada por trigger `trg_campania_delete_estricto_mvp` de la migración 050). El endpoint `DELETE` HTTP realiza siempre soft-delete.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la campaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Campaña eliminada correctamente.",
    "id": 1
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente. |
| 403 | Rol distinto de ADMIN. |
| 404 | Campaña no encontrada. |
| 422 | Existen subcampañas no canceladas asociadas. |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/campanias/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /campanias/:id/desactivacion/preview

**Rol mínimo**: ADMIN
**Descripción**: Previsualiza la elegibilidad y los efectos de desactivar una campaña cancelando automáticamente sus subcampañas sin plantaciones. Es una lectura informativa y no modifica datos.

Una campaña es elegible si todas sus subcampañas vivas están en uno de estos casos:

- `BORRADOR` o `ACTIVA` con `total_plantado_inicial = 0`;
- `CANCELADA`, que ya satisface la postcondición.

Una campaña sin subcampañas vivas también es elegible.

**Respuesta exitosa** `200`

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

Si no es elegible, el status sigue siendo `200` y `bloqueos` identifica cada causa:

```json
{
  "subcampania_id": 27,
  "estado": "COMPLETADA",
  "total_plantado_inicial": 80,
  "codigo": "SUBCAMPANIA_CON_PLANTACIONES",
  "mensaje": "La subcampaña tiene plantaciones iniciales y no puede cancelarse."
}
```

Los códigos posibles son `SUBCAMPANIA_CON_PLANTACIONES` y `ESTADO_NO_ELEGIBLE`.

**Errores**

| Status | Cuándo |
|--------|--------|
| 401 | Header `x-auth-id` ausente. |
| 403 | Rol distinto de ADMIN. |
| 404 | Campaña inexistente o ya desactivada. |

---

## POST /campanias/:id/desactivar

**Rol mínimo**: ADMIN
**Descripción**: Cancela todas las subcampañas elegibles y desactiva la campaña en una única transacción. La ejecución repite la validación bajo locks; el preview no reserva ni garantiza elegibilidad futura.

Por cada `BORRADOR` o `ACTIVA` sin plantaciones:

- aplica la cancelación canónica de `RN-PLA-37`;
- conserva la fila con `estado = CANCELADA` y soft-delete;
- devuelve físicamente el saldo asignado disponible al vivero (`RN-VIV-48`);
- registra `DEVOLUCION_PLANTACION`, `DEVOLUCION_A_VIVERO` y `SUBCAMPANIA_CANCELADA`;
- agrega al historial `origen = DESACTIVACION_CAMPANIA` y `campania_id`.

Al final aplica soft-delete a la campaña. Si falla una validación o devolución, se revierte toda la campaña.

**Body**

```json
{
  "motivo": "Limpieza de campañas creadas por pruebas automatizadas"
}
```

`motivo` es obligatorio, se normaliza con `trim` y debe tener entre 3 y 1000 caracteres.

**Respuesta exitosa** `200`

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

**Errores**

| Status | Cuándo |
|--------|--------|
| 400 | Motivo ausente, vacío o fuera de rango. |
| 401 | Header `x-auth-id` ausente. |
| 403 | Rol distinto de ADMIN. |
| 404 | Campaña inexistente o ya desactivada. |
| 409 | Conflicto concurrente o fallo durante cancelación/devolución; rollback completo. |
| 422 | Alguna subcampaña tiene plantaciones o estado no elegible. |

> `DELETE /campanias/:id` conserva su contrato estricto: no cancela subcampañas implícitamente. La acción masiva solo existe en este endpoint explícito.

---

## POST /campanias/:id/organizaciones

**Rol mínimo**: ADMIN  
**Descripción**: Asocia una o más organizaciones a una campaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la campaña |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| organizacion_ids | number[] | ✓ | Array no vacío de IDs |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Organizaciones asociadas correctamente.",
    "campaniaId": 1,
    "organizacionesAsociadas": [1, 2]
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Array vacío o IDs inválidos |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Campaña o una de las organizaciones no encontrada |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/campanias/1/organizaciones \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "organizacion_ids": [1, 2, 3]
  }'
```

---

## DELETE /campanias/:id/organizaciones/:orgId

**Rol mínimo**: ADMIN  
**Descripción**: Desasocia una organización de una campaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la campaña |
| orgId | number | ID de la organización |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Organización desasociada correctamente."
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Campaña u organización no encontrada, o no estaban asociadas |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/campanias/1/organizaciones/2 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## Tipos & Estructuras

### TipoCampania
```
REFORESTACION | ARBORIZACION | FORESTACION
```

### Campaña
```typescript
{
  id: number;
  nombre: string;
  tipo: TipoCampania;
  codigo_trazabilidad: string; // CMP-YYYY-NNN (generado automáticamente)
  descripcion?: string;
  fecha_estimada_inicio?: string; // ISO 8601
  fecha_estimada_fin?: string; // ISO 8601
  created_at: string;
  updated_at: string;
}
```

---

## Reglas de Negocio

1. **Nombre único**: Case-insensitive, constraint en BD.
2. **Código automático**: Generado como `CMP-YYYY-NNN` (ej. CMP-2026-001).
3. **Fechas coherentes**: `fecha_fin >= fecha_inicio` si ambas se envían.
4. **ADMIN only**: Creación, edición, borrado y asociaciones requieren rol ADMIN.
5. **RN-PLA-38 — Edición y desactivación**:
   - `nombre`, `descripcion` y fechas se editan sin cascada.
   - `tipo` sólo se puede cambiar si no existe **ninguna** subcampaña asociada (incluye soft-deleted).
   - `codigo_trazabilidad` no se edita.
   - Soft-delete (`DELETE /campanias/:id`) permitido si no hay subcampañas o si todas están `CANCELADA`.
   - `POST /campanias/:id/desactivar` permite la variante explícita y atómica que cancela `BORRADOR`/`ACTIVA` sin plantaciones y luego desactiva la campaña.
   - `DELETE /campanias/:id` no adquiere efectos en cascada.
6. **Organizaciones editables**: se asocian/desasocian en cualquier estado con endpoints dedicados; los `nombres_organizaciones_snapshot` de subcampañas ya activas no se reescriben.
7. **`meta_planificada_campania` derivado** (`RN-PLA-36`): suma de `meta_total_arboles` de subcampañas cuyo `estado <> CANCELADA`.

---

## Flujo Típico

1. **POST** → Crea campaña
2. **POST /organizaciones** → Asocia organizaciones (opcional en cualquier momento)
3. **GET** → Lista para selectores
4. **GET /:id/subcampanias** → Payload enriquecido para dashboard/list
5. **GET /:id/metrics** → Métricas agregadas para dashboard
6. **GET /:id/activity** → Feed de actividad reciente
7. **PATCH** → Corrige nombre/descripción/fechas (o `tipo` si aún no hay subcampañas)
8. **DELETE /organizaciones/:orgId** → Desasocia una org
9. **GET /desactivacion/preview** → Revisa elegibilidad y efectos de la acción masiva
10. **POST /desactivar** → Cancela subcampañas elegibles y aplica soft-delete atómico
11. **DELETE** → Soft-delete estricto de la campaña ya vacía/cancelada
