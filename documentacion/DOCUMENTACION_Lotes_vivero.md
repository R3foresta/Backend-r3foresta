# 📚 Documentación de Endpoints — Módulo Lotes de Vivero

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura del Módulo](#arquitectura-del-módulo)
3. [Ciclo de Vida de un Lote](#ciclo-de-vida-de-un-lote)
4. [Autenticación y Permisos](#autenticación-y-permisos)
5. [Enumeraciones](#enumeraciones)
6. [Endpoints de la API](#endpoints-de-la-api)
   - [POST /lotes-vivero/evidencias-pendientes](#1️⃣-post-lotes-viverobievidencias-pendientes)
   - [POST /lotes-vivero](#2️⃣-post-lotes-vivero)
   - [POST /lotes-vivero/:id/embolsado](#3️⃣-post-lotes-viveroidembolsado)
   - [POST /lotes-vivero/:id/adaptabilidad](#4️⃣-post-lotes-viveroiadaptabilidad)
   - [POST /lotes-vivero/:id/merma](#5️⃣-post-lotes-viveroiderma)
   - [POST /lotes-vivero/:id/despacho](#6️⃣-post-lotes-viveroidespacho)
   - [GET /lotes-vivero](#7️⃣-get-lotes-vivero)
   - [GET /lotes-vivero/:id/timeline](#8️⃣-get-lotes-viveroidtimeline)
7. [Ejemplos Completos con Postman](#ejemplos-completos-con-postman)
8. [Flujo de Trabajo Típico](#flujo-de-trabajo-típico)
9. [Manejo de Errores](#manejo-de-errores)

---

## 🎯 Descripción General

El módulo de **Lotes de Vivero** gestiona el ciclo de vida completo de material vegetal dentro de un vivero, desde que ingresa procedente de una recolección validada hasta que las plantas son despachadas a su destino final.

Las responsabilidades principales son:

- 📦 Crear lotes a partir del saldo materializado de una recolección validada
- 📸 Registrar evidencias fotográficas pendientes antes de crear el lote
- 🪴 Registrar las etapas de crecimiento: embolsado y adaptabilidad al sol
- 📉 Registrar mermas (pérdida de plantas) con causa identificada
- 🚚 Registrar despachos de plantas hacia su destino
- 🔍 Listar lotes con filtros y consultar su timeline de eventos

---

## 🏗️ Arquitectura del Módulo

```
lotes-vivero.module.ts
├── LotesViveroController        (rutas REST)
└── LotesViveroService           (orquestador)
    ├── ViveroInicioService      (creación atómica de lote via RPC)
    ├── ViveroEventosService     (embolsado, adaptabilidad, merma, despacho)
    ├── ViveroConsultasService   (listar lotes y timeline)
    ├── ViveroEvidenciasService  (subida de fotos a Storage)
    ├── ViveroAuthService        (resolución de usuario y permisos)
    ├── ViveroCodigosService     (generación de códigos de trazabilidad)
    └── ViveroSnapshotsService   (snapshots de saldo por lote)
```

---

## 🔄 Ciclo de Vida de un Lote

```
[Recolección VALIDADA con saldo materializado]
          │
          ▼
1. Subir evidencias pendientes  ──► POST /lotes-vivero/evidencias-pendientes
          │
          ▼
2. Crear lote (inicio)          ──► POST /lotes-vivero
          │                         (descuenta saldo de recolección)
          ▼
3. Registrar embolsado          ──► POST /lotes-vivero/:id/embolsado
          │
          ▼
4. Registrar adaptabilidad      ──► POST /lotes-vivero/:id/adaptabilidad
   (SOMBRA → MEDIA_SOMBRA → SOL_DIRECTO)
          │
          ├──► Registrar merma  ──► POST /lotes-vivero/:id/merma
          │
          ▼
5. Registrar despacho           ──► POST /lotes-vivero/:id/despacho
   (si stock llega a 0, el lote se cierra automáticamente)
```

---

## 🔐 Autenticación y Permisos

Todos los endpoints de **escritura** (`POST`) requieren:

| Header | Descripción | Ejemplo |
|--------|-------------|---------|
| `x-auth-id` | UUID del usuario autenticado en Supabase | `3e4f5a6b-...` |

**Roles con permiso de escritura**: `ADMIN`, `GENERAL`

Los endpoints de **lectura** (`GET`) no requieren autenticación.

---

## 📂 Enumeraciones

### `UnidadMedidaVivero`
| Valor | Descripción |
|-------|-------------|
| `UNIDAD` | Semillas o plantas contadas por unidad |
| `G` | Gramos (para material a granel) |

### `SubetapaAdaptabilidad`
| Valor | Descripción |
|-------|-------------|
| `SOMBRA` | Primera etapa, protegida del sol directo |
| `MEDIA_SOMBRA` | Etapa intermedia |
| `SOL_DIRECTO` | Planta lista para campo abierto |

### `CausaMermaVivero`
| Valor | Descripción |
|-------|-------------|
| `PLAGA` | Ataque de insectos u organismos |
| `ENFERMEDAD` | Patógeno fúngico, bacteriano, etc. |
| `SEQUIA` | Falta de agua |
| `DANO_FISICO` | Daño mecánico |
| `MUERTE_NATURAL` | Muerte sin causa identificada |
| `DESCARTE_CALIDAD` | Descartada por no cumplir estándares |
| `OTRO` | Causa no categorizada |

### `DestinoTipoVivero`
| Valor | Descripción |
|-------|-------------|
| `PLANTACION_PROPIA` | Plantación interna de la organización |
| `DONACION_COMUNIDAD` | Donación a una comunidad registrada |
| `VENTA` | Venta a terceros |
| `OTRO` | Destino no categorizado |

### `EstadoLoteVivero`
| Valor | Descripción |
|-------|-------------|
| `ACTIVO` | El lote está en proceso |
| `FINALIZADO` | Lote cerrado (despacho total, pérdida total o mixto) |

### `MotivoCierreLote`
| Valor | Descripción |
|-------|-------------|
| `DESPACHO_TOTAL` | Todo el stock fue despachado |
| `PERDIDA_TOTAL` | Todo el stock fue dado de baja por merma |
| `MIXTO` | Combinación de despacho y merma |

### `TipoEventoVivero`
| Valor | Descripción |
|-------|-------------|
| `INICIO` | Creación del lote |
| `EMBOLSADO` | Embolsado de plántulas |
| `ADAPTABILIDAD` | Cambio de subetapa de adaptabilidad |
| `MERMA` | Pérdida de plantas |
| `DESPACHO` | Salida de plantas del vivero |
| `CIERRE_AUTOMATICO` | Cierre generado automáticamente al agotar stock |

---

## 🌐 Endpoints de la API

### **Base URL**: `http://localhost:3000/lotes-vivero`

---

### 1️⃣ POST /lotes-vivero/evidencias-pendientes

**Descripción**: Sube fotos como evidencias pendientes de asociar al evento de inicio de un lote. Se deben subir **antes** de crear el lote y los IDs retornados se pasan en el campo `evidencia_ids` del siguiente endpoint.

**Autenticación**: Header `x-auth-id` requerido.

**Content-Type**: `multipart/form-data`

**Body (FormData)**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fotos` | File[] | No | Hasta 5 imágenes (jpg, png, webp) |
| `titulo` | string | No | Título descriptivo (máx. 120 chars) |
| `descripcion` | string | No | Descripción de las fotos (máx. 1000 chars) |
| `tomado_en` | string (ISO 8601) | No | Fecha y hora en que se tomaron las fotos |
| `es_principal` | boolean | No | Indica si es la foto principal del evento |
| `metadata` | string (JSON) | No | Metadata adicional serializada como texto |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 501,
      "tipo_entidad_id": 9,
      "entidad_id": 0,
      "bucket": "recoleccion_fotos",
      "ruta_archivo": "vivero/eventos/pendientes/77/1_inicio.jpg",
      "storage_object_id": "abc-123",
      "tipo_archivo": "FOTO",
      "mime_type": "image/jpeg",
      "tamano_bytes": 245678,
      "titulo": "Inicio germinación lote 1",
      "es_principal": true,
      "creado_en": "2026-04-28T10:00:00Z",
      "creado_por_usuario_id": 77
    }
  ]
}
```

---

### 2️⃣ POST /lotes-vivero

**Descripción**: Crea un lote de vivero de forma atómica usando el saldo materializado de una recolección validada. En una sola operación:
- Genera el lote con su código de trazabilidad (`VIV-XXXXXX-REC-YYYYYY`)
- Registra el evento de `INICIO`
- Descuenta la cantidad del saldo de la recolección
- Asocia las evidencias indicadas al evento

**Autenticación**: Header `x-auth-id` requerido. Solo roles `ADMIN` y `GENERAL`.

**Content-Type**: `application/json`

**Body**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `recoleccion_id` | integer (≥1) | ✅ | ID de la recolección origen |
| `vivero_id` | integer (≥1) | ✅ | ID del vivero receptor |
| `fecha_inicio` | string (date) | ✅ | Fecha de inicio del lote (`YYYY-MM-DD`) |
| `fecha_evento` | string (date) | ✅ | Fecha del evento de inicio (`YYYY-MM-DD`) |
| `cantidad_inicial_en_proceso` | number (>0) | ✅ | Cantidad tomada de la recolección |
| `unidad_medida_inicial` | `UNIDAD` \| `G` | ✅ | Unidad del material |
| `evidencia_ids` | integer[] | ✅ | IDs de evidencias pendientes (mín. 1) |
| `observaciones` | string | No | Texto libre (máx. 1000 chars) |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "data": {
    "lote_vivero_id": 101,
    "evento_inicio_id": 202,
    "recoleccion_movimiento_id": 303,
    "codigo_trazabilidad": "VIV-000101-REC-000010",
    "saldo_recoleccion_antes": 10,
    "saldo_recoleccion_despues": 2,
    "evidencia_inicio_ids": [501, 502]
  }
}
```

**Errores posibles**:
| Código | Causa |
|--------|-------|
| `400` | Saldo insuficiente en la recolección, datos inválidos |
| `401` | Falta header `x-auth-id` |
| `403` | El usuario no tiene rol `ADMIN` o `GENERAL` |
| `404` | Recolección o vivero no encontrados |
| `500` | No se pudo generar código de trazabilidad único tras 5 reintentos |

---

### 3️⃣ POST /lotes-vivero/:id/embolsado

**Descripción**: Registra el embolsado de plántulas del lote. Marca la transición del material a bolsas individuales e inicia el conteo de plantas vivas.

**Autenticación**: Header `x-auth-id` requerido. Solo roles `ADMIN` y `GENERAL`.

**Path Parameter**:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | integer | ID del lote de vivero |

**Body**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha_evento` | string (date) | ✅ | Fecha del embolsado (`YYYY-MM-DD`) |
| `plantas_vivas_iniciales` | integer (≥1) | ✅ | Cantidad de plantas trasladadas a bolsas |
| `observaciones` | string | No | Texto libre (máx. 1000 chars) |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 210,
    "lote_vivero_id": 101,
    "tipo_evento": "EMBOLSADO",
    "fecha_evento": "2026-04-25",
    "plantas_vivas_iniciales": 120,
    "observaciones": "Embolsado con sustrato turba y perlita"
  }
}
```

---

### 4️⃣ POST /lotes-vivero/:id/adaptabilidad

**Descripción**: Avanza la subetapa de adaptabilidad al sol del lote. El orden permitido es: `SOMBRA` → `MEDIA_SOMBRA` → `SOL_DIRECTO`. No se puede retroceder.

**Autenticación**: Header `x-auth-id` requerido. Solo roles `ADMIN` y `GENERAL`.

**Path Parameter**:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | integer | ID del lote de vivero |

**Body**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha_evento` | string (date) | ✅ | Fecha del cambio (`YYYY-MM-DD`) |
| `subetapa_destino` | enum | ✅ | `SOMBRA`, `MEDIA_SOMBRA` o `SOL_DIRECTO` |
| `observaciones` | string | No | Texto libre (máx. 1000 chars) |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 215,
    "lote_vivero_id": 101,
    "tipo_evento": "ADAPTABILIDAD",
    "fecha_evento": "2026-05-01",
    "subetapa_destino": "MEDIA_SOMBRA",
    "observaciones": "Plantas tolerando bien la media sombra"
  }
}
```

---

### 5️⃣ POST /lotes-vivero/:id/merma

**Descripción**: Registra la pérdida de plantas en el lote. El stock vivo se reduce en la `cantidad_afectada`. Si el stock llega a cero, el lote se cierra automáticamente con motivo `PERDIDA_TOTAL`.

**Autenticación**: Header `x-auth-id` requerido. Solo roles `ADMIN` y `GENERAL`.

**Path Parameter**:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | integer | ID del lote de vivero |

**Body**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha_evento` | string (date) | ✅ | Fecha de la merma (`YYYY-MM-DD`) |
| `cantidad_afectada` | integer (≥1) | ✅ | Número de plantas perdidas |
| `causa_merma` | enum | ✅ | Causa de la pérdida (ver enumeraciones) |
| `observaciones` | string | No | Texto libre (máx. 1000 chars) |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 220,
    "lote_vivero_id": 101,
    "tipo_evento": "MERMA",
    "fecha_evento": "2026-05-10",
    "cantidad_afectada": 5,
    "causa_merma": "PLAGA",
    "stock_vivo_antes": 115,
    "stock_vivo_despues": 110,
    "observaciones": "Plaga de mosca blanca detectada en sector norte"
  }
}
```

---

### 6️⃣ POST /lotes-vivero/:id/despacho

**Descripción**: Registra la salida de plantas del vivero hacia un destino. Si tras el despacho el stock vivo llega a cero, el lote se cierra automáticamente. Si `destino_tipo` es `DONACION_COMUNIDAD`, el campo `comunidad_destino_id` es obligatorio.

**Autenticación**: Header `x-auth-id` requerido. Solo roles `ADMIN` y `GENERAL`.

**Path Parameter**:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | integer | ID del lote de vivero |

**Body**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha_evento` | string (date) | ✅ | Fecha del despacho (`YYYY-MM-DD`) |
| `cantidad_afectada` | integer (≥1) | ✅ | Número de plantas despachadas |
| `destino_tipo` | enum | ✅ | Tipo de destino (ver enumeraciones) |
| `destino_referencia` | string | ✅ | Descripción del lugar de destino (máx. 500 chars) |
| `comunidad_destino_id` | integer | Condicional | Requerido si `destino_tipo` es `DONACION_COMUNIDAD` |
| `observaciones` | string | No | Texto libre (máx. 1000 chars) |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 225,
    "lote_vivero_id": 101,
    "tipo_evento": "DESPACHO",
    "fecha_evento": "2026-06-01",
    "cantidad_afectada": 50,
    "destino_tipo": "PLANTACION_PROPIA",
    "destino_referencia": "Parcela Norte - Zona A, sector 3",
    "stock_vivo_antes": 110,
    "stock_vivo_despues": 60,
    "lote_cerrado": false
  }
}
```

---

### 7️⃣ GET /lotes-vivero

**Descripción**: Lista lotes de vivero con filtros opcionales y paginación.

**Autenticación**: No requerida.

**Query Parameters**:

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `page` | integer | Número de página (default: 1) | `?page=2` |
| `limit` | integer (máx. 50) | Registros por página (default: 20) | `?limit=10` |
| `estado_lote` | enum | `ACTIVO` o `FINALIZADO` | `?estado_lote=ACTIVO` |
| `vivero_id` | integer | ID del vivero | `?vivero_id=2` |
| `recoleccion_id` | integer | ID de la recolección origen | `?recoleccion_id=10` |
| `lote_vivero_id` | integer | ID específico del lote | `?lote_vivero_id=101` |
| `motivo_cierre` | enum | Motivo de cierre (solo lotes FINALIZADO) | `?motivo_cierre=DESPACHO_TOTAL` |
| `fecha_inicio` | string (date) | Inicio del rango de búsqueda | `?fecha_inicio=2026-01-01` |
| `fecha_fin` | string (date) | Fin del rango de búsqueda | `?fecha_fin=2026-06-30` |
| `q` | string | Búsqueda libre sobre campos de texto | `?q=ceibo` |

**Ejemplos de URL**:
```
GET /lotes-vivero?page=1&limit=20
GET /lotes-vivero?estado_lote=ACTIVO&vivero_id=2
GET /lotes-vivero?fecha_inicio=2026-01-01&fecha_fin=2026-06-30
GET /lotes-vivero?q=ceibo&motivo_cierre=DESPACHO_TOTAL
```

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "codigo_trazabilidad": "VIV-000101-REC-000010",
      "estado_lote": "ACTIVO",
      "vivero_id": 2,
      "recoleccion_id": 10,
      "fecha_inicio": "2026-04-20",
      "cantidad_inicial_en_proceso": 8,
      "unidad_medida_inicial": "UNIDAD",
      "stock_vivo_actual": 110,
      "observaciones": "Primera siembra del ciclo primavera 2026"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

---

### 8️⃣ GET /lotes-vivero/:id/timeline

**Descripción**: Devuelve el historial cronológico de eventos del lote (inicio, embolsado, adaptabilidad, mermas, despachos). Permite filtrar por tipo de evento, responsable y rango de fechas.

**Autenticación**: No requerida.

**Path Parameter**:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | integer | ID del lote de vivero |

**Query Parameters**:

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `tipo_evento` | enum | Filtrar por tipo de evento | `?tipo_evento=MERMA` |
| `responsable_id` | integer | ID del usuario responsable | `?responsable_id=77` |
| `fecha_inicio` | string (date) | Inicio del rango | `?fecha_inicio=2026-04-01` |
| `fecha_fin` | string (date) | Fin del rango | `?fecha_fin=2026-06-30` |

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 202,
      "lote_vivero_id": 101,
      "tipo_evento": "INICIO",
      "fecha_evento": "2026-04-20",
      "responsable_id": 77,
      "responsable_nombre": "María Condori",
      "payload": {
        "cantidad_inicial_en_proceso": 8,
        "unidad_medida_inicial": "UNIDAD",
        "evidencia_ids": [501, 502]
      },
      "creado_en": "2026-04-20T09:30:00Z"
    },
    {
      "id": 210,
      "lote_vivero_id": 101,
      "tipo_evento": "EMBOLSADO",
      "fecha_evento": "2026-04-25",
      "responsable_id": 77,
      "responsable_nombre": "María Condori",
      "payload": {
        "plantas_vivas_iniciales": 120
      },
      "creado_en": "2026-04-25T11:00:00Z"
    },
    {
      "id": 220,
      "lote_vivero_id": 101,
      "tipo_evento": "MERMA",
      "fecha_evento": "2026-05-10",
      "responsable_id": 77,
      "responsable_nombre": "María Condori",
      "payload": {
        "cantidad_afectada": 5,
        "causa_merma": "PLAGA",
        "stock_vivo_antes": 115,
        "stock_vivo_despues": 110
      },
      "creado_en": "2026-05-10T14:00:00Z"
    }
  ]
}
```

---

## 📬 Ejemplos Completos con Postman

### Configuración de Variables de Entorno en Postman

Crea un entorno en Postman con las siguientes variables:

| Variable | Valor de ejemplo |
|----------|-----------------|
| `base_url` | `http://localhost:3000` |
| `auth_id` | `3e4f5a6b-7c8d-9e0f-a1b2-c3d4e5f60001` |
| `lote_id` | `101` |

---

### Ejemplo 1 — Subir evidencias pendientes

```
POST {{base_url}}/lotes-vivero/evidencias-pendientes
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: multipart/form-data
```

**Body (form-data)**:
```
titulo          | Foto inicio lote primavera 2026
descripcion     | Semillas en cama de germinación, primera semana
tomado_en       | 2026-04-20T08:30:00Z
es_principal    | true
fotos           | [archivo: inicio_lote_01.jpg]
fotos           | [archivo: inicio_lote_02.jpg]
```

**Respuesta esperada (201)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 501,
      "ruta_archivo": "vivero/eventos/pendientes/77/1_inicio_lote_01.jpg",
      "mime_type": "image/jpeg",
      "tamano_bytes": 198240,
      "titulo": "Foto inicio lote primavera 2026",
      "es_principal": true
    },
    {
      "id": 502,
      "ruta_archivo": "vivero/eventos/pendientes/77/2_inicio_lote_02.jpg",
      "mime_type": "image/jpeg",
      "tamano_bytes": 215000,
      "es_principal": false
    }
  ]
}
```

---

### Ejemplo 2 — Crear lote desde recolección

```
POST {{base_url}}/lotes-vivero
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "recoleccion_id": 10,
  "vivero_id": 2,
  "fecha_inicio": "2026-04-20",
  "fecha_evento": "2026-04-20",
  "cantidad_inicial_en_proceso": 8,
  "unidad_medida_inicial": "UNIDAD",
  "evidencia_ids": [501, 502],
  "observaciones": "Primera siembra del ciclo primavera 2026"
}
```

**Respuesta esperada (201)**:
```json
{
  "success": true,
  "data": {
    "lote_vivero_id": 101,
    "evento_inicio_id": 202,
    "recoleccion_movimiento_id": 303,
    "codigo_trazabilidad": "VIV-000101-REC-000010",
    "saldo_recoleccion_antes": 10,
    "saldo_recoleccion_despues": 2,
    "evidencia_inicio_ids": [501, 502]
  }
}
```

> 💡 Guarda `lote_vivero_id` en la variable `{{lote_id}}` de Postman para usarla en los siguientes ejemplos.

---

### Ejemplo 3 — Registrar embolsado

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/embolsado
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "fecha_evento": "2026-04-25",
  "plantas_vivas_iniciales": 120,
  "observaciones": "Embolsado con sustrato turba y perlita al 30%"
}
```

**Respuesta esperada (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 210,
    "lote_vivero_id": 101,
    "tipo_evento": "EMBOLSADO",
    "fecha_evento": "2026-04-25",
    "plantas_vivas_iniciales": 120
  }
}
```

---

### Ejemplo 4 — Registrar adaptabilidad (avanzar a media sombra)

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/adaptabilidad
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "fecha_evento": "2026-05-01",
  "subetapa_destino": "MEDIA_SOMBRA",
  "observaciones": "Plantas bien desarrolladas, tolerando la media sombra sin señales de estrés"
}
```

**Respuesta esperada (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 215,
    "lote_vivero_id": 101,
    "tipo_evento": "ADAPTABILIDAD",
    "fecha_evento": "2026-05-01",
    "subetapa_destino": "MEDIA_SOMBRA"
  }
}
```

---

### Ejemplo 5 — Registrar adaptabilidad (avanzar a sol directo)

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/adaptabilidad
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "fecha_evento": "2026-05-15",
  "subetapa_destino": "SOL_DIRECTO",
  "observaciones": "Plantas listas para campo abierto"
}
```

---

### Ejemplo 6 — Registrar merma por plaga

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/merma
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "fecha_evento": "2026-05-10",
  "cantidad_afectada": 5,
  "causa_merma": "PLAGA",
  "observaciones": "Plaga de mosca blanca detectada en sector norte del vivero. Se aplicó tratamiento."
}
```

**Respuesta esperada (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 220,
    "lote_vivero_id": 101,
    "tipo_evento": "MERMA",
    "fecha_evento": "2026-05-10",
    "cantidad_afectada": 5,
    "causa_merma": "PLAGA",
    "stock_vivo_antes": 115,
    "stock_vivo_despues": 110
  }
}
```

