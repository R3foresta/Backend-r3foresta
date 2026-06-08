# Pruebas Postman — Adaptabilidad de Lotes de Vivero

> Base URL local: `http://localhost:3000/api`  
> Base URL producción: `https://<tu-dominio>/api`  
> Header requerido en casi todos los endpoints: `x-auth-id: <auth_id_del_usuario>`

---

## Flujo completo recomendado

```
1. (Opcional) POST  lotes-vivero/:id/adaptabilidad/evidencias-pendientes  → obtén evidencia_ids
2.            POST  lotes-vivero/:id/adaptabilidad                         → registra el evento
3.            GET   lotes-vivero/:id/adaptabilidad                         → consulta el historial
```

> **Nota:** El lote debe tener al menos un evento **EMBOLSADO** registrado antes de poder registrar ADAPTABILIDAD. Si el lote está en estado FINALIZADO, el endpoint retornará 400.

---

## Endpoint 1 — Subir evidencias pendientes (paso opcional)

> Sube las fotos al storage de Supabase y obtiene los `evidencia_ids` para vincular al evento. Este paso es **opcional**: puedes registrar la adaptabilidad sin evidencia.

### `POST /api/lotes-vivero/:id/adaptabilidad/evidencias-pendientes`

| Campo | Valor |
|---|---|
| Método | `POST` |
| URL | `http://localhost:3000/api/lotes-vivero/1/adaptabilidad/evidencias-pendientes` |
| Body | `form-data` (multipart) |
| Header | `x-auth-id: <auth_id>` |

**Configuración en Postman:**
- Tab **Body** → seleccionar `form-data`

| Key | Type | Value de ejemplo |
|---|---|---|
| `fotos` | File | _(selecciona 1-5 imágenes JPG/JPEG/PNG/WEBP/HEIC/HEIF)_ |
| `titulo` | Text | `Subetapa media sombra` |
| `descripcion` | Text | `Plantas en fase de aclimatacion` |

> `titulo` y `descripcion` son opcionales.  
> Solo se aceptan archivos JPG, JPEG y PNG. Máximo 5 archivos.

**Respuesta exitosa `201`:**
```json
{
  "success": true,
  "data": {
    "evidencia_ids": [310, 311],
    "evidencias": [
      {
        "id": 310,
        "codigo_trazabilidad": "LV-2026-0001",
        "entidad_id": 0,
        "ruta_archivo": "vivero/adaptabilidad/foto1.jpg",
        "tipo_archivo": "image/jpeg"
      },
      {
        "id": 311,
        "codigo_trazabilidad": "LV-2026-0001",
        "entidad_id": 0,
        "ruta_archivo": "vivero/adaptabilidad/foto2.jpg",
        "tipo_archivo": "image/jpeg"
      }
    ]
  }
}
```

**Errores posibles:**

| Status | Causa |
|---|---|
| `400` | No se enviaron fotos o el lote no está en estado `ACTIVO` |
| `401` | Falta el header `x-auth-id` |
| `404` | El lote con ese ID no existe |

---

## Endpoint 2 — Registrar evento de adaptabilidad

### `POST /api/lotes-vivero/:id/adaptabilidad`

| Campo | Valor |
|---|---|
| Método | `POST` |
| URL | `http://localhost:3000/api/lotes-vivero/1/adaptabilidad` |
| Body | `raw → JSON` |
| Header | `x-auth-id: <auth_id>` |
| Header | `Content-Type: application/json` |

### Campos del body

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `fecha_evento` | `string (date)` | ✅ Sí | Fecha en formato `YYYY-MM-DD` |
| `subetapa_destino` | `string (enum)` | ✅ Sí | Valor de `SubetapaAdaptabilidad` (ver tabla abajo) |
| `evidencia_ids` | `number[]` | ❌ No | IDs obtenidos en el paso 1. Puede omitirse o enviarse vacío |
| `observaciones` | `string (max 1000)` | ❌ No | Texto libre |

**Valores válidos para `subetapa_destino`:**

| Valor | Significado |
|---|---|
| `SOMBRA` | Primera subetapa — plantas bajo sombra total |
| `MEDIA_SOMBRA` | Segunda subetapa — plantas con sombra parcial |
| `SOL_DIRECTO` | Tercera subetapa — plantas expuestas al sol directo |

> El orden no es obligatorio. Se permite registrar múltiples adaptabilidades con cualquier subetapa.

---

### Caso 1 — Sin evidencia (más simple)

```json
{
  "fecha_evento": "2026-05-06",
  "subetapa_destino": "SOMBRA",
  "observaciones": "Plantas iniciando fase de adaptabilidad bajo sombra"
}
```

### Caso 2 — Con evidencias previamente subidas

```json
{
  "fecha_evento": "2026-05-06",
  "subetapa_destino": "MEDIA_SOMBRA",
  "evidencia_ids": [310, 311],
  "observaciones": "Plantas tolerando bien la media sombra"
}
```

### Caso 3 — Sin observaciones ni evidencia

