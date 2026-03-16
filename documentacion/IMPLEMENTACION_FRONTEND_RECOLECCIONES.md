# 📋 Implementación Frontend — Módulo Recolecciones

Guía completa de los endpoints disponibles y las reglas de negocio que el frontend debe respetar para el flujo de recolecciones.

---

## 🗺️ Flujo de Estados

```
      [Crear]
         │
         ▼
    ┌─────────┐     [Enviar a validación]     ┌──────────────────────┐
    │ BORRADOR│─────────────────────────────►│ PENDIENTE_VALIDACION │
    └─────────┘                              └──────────────────────┘
         ▲                                          │           │
         │                  [Rechazar]              │           │ [Aprobar]
         │◄─────────────────────────────────────────┘           │
    ┌──────────┐                                                 ▼
    │RECHAZADO │                                          ┌────────────┐
    └──────────┘          ┌─ PINATA (metadata IPFS) ────►│  VALIDADO  │
    (editar y reenviar)   └─ BLOCKCHAIN (mint NFT) ─────►│ + token_id │
                                                          └────────────┘
```

### Reglas de editabilidad

| Estado                | ¿Se puede editar? | Detalle                                 |
|-----------------------|-------------------|-----------------------------------------|
| `BORRADOR`            | ✅ Sí             | Edición libre de todos los campos       |
| `PENDIENTE_VALIDACION`| ❌ No             | Bloqueado, esperando al validador       |
| `VALIDADO`            | ❌ No             | Inmutable, ya tiene NFT en blockchain   |
| `RECHAZADO`           | ✅ Sí             | Al editar, el estado vuelve a BORRADOR  |

### Reglas de validación

| Condición             | Detalle                                               |
|-----------------------|-------------------------------------------------------|
| ¿Quién puede validar? | Solo rol `VALIDADOR` o `ADMIN`                        |
| ¿Desde qué estado?    | Solo desde `PENDIENTE_VALIDACION`                     |
| ¿Qué ocurre al aprobar? | 1. Sube metadata a IPFS (Pinata) → obtiene CID    |
|                       | 2. Mint NFT en blockchain → guarda `token_id`        |
|                       | 3. Estado pasa a `VALIDADO`                          |

### Reglas para viveros

- Solo mostrar recolecciones cuando `estado_registro = 'VALIDADO'`
- Preferiblemente, filtrar adicionalmente cuando `token_id IS NOT NULL`
- Endpoint dedicado: `GET /api/recolecciones/vivero/:viveroId`

---

## 🔑 Autenticación — Headers requeridos

Todos los endpoints de escritura y la mayoría de los de lectura requieren los siguientes headers:

| Header          | Descripción                                          | Ejemplo              |
|-----------------|------------------------------------------------------|----------------------|
| `x-auth-id`     | UUID del usuario autenticado en Supabase             | `abc123-uuid-...`    |
| `x-user-role`   | Rol del usuario (`ADMIN`, `GENERAL`, `VALIDADOR`, `VOLUNTARIO`) | `GENERAL` |

> **Nota:** `x-user-role` es obligatorio en todos los endpoints de flujo de estados.

---

## 📡 Endpoints

### 1. Crear recolección

**`POST /api/recolecciones`**

Crea una nueva recolección en estado `BORRADOR`. Requiere `multipart/form-data`.

**Headers:**
```
x-auth-id: <uuid-supabase>
Content-Type: multipart/form-data
```

**Campos del formulario:**