---

### Ejemplo 7 — Registrar despacho a plantación propia

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/despacho
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "fecha_evento": "2026-06-01",
  "cantidad_afectada": 50,
  "destino_tipo": "PLANTACION_PROPIA",
  "destino_referencia": "Parcela Norte - Zona A, sector 3, coordenadas -16.58 / -68.15",
  "observaciones": "Despacho coordinado con el equipo de campo"
}
```

**Respuesta esperada (201)**:
```json
{
  "success": true,
  "data": {
    "evento_id": 225,
    "lote_vivero_id": 101,
    "tipo_evento": "DESPACHO",
    "fecha_evento": "2026-06-01",
    "cantidad_afectada": 50,
    "destino_tipo": "PLANTACION_PROPIA",
    "destino_referencia": "Parcela Norte - Zona A, sector 3, coordenadas -16.58 / -68.15",
    "stock_vivo_antes": 110,
    "stock_vivo_despues": 60,
    "lote_cerrado": false
  }
}
```

---

### Ejemplo 8 — Registrar despacho a comunidad (donación)

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/despacho
```

**Headers**:
```
x-auth-id: {{auth_id}}
Content-Type: application/json
```

**Body**:
```json
{
  "fecha_evento": "2026-06-15",
  "cantidad_afectada": 60,
  "destino_tipo": "DONACION_COMUNIDAD",
  "destino_referencia": "Comunidad Achocalla - Zona Centro",
  "comunidad_destino_id": 3,
  "observaciones": "Donación coordinada con líder comunal Doña Rosa Quispe"
}
```

