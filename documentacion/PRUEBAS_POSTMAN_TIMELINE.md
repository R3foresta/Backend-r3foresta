# Pruebas Postman — Timeline / Historial del Lote de Vivero

> Endpoint único: `GET /api/lotes-vivero/:id/timeline`  
> Base URL local: `http://localhost:3000/api`  
> **No requiere autenticación** — no enviar `x-auth-id`

---

## ¿Qué devuelve este endpoint?

Devuelve el historial cronológico completo de eventos de un lote de vivero, ordenados por `fecha_evento` ascendente (del más antiguo al más reciente). Cada evento incluye:

- Tipo de evento (`INICIO`, `EMBOLSADO`, `ADAPTABILIDAD`, `MERMA`, `DESPACHO`, `CIERRE_AUTOMATICO`)
- Fecha del evento y fecha de creación del registro
- Nombre completo del responsable
- Un **payload específico** según el tipo de evento (saldos, causas, subetapas, etc.)
- Las **evidencias** (fotos) vinculadas al evento con su URL pública

---

## Configuración base en Postman

| Campo | Valor |
|---|---|
| Método | `GET` |
| URL | `http://localhost:3000/api/lotes-vivero/{{lote_id}}/timeline` |
| Headers | _(ninguno requerido)_ |
| Body | _(ninguno)_ |
| Auth | _(ninguna)_ |

**Variables de entorno sugeridas:**

| Variable | Valor de ejemplo |
|---|---|
| `base_url` | `http://localhost:3000/api` |
| `lote_id` | `1` |

---

## Caso 1 — Historial completo sin filtros

Devuelve todos los eventos del lote en orden cronológico.

**URL:**
```
GET http://localhost:3000/api/lotes-vivero/1/timeline
```