```json
{
  "fecha_evento": "2026-05-06",
  "subetapa_destino": "SOL_DIRECTO"
}
```

### Caso 4 — Evidencia_ids vacío (equivale a sin evidencia)

```json
{
  "fecha_evento": "2026-05-06",
  "subetapa_destino": "SOMBRA",
  "evidencia_ids": []
}
```

---

**Respuesta exitosa `201`:**
```json
{
  "success": true,
  "message": "ADAPTABILIDAD registrada. Subetapa actualizada a MEDIA_SOMBRA.",
  "data": {
    "evento_adaptabilidad_id": 42,
    "lote_vivero_id": 1,
    "codigo_trazabilidad": "LV-2026-0001",
    "subetapa_destino": "MEDIA_SOMBRA",
    "saldo_vivo_actual": 850,
    "evidencia_ids_vinculadas": [310, 311]
  }
}
```

**Errores posibles:**

| Status | Causa |
|---|---|
| `400` | El lote no tiene EMBOLSADO previo |
| `400` | El lote está en estado FINALIZADO |
| `400` | `fecha_evento` con formato inválido |
| `400` | `subetapa_destino` con valor que no existe en el enum |
| `400` | Un `evidencia_ids` ya está vinculado a otro evento |
| `400` | `observaciones` supera 1000 caracteres |
| `401` | Falta el header `x-auth-id` |
| `403` | El rol del usuario no tiene permiso de escritura |
| `404` | El lote con ese ID no existe |
| `500` | Error interno (ver logs del servidor) |

---

## Endpoint 3 — Consultar historial de adaptabilidades

### `GET /api/lotes-vivero/:id/adaptabilidad`

| Campo | Valor |
|---|---|
| Método | `GET` |
| URL | `http://localhost:3000/api/lotes-vivero/1/adaptabilidad` |
| Body | _(ninguno)_ |
| Header | _(ninguno requerido)_ |

> No requiere `x-auth-id` — es consulta pública.

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "data": {
    "lote_id": 1,
    "saldo_vivo_actual": 850,
    "subetapa_actual": "MEDIA_SOMBRA",
    "total_adaptabilidades": 2,
    "adaptabilidades": [
      {
        "id": 42,
        "fecha_evento": "2026-05-06",
        "subetapa_destino": "MEDIA_SOMBRA",
        "cantidad_afectada": 850,
        "unidad_medida_evento": "UNIDAD",
        "saldo_vivo_antes": 850,
        "saldo_vivo_despues": 850,
        "observaciones": "Plantas tolerando bien la media sombra",
        "responsable_id": 5,
        "created_at": "2026-05-06",
        "evidencias": [
          {
            "id": 310,
            "ruta_archivo": "vivero/adaptabilidad/foto1.jpg",
            "mime_type": "image/jpeg",
            "tipo_archivo": "imagen",
            "es_principal": false,
            "orden": 0
          }
        ]
      },
      {
        "id": 38,
        "fecha_evento": "2026-04-30",
        "subetapa_destino": "SOMBRA",
        "cantidad_afectada": 850,
        "unidad_medida_evento": "UNIDAD",
        "saldo_vivo_antes": 850,
        "saldo_vivo_despues": 850,
        "observaciones": null,
        "responsable_id": 5,
        "created_at": "2026-04-30",
        "evidencias": []
      }
    ]
  }
}
```

**Errores posibles:**

| Status | Causa |
|---|---|
| `404` | El lote con ese ID no existe |
| `500` | Error interno (ver logs del servidor) |

---

## Resumen de endpoints

| # | Método | Ruta | Auth | Body |
|---|---|---|---|---|
| 1 | `POST` | `/api/lotes-vivero/:id/adaptabilidad/evidencias-pendientes` | `x-auth-id` ✅ | `form-data` con `fotos` |
| 2 | `POST` | `/api/lotes-vivero/:id/adaptabilidad` | `x-auth-id` ✅ | `JSON` |
| 3 | `GET` | `/api/lotes-vivero/:id/adaptabilidad` | No requerido | _(ninguno)_ |

---

## Variables de entorno sugeridas para Postman

Crea un **Environment** en Postman con estas variables:

| Variable | Valor de ejemplo |
|---|---|
| `base_url` | `http://localhost:3000/api` |
| `lote_id` | `1` |
| `auth_id` | `<UUID del usuario en Supabase Auth>` |

Luego usa en las URLs: `{{base_url}}/lotes-vivero/{{lote_id}}/adaptabilidad`  
Y en el header: `x-auth-id: {{auth_id}}`

---

## Precondiciones para que funcionen las pruebas

1. El servidor NestJS debe estar corriendo (`npm run start:dev`)
2. La migration `021_vivero_adaptabilidad_rpc.sql` debe estar aplicada en Supabase
3. El lote debe existir en la tabla `lote_vivero` con al menos un evento `EMBOLSADO`
4. El usuario indicado en `x-auth-id` debe existir en la tabla `users` con un rol que permita escritura