---

### Ejemplo 9 — Listar lotes activos de un vivero

```
GET {{base_url}}/lotes-vivero?estado_lote=ACTIVO&vivero_id=2&page=1&limit=10
```

**Headers**: (ninguno requerido)

**Respuesta esperada (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "codigo_trazabilidad": "VIV-000101-REC-000010",
      "estado_lote": "ACTIVO",
      "vivero_id": 2,
      "recoleccion_id": 10,
      "fecha_inicio": "2026-04-20",
      "cantidad_inicial_en_proceso": 8,
      "unidad_medida_inicial": "UNIDAD",
      "stock_vivo_actual": 60
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

---

### Ejemplo 10 — Consultar timeline del lote

```
GET {{base_url}}/lotes-vivero/{{lote_id}}/timeline
```

**Sin filtros (todos los eventos)**:

**Respuesta esperada (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 202,
      "tipo_evento": "INICIO",
      "fecha_evento": "2026-04-20",
      "responsable_nombre": "María Condori",
      "payload": { "cantidad_inicial_en_proceso": 8, "unidad_medida_inicial": "UNIDAD" }
    },
    {
      "id": 210,
      "tipo_evento": "EMBOLSADO",
      "fecha_evento": "2026-04-25",
      "responsable_nombre": "María Condori",
      "payload": { "plantas_vivas_iniciales": 120 }
    },
    {
      "id": 215,
      "tipo_evento": "ADAPTABILIDAD",
      "fecha_evento": "2026-05-01",
      "responsable_nombre": "María Condori",
      "payload": { "subetapa_destino": "MEDIA_SOMBRA" }
    },
    {
      "id": 220,
      "tipo_evento": "MERMA",
      "fecha_evento": "2026-05-10",
      "responsable_nombre": "María Condori",
      "payload": { "cantidad_afectada": 5, "causa_merma": "PLAGA", "stock_vivo_despues": 110 }
    },
    {
      "id": 225,
      "tipo_evento": "DESPACHO",
      "fecha_evento": "2026-06-01",
      "responsable_nombre": "María Condori",
      "payload": { "cantidad_afectada": 50, "destino_tipo": "PLANTACION_PROPIA", "stock_vivo_despues": 60 }
    }
  ]
}
```

**Filtrado solo por mermas**:
```
GET {{base_url}}/lotes-vivero/{{lote_id}}/timeline?tipo_evento=MERMA
```

---

## 🔄 Flujo de Trabajo Típico

El siguiente es el flujo recomendado para operar un lote de vivero de inicio a fin:

```
Paso 1 → POST /lotes-vivero/evidencias-pendientes
         Sube las fotos del material antes de empezar.
         Guarda los IDs retornados.