| Campo                    | Tipo      | Requerido | Descripción                                   |
|--------------------------|-----------|-----------|-----------------------------------------------|
| `fecha`                  | `string`  | ✅        | Formato `YYYY-MM-DD`. No futura, máx 45 días atrás |
| `cantidad`               | `number`  | ✅        | Mayor a 0                                     |
| `unidad`                 | `string`  | ✅        | Ej: `kg`, `g`, `unidad`                       |
| `tipo_material`          | `string`  | ✅        | `SEMILLA` o `ESQUEJE`                         |
| `planta_id`              | `number`  | ✅        | ID de la planta                               |
| `metodo_id`              | `number`  | ✅        | ID del método de recolección                  |
| `vivero_id`              | `number`  | ❌        | ID del vivero (opcional)                      |
| `observaciones`          | `string`  | ❌        | Máx 1000 caracteres                           |
| `ubicacion[latitud]`     | `number`  | ✅        | Ej: `-16.5833`                                |
| `ubicacion[longitud]`    | `number`  | ✅        | Ej: `-68.15`                                  |
| `ubicacion[pais_id]`     | `number`  | ❌        | ID del país                                   |
| `ubicacion[division_id]` | `number`  | ❌        | ID de división territorial                    |
| `ubicacion[nombre]`      | `string`  | ❌        | Nombre del lugar                              |
| `ubicacion[referencia]`  | `string`  | ❌        | Referencia del lugar                          |
| `ubicacion[precision_m]` | `number`  | ❌        | Precisión GPS en metros                       |
| `ubicacion[fuente]`      | `string`  | ❌        | `GPS_MOVIL`, `GPS_MANUAL`, etc.               |
| `fotos`                  | `File[]`  | ✅        | 1 a 5 fotos (JPG/JPEG/PNG, máx 5MB c/u)      |

**Respuesta exitosa `201`:**
```json
{
  "id": 42,
  "codigo_trazabilidad": "REC-2026-00042",
  "estado_registro": "BORRADOR",
  "fecha": "2026-03-13",
  "cantidad": 2.5,
  "unidad": "kg",
  "tipo_material": "SEMILLA",
  "token_id": null,
  "blockchain_url": null
}
```

---

### 2. Editar borrador

**`PATCH /api/recolecciones/:id/draft`**

Edita campos de una recolección en estado `BORRADOR` o `RECHAZADO`.
- Si estaba `RECHAZADO`, el estado vuelve automáticamente a `BORRADOR`.
- No se puede usar si el estado es `PENDIENTE_VALIDACION` o `VALIDADO`.
- Acepta `application/json` o `multipart/form-data`.
- Si se envían archivos en `fotos`, se agregan como nuevas evidencias de la recolección y no reemplazan las anteriores.

**Headers:**
```
x-auth-id: <uuid-supabase>
x-user-role: GENERAL
```

**Content-Type soportados:**
- `application/json`
- `multipart/form-data`

**Body (todos opcionales):**
```json
{
  "fecha": "2026-03-13",
  "cantidad": 3.0,
  "unidad": "kg",
  "tipo_material": "SEMILLA",
  "observaciones": "Actualización de datos",
  "vivero_id": 3,
  "metodo_id": 1
}
```

**Campo adicional en multipart:**