**Tab Params:** _(vacío)_

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "data": {
    "lote_id": 1,
    "codigo_trazabilidad": "LV-2026-0001",
    "estado_lote": "ACTIVO",
    "total_eventos": 5,
    "eventos": [
      {
        "id": 10,
        "lote_vivero_id": 1,
        "tipo_evento": "INICIO",
        "fecha_evento": "2026-04-20",
        "created_at": "2026-04-20T09:00:00Z",
        "responsable_id": 5,
        "responsable_nombre": "Juan Banana",
        "observaciones": null,
        "payload": {
          "tipo": "INICIO",
          "cantidad_inicial": 100,
          "unidad_medida": "G"
        },
        "evidencias": []
      },
      {
        "id": 11,
        "lote_vivero_id": 1,
        "tipo_evento": "EMBOLSADO",
        "fecha_evento": "2026-04-25",
        "created_at": "2026-04-25T11:00:00Z",
        "responsable_id": 5,
        "responsable_nombre": "Juan Banana",
        "observaciones": null,
        "payload": {
          "tipo": "EMBOLSADO",
          "plantas_vivas_iniciales": 35
        },
        "evidencias": []
      },
      {
        "id": 12,
        "lote_vivero_id": 1,
        "tipo_evento": "MERMA",
        "fecha_evento": "2026-05-02",
        "created_at": "2026-05-02T14:00:00Z",
        "responsable_id": 5,
        "responsable_nombre": "Juan Banana",
        "observaciones": "Ataque de hongos en bandeja 3",
        "payload": {
          "tipo": "MERMA",
          "cantidad_afectada": 5,
          "causa_merma": "ENFERMEDAD",
          "saldo_vivo_antes": 35,
          "saldo_vivo_despues": 30
        },
        "evidencias": [
          {
            "id": 200,
            "ruta_archivo": "vivero/merma/foto1.jpg",
            "mime_type": "image/jpeg",
            "tipo_archivo": "imagen",
            "es_principal": true,
            "orden": 0,
            "public_url": "https://xyz.supabase.co/storage/v1/object/public/recoleccion_fotos/vivero/merma/foto1.jpg"
          }
        ]
      },
      {
        "id": 13,
        "tipo_evento": "ADAPTABILIDAD",
        "fecha_evento": "2026-05-05",
        "payload": {
          "tipo": "ADAPTABILIDAD",
          "subetapa_destino": "SOMBRA",
          "saldo_vivo_antes": 30,
          "saldo_vivo_despues": 30
        },
        "evidencias": []
      },
      {
        "id": 14,
        "tipo_evento": "DESPACHO",
        "fecha_evento": "2026-05-06",
        "payload": {
          "tipo": "DESPACHO",
          "cantidad_afectada": 18,
          "destino_tipo": "DONACION_COMUNIDAD",
          "destino_referencia": "Comunidad Llachon",
          "saldo_vivo_antes": 30,
          "saldo_vivo_despues": 12
        },
        "evidencias": []
      }
    ]
  }
}
```

---

## Caso 2 — Filtrar por tipo de evento

Solo devuelve los eventos del tipo indicado.

**Valores válidos para `tipo_evento`:**

| Valor | Descripción |
|---|---|
| `INICIO` | Creación del lote desde una recolección |
| `EMBOLSADO` | Conversión a plantas vivas en maceta |
| `ADAPTABILIDAD` | Cambio de subetapa (SOMBRA → MEDIA_SOMBRA → SOL_DIRECTO) |
| `MERMA` | Pérdida de plantas (plaga, enfermedad, etc.) |
| `DESPACHO` | Salida de plantas hacia una comunidad u otro destino |
| `CIERRE_AUTOMATICO` | Cierre automático por pérdida total o despacho total |

**Ejemplo — solo mermas:**
```
GET http://localhost:3000/api/lotes-vivero/1/timeline?tipo_evento=MERMA
```

**Tab Params:**

| Key | Value |
|---|---|
| `tipo_evento` | `MERMA` |

**Ejemplo — solo adaptabilidades:**
```
GET http://localhost:3000/api/lotes-vivero/1/timeline?tipo_evento=ADAPTABILIDAD
```

**Ejemplo — solo despachos:**
```
GET http://localhost:3000/api/lotes-vivero/1/timeline?tipo_evento=DESPACHO
```

---

## Caso 3 — Filtrar por responsable

Solo devuelve los eventos registrados por un usuario específico.

```
GET http://localhost:3000/api/lotes-vivero/1/timeline?responsable_id=5
```

**Tab Params:**

| Key | Value |
|---|---|
| `responsable_id` | `5` _(ID del usuario en la tabla `usuario`)_ |

---

## Caso 4 — Filtrar por rango de fechas

Devuelve eventos cuya `fecha_evento` esté dentro del rango indicado (ambos extremos inclusivos).

```
GET http://localhost:3000/api/lotes-vivero/1/timeline?fecha_inicio=2026-04-01&fecha_fin=2026-06-30
```

**Tab Params:**

| Key | Value |
|---|---|
| `fecha_inicio` | `2026-04-01` |
| `fecha_fin` | `2026-06-30` |

> Las fechas deben estar en formato `YYYY-MM-DD`.  
> Puedes usar solo `fecha_inicio`, solo `fecha_fin`, o ambos.

---

## Caso 5 — Todos los filtros combinados

```
GET http://localhost:3000/api/lotes-vivero/1/timeline?tipo_evento=MERMA&responsable_id=5&fecha_inicio=2026-04-01&fecha_fin=2026-06-30
```

**Tab Params:**

| Key | Value |
|---|---|
| `tipo_evento` | `MERMA` |
| `responsable_id` | `5` |
| `fecha_inicio` | `2026-04-01` |
| `fecha_fin` | `2026-06-30` |

---

## Caso 6 — Lote sin eventos

Cuando el lote existe pero no tiene ningún evento registrado (o ninguno coincide con los filtros).

**Respuesta `200`:**
```json
{
  "success": true,
  "data": {
    "lote_id": 1,
    "codigo_trazabilidad": "LV-2026-0001",
    "estado_lote": "ACTIVO",
    "total_eventos": 0,
    "eventos": []
  }
}
```

---

## Payloads por tipo de evento

Cada evento incluye un campo `payload` con información específica según su tipo:

### `INICIO`
```json
{
  "tipo": "INICIO",
  "cantidad_inicial": 100,
  "unidad_medida": "G"
}
```
| Campo | Descripción |
|---|---|
| `cantidad_inicial` | Cantidad de semillas/esquejes al iniciar el lote |
| `unidad_medida` | `"G"` (gramos) o `"UNIDAD"` |

---

### `EMBOLSADO`
```json
{
  "tipo": "EMBOLSADO",
  "plantas_vivas_iniciales": 35
}
```
| Campo | Descripción |
|---|---|
| `plantas_vivas_iniciales` | Saldo vivo después del embolsado |

---

### `ADAPTABILIDAD`
```json
{
  "tipo": "ADAPTABILIDAD",
  "subetapa_destino": "MEDIA_SOMBRA",
  "saldo_vivo_antes": 30,
  "saldo_vivo_despues": 30
}
```
| Campo | Valores posibles |
|---|---|
| `subetapa_destino` | `SOMBRA`, `MEDIA_SOMBRA`, `SOL_DIRECTO` |
| `saldo_vivo_antes` | Plantas vivas antes del evento |
| `saldo_vivo_despues` | Plantas vivas después (igual al anterior en adaptabilidad) |

---

### `MERMA`
```json
{
  "tipo": "MERMA",
  "cantidad_afectada": 5,
  "causa_merma": "PLAGA",
  "saldo_vivo_antes": 35,
  "saldo_vivo_despues": 30
}
```
| Campo | Valores posibles para `causa_merma` |
|---|---|
| `causa_merma` | `PLAGA`, `ENFERMEDAD`, `SEQUIA`, `DANO_FISICO`, `MUERTE_NATURAL`, `OTRO` |

---

### `DESPACHO`
```json
{
  "tipo": "DESPACHO",
  "cantidad_afectada": 18,
  "destino_tipo": "DONACION_COMUNIDAD",
  "destino_referencia": "Comunidad Llachon",
  "saldo_vivo_antes": 30,
  "saldo_vivo_despues": 12
}
```
| Campo | Valores posibles para `destino_tipo` |
|---|---|
| `destino_tipo` | `PLANTACION_PROPIA`, `DONACION_COMUNIDAD`, `VENTA`, `OTRO` |

---

### `CIERRE_AUTOMATICO`
```json
{
  "tipo": "CIERRE_AUTOMATICO",
  "motivo_cierre": "PERDIDA_TOTAL"
}
```
| Campo | Valores posibles para `motivo_cierre` |
|---|---|
| `motivo_cierre` | `DESPACHO_TOTAL`, `PERDIDA_TOTAL`, `MIXTO` |

---

## Errores posibles

| Status | Causa |
|---|---|
| `400` | `tipo_evento` con valor que no existe en el enum |
| `400` | `fecha_inicio` o `fecha_fin` con formato distinto a `YYYY-MM-DD` |
| `400` | `responsable_id` no es un número entero positivo |
| `404` | El lote con ese ID no existe |
| `500` | Error interno del servidor (ver logs) |

---

## Estructura completa de un evento en la respuesta

```json
{
  "id": 12,
  "lote_vivero_id": 1,
  "tipo_evento": "MERMA",
  "fecha_evento": "2026-05-02",
  "created_at": "2026-05-02T14:00:00Z",
  "responsable_id": 5,
  "responsable_nombre": "Juan Banana",
  "observaciones": "Texto libre opcional",
  "payload": { ... },
  "evidencias": [
    {
      "id": 200,
      "ruta_archivo": "vivero/merma/foto1.jpg",
      "mime_type": "image/jpeg",
      "tipo_archivo": "imagen",
      "es_principal": true,
      "orden": 0,
      "public_url": "https://..."
    }
  ]
}
```

---

## Resumen del endpoint

| Campo | Valor |
|---|---|
| Método | `GET` |
| Ruta | `/api/lotes-vivero/:id/timeline` |
| Autenticación | No requerida |
| Filtros disponibles | `tipo_evento`, `responsable_id`, `fecha_inicio`, `fecha_fin` |
| Ordenamiento | `fecha_evento ASC` → `created_at ASC` → `id ASC` |
| Evidencias | Cargadas en batch (una sola consulta, no N+1) |