Paso 2 → POST /lotes-vivero
         Crea el lote indicando los evidencia_ids del paso 1.
         Guarda el lote_vivero_id retornado.

Paso 3 → POST /lotes-vivero/{lote_id}/embolsado
         Cuando las semillas germinan y se pasan a bolsas.

Paso 4 → POST /lotes-vivero/{lote_id}/adaptabilidad  (subetapa: SOMBRA)
         Si aplica, registrar etapas de endurecimiento.

Paso 5 → POST /lotes-vivero/{lote_id}/adaptabilidad  (subetapa: MEDIA_SOMBRA)

Paso 6 → POST /lotes-vivero/{lote_id}/adaptabilidad  (subetapa: SOL_DIRECTO)

Paso 7 → POST /lotes-vivero/{lote_id}/merma          (si hubiera pérdidas)

Paso 8 → POST /lotes-vivero/{lote_id}/despacho
         Repetir hasta que el stock llegue a 0.
         El lote se cierra automáticamente.

Paso 9 → GET  /lotes-vivero/{lote_id}/timeline
         Auditar todo el historial del lote.
```

---

## ⚠️ Manejo de Errores

Todos los errores siguen el formato estándar de NestJS:

```json
{
  "statusCode": 400,
  "message": "Descripción del error",
  "error": "Bad Request"
}
```

### Errores Comunes

| Código HTTP | Causa | Solución |
|-------------|-------|----------|
| `400` | Datos de entrada inválidos | Verificar tipos, rangos y campos requeridos |
| `400` | Saldo insuficiente en la recolección | Verificar `saldo_recoleccion_despues` antes de crear el lote |
| `400` | Cantidad de merma/despacho supera el stock vivo | Consultar el stock actual del lote |
| `400` | Transición de subetapa no permitida | Las subetapas solo avanzan; no se puede retroceder |
| `401` | Falta el header `x-auth-id` | Incluir el header con el UUID del usuario |
| `401` | Header `x-auth-id` vacío | El valor del header no puede ser un string vacío |
| `403` | Rol sin permisos de escritura | Solo `ADMIN` y `GENERAL` pueden registrar eventos |
| `404` | Lote de vivero no encontrado | Verificar el `:id` en la URL |
| `404` | Recolección o vivero no encontrado | Verificar los IDs en el body |
| `501` | Endpoint pendiente de implementación | Embolsado, adaptabilidad, merma y despacho están en desarrollo |
| `500` | Error al generar código de trazabilidad | Reintento automático hasta 5 veces; si persiste, contactar soporte |

### Nota sobre endpoints en desarrollo

Los siguientes endpoints están definidos y validados pero su lógica de base de datos está pendiente de implementación:

- `POST /lotes-vivero/:id/embolsado`
- `POST /lotes-vivero/:id/adaptabilidad`
- `POST /lotes-vivero/:id/merma`
- `POST /lotes-vivero/:id/despacho`
- `GET /lotes-vivero`
- `GET /lotes-vivero/:id/timeline`

Actualmente retornan `501 Not Implemented` hasta que se implementen las funciones RPC en Supabase.