| Campo   | Tipo     | Requerido | Descripción                                      |
|---------|----------|-----------|--------------------------------------------------|
| `fotos` | `File[]` | ❌        | 0 a 5 fotos nuevas (JPG/JPEG/PNG, máx 5MB c/u)  |

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "estado_registro": "BORRADOR",
    "cantidad": 3.0,
    "fotos": [
      {
        "id": 100,
        "url": "https://...jpg",
        "es_principal": true,
        "orden": 0,
        "titulo": "Foto 1"
      }
    ],
    "evidencias": [
      {
        "id": 100,
        "public_url": "https://...jpg",
        "tipo_archivo": "FOTO"
      }
    ]
  }
}
```

**Errores posibles:**

| Código | Cuándo ocurre                           |
|--------|-----------------------------------------|
| `400`  | Estado no permite edición (no es BORRADOR ni RECHAZADO) |
| `400`  | Fotos inválidas o sin parser multipart correcto |
| `403`  | Usuario no tiene permisos               |
| `404`  | Recolección no encontrada               |
| `500`  | Falló la subida o el registro de evidencias y se revirtió la edición |

---

### 3. Enviar a validación

**`PATCH /api/recolecciones/:id/submit`**

Cambia el estado de `BORRADOR` → `PENDIENTE_VALIDACION`.
Solo puede hacerlo el creador de la recolección o un `ADMIN`.

**Headers:**
```
x-auth-id: <uuid-supabase>
x-user-role: GENERAL
```

**Sin body.**

**Respuesta exitosa `200`:**
```json
{
  "id": 42,
  "estado_registro": "PENDIENTE_VALIDACION",
  "mensaje": "Recolección enviada a validación"
}
```

**Errores posibles:**

| Código | Cuándo ocurre                              |
|--------|--------------------------------------------|
| `400`  | Estado no es BORRADOR                      |
| `403`  | No es el creador ni ADMIN                  |
| `404`  | Recolección no encontrada                  |

---

### 4. Aprobar validación *(solo VALIDADOR o ADMIN)*

**`PATCH /api/recolecciones/:id/approve`**

Cambia `PENDIENTE_VALIDACION` → `VALIDADO`.
**Proceso automático al aprobar:**
1. Genera metadata y la sube a Pinata (IPFS)
2. Mintea NFT en blockchain con el CID de IPFS
3. Guarda `token_id`, `transaction_hash` y `blockchain_url` en la BD

**Headers:**
```
x-auth-id: <uuid-supabase>
x-user-role: VALIDADOR
```

**Sin body.**

**Respuesta exitosa `200`:**
```json
{
  "id": 42,
  "estado_registro": "VALIDADO",
  "token_id": "17",
  "transaction_hash": "0xabc123...",
  "blockchain_url": "https://explorer.../tx/0xabc123",
  "ipfs_cid": "bafkrei...",
  "mensaje": "Recolección validada y NFT acuñado exitosamente"
}
```

**Errores posibles:**

| Código | Cuándo ocurre                                        |
|--------|------------------------------------------------------|
| `400`  | Estado no es PENDIENTE_VALIDACION                    |
| `403`  | Rol no es VALIDADOR ni ADMIN                         |
| `404`  | Recolección no encontrada                            |
| `500`  | Error al conectar con Pinata o blockchain            |

> ⚠️ **Nota frontend:** Este endpoint puede tardar varios segundos por la operación blockchain. Mostrar un indicador de carga y no bloquear la UI.

---

### 5. Rechazar validación *(solo VALIDADOR o ADMIN)*

**`PATCH /api/recolecciones/:id/reject`**

Cambia `PENDIENTE_VALIDACION` → `RECHAZADO`. Requiere que se envíe el motivo del rechazo.

**Headers:**
```
x-auth-id: <uuid-supabase>
x-user-role: VALIDADOR
Content-Type: application/json
```

**Body:**
```json
{
  "motivo_rechazo": "Las fotos no son legibles. Volver a subir."
}
```

> `motivo_rechazo` es obligatorio, máx 500 caracteres.

**Respuesta exitosa `200`:**
```json
{
  "id": 42,
  "estado_registro": "RECHAZADO",
  "motivo_rechazo": "Las fotos no son legibles. Volver a subir.",
  "mensaje": "Recolección rechazada"
}
```

---

### 6. Listar recolecciones del usuario

**`GET /api/recolecciones`**

Devuelve las recolecciones del usuario autenticado con paginación.
Siempre filtra por el usuario autenticado, independientemente del rol.

**Headers:**
```
x-auth-id: <uuid-supabase>
```

**Query params (todos opcionales):**

| Param           | Tipo     | Descripción                                  |
|-----------------|----------|----------------------------------------------|
| `page`          | `number` | Número de página (default: 1)               |
| `limit`         | `number` | Registros por página (máx 50, default: 10)  |
| `fecha_inicio`  | `string` | Filtrar desde esta fecha (`YYYY-MM-DD`)     |
| `fecha_fin`     | `string` | Filtrar hasta esta fecha (`YYYY-MM-DD`)     |
| `tipo_material` | `string` | `SEMILLA` o `ESQUEJE`                        |
| `vivero_id`     | `number` | ID del vivero                               |
| `search`        | `string` | Búsqueda por código de trazabilidad         |

**Respuesta exitosa `200`:**
```json
{
  "data": [
    {
      "id": 42,
      "codigo_trazabilidad": "REC-2026-00042",
      "estado_registro": "BORRADOR",
      "fecha": "2026-03-13",
      "cantidad": 3.0,
      "unidad": "kg",
      "tipo_material": "SEMILLA",
      "token_id": null,
      "blockchain_url": null,
      "planta": { "id": 10, "especie": "Polylepis" },
      "usuario": { "id": 5, "nombre": "Juan Pérez" },
      "fotos": ["https://...jpg"]
    }
  ],
  "total": 1,
  "page": 1,
  "totalPages": 1
}
```

---

### 7. Listar recolecciones pendientes de validación

**`GET /api/recolecciones/pending-validation`**

Devuelve solo las recolecciones en estado `PENDIENTE_VALIDACION`.
- `VALIDADOR` o `ADMIN`: ven **todas** las pendientes de todos los usuarios.
- `GENERAL` y `VOLUNTARIO`: ven solo **sus propias** pendientes.

**Headers:**
```
x-auth-id: <uuid-supabase>
x-user-role: VALIDADOR
```

**Query params (todos opcionales):**

| Param          | Tipo     | Descripción                          |
|----------------|----------|--------------------------------------|
| `page`         | `number` | Página (default: 1)                 |
| `limit`        | `number` | Registros por página (máx 50)       |
| `fecha_inicio` | `string` | Rango de fecha inicio               |
| `fecha_fin`    | `string` | Rango de fecha fin                  |
| `search`       | `string` | Búsqueda por código trazabilidad    |

---

### 8. Recolecciones por vivero *(uso interno del módulo vivero)*

**`GET /api/recolecciones/vivero/:viveroId`**

Devuelve **solo las recolecciones `VALIDADAS` con `token_id` asignado** para un vivero específico.

> Este endpoint aplica las reglas de visibilidad del flujo: `estado_registro = 'VALIDADO'` y `token_id IS NOT NULL`.

**Sin headers de autenticación requeridos** (endpoint público de consulta interna).

**Query params (todos opcionales):**

| Param           | Tipo     | Descripción                          |
|-----------------|----------|--------------------------------------|
| `page`          | `number` | Página                              |
| `limit`         | `number` | Registros por página (máx 50)       |
| `fecha_inicio`  | `string` | Rango de fecha inicio               |
| `fecha_fin`     | `string` | Rango de fecha fin                  |
| `tipo_material` | `string` | `SEMILLA` o `ESQUEJE`               |
| `search`        | `string` | Búsqueda por código trazabilidad    |

**Respuesta exitosa `200`:**
```json
{
  "data": [
    {
      "id": 42,
      "codigo_trazabilidad": "REC-2026-00042",
      "estado_registro": "VALIDADO",
      "token_id": "17",
      "blockchain_url": "https://explorer.../tx/0xabc123",
      "fecha": "2026-03-13",
      "cantidad": 3.0,
      "tipo_material": "SEMILLA"
    }
  ],
  "total": 1,
  "page": 1,
  "totalPages": 1
}
```

---

### 9. Detalle de recolección

**`GET /api/recolecciones/:id`**

Devuelve el detalle completo de una recolección.

**Sin headers requeridos.**

**Respuesta exitosa `200`:**
```json
{
  "id": 42,
  "codigo_trazabilidad": "REC-2026-00042",
  "estado_registro": "VALIDADO",
  "fecha": "2026-03-13",
  "cantidad": 3.0,
  "unidad": "kg",
  "tipo_material": "SEMILLA",
  "observaciones": "...",
  "token_id": "17",
  "transaction_hash": "0xabc123...",
  "blockchain_url": "https://explorer.../tx/0xabc123",
  "ipfs_cid": "bafkrei...",
  "planta": { "id": 10, "especie": "Polylepis", "nombre_cientifico": "..." },
  "vivero": { "id": 3, "nombre": "Vivero Central" },
  "metodo": { "id": 1, "nombre": "Manual" },
  "usuario": { "id": 5, "nombre": "Juan Pérez" },
  "ubicacion": { "latitud": -16.5833, "longitud": -68.15, "nombre": "Parcela Don Lucho" },
  "fotos": ["https://...jpg", "https://...jpg"],
  "motivo_rechazo": null
}
```

---

## 🎨 Guía de UI por estado

### Tarjeta / fila en listado

| Estado                 | Color sugerido | Acciones disponibles                                    |
|------------------------|----------------|---------------------------------------------------------|
| `BORRADOR`             | Gris / neutro  | [Editar] [Enviar a validación]                         |
| `PENDIENTE_VALIDACION` | Amarillo       | [Ver detalle] — Sin acciones de edición                 |
| `VALIDADO`             | Verde          | [Ver detalle] [Ver en blockchain]                      |
| `RECHAZADO`            | Rojo           | [Editar] *(al guardar vuelve a BORRADOR)*              |

### Formulario de edición (`PATCH /draft`)

- Mostrar solo si `estado_registro === 'BORRADOR' || estado_registro === 'RECHAZADO'`
- Si `estado_registro === 'RECHAZADO'`, mostrar el `motivo_rechazo` en un banner de alerta antes del formulario
- Al guardar correctamente, actualizar el estado mostrado a `BORRADOR`

### Botón "Enviar a validación"

- Mostrar solo si `estado_registro === 'BORRADOR'`
- Pedir confirmación antes de ejecutar

### Panel de validación *(solo roles VALIDADOR / ADMIN)*

- Mostrar solo si `estado_registro === 'PENDIENTE_VALIDACION'`
- Dos acciones: **Aprobar** y **Rechazar**
- Rechazar requiere un campo de texto obligatorio para el motivo
- Aprobar: mostrar spinner/loading, puede tardar por el proceso blockchain

### Sección blockchain / NFT

- Mostrar bloque de información blockchain solo si `token_id !== null`
- Campos a mostrar: `token_id`, `transaction_hash`, `blockchain_url` (como link externo), `ipfs_cid`

---

## ⚡ Resumen de permisos por endpoint

| Endpoint                  | GENERAL             | VALIDADOR           | VOLUNTARIO      | ADMIN               |
|---------------------------|---------------------|---------------------|-----------------|---------------------|
| `POST /recolecciones`     | ✅ Crear propias    | ❌                  | ❌              | ✅                  |
| `PATCH /:id/draft`        | ✅ Solo propias     | ❌                  | ❌              | ✅ Cualquiera       |
| `PATCH /:id/submit`       | ✅ Solo propias     | ❌                  | ❌              | ✅ Cualquiera       |
| `PATCH /:id/approve`      | ❌                  | ✅                  | ❌              | ✅                  |
| `PATCH /:id/reject`       | ❌                  | ✅                  | ❌              | ✅                  |
| `GET /recolecciones`      | ✅ Solo propias     | ✅ Solo propias     | ✅ Solo propias | ✅ Solo propias     |
| `GET /pending-validation` | ✅ Solo propias     | ✅ **Todas**        | ✅ Solo propias | ✅ **Todas**        |
| `GET /vivero/:viveroId`   | ✅                  | ✅                  | ✅              | ✅                  |
| `GET /:id`                | ✅                  | ✅                  | ✅              | ✅                  |

---

## 📦 Base URL

```
https://<tu-dominio>/api
```

Todos los endpoints de recolecciones tienen el prefijo `/api/recolecciones`.
