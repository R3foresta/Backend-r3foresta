# Consumo frontend - Recolecciones

Documento operativo para que el equipo de frontend (PWA) y herramientas IA consuman el backend sin inventar campos ni asumir comportamientos.

Referencia interna del backend: [modulos/recolecciones.md](../modulos/recolecciones.md).

## Base URL

```txt
http://localhost:3000/api
```

En producción la URL viene de la variable `VITE_API_URL` (o equivalente) del frontend.

## Autenticación

Todos los endpoints excepto los públicos exigen:

```txt
x-auth-id: <auth_id_de_supabase>
```

Algunos exigen también el rol declarado por el cliente:

```txt
x-user-role: GENERAL | VALIDADOR | ADMIN
```

> El `auth_id` es el **id de Supabase Auth**, no el `id` interno de la tabla `usuario`. El backend resuelve el usuario operativo y valida permisos.

JWT bearer **NO** está vigente para estos endpoints — aunque el módulo `auth` emite JWT, el resto del backend identifica al caller por `x-auth-id`.

## Endpoints disponibles

| HTTP | Ruta | Cuándo usarlo |
|---|---|---|
| POST | `/api/recolecciones` | Crear borrador (paso 1) |
| PATCH | `/api/recolecciones/:id/draft` | Editar borrador antes de enviar a validación |
| PATCH | `/api/recolecciones/:id/submit` | Enviar borrador a la bandeja del validador |
| PATCH | `/api/recolecciones/:id/approve` | Validar (solo VALIDADOR / ADMIN). Dispara IPFS + NFT |
| PATCH | `/api/recolecciones/:id/reject` | Rechazar con motivo (solo VALIDADOR / ADMIN) |
| GET | `/api/recolecciones/pending-validation` | Bandeja del validador |
| GET | `/api/recolecciones` | Lista propia con filtros |
| GET | `/api/recolecciones/vivero/:viveroId` | Recolecciones aptas para un vivero (público) |
| GET | `/api/recolecciones/:id` | Detalle. Pasa `cantidad_solicitada_vivero` para chequear elegibilidad de consumo |

## Flujo recomendado en la UI

```
Pantalla de captura
   │
   ▼
1. POST /api/recolecciones (multipart con fotos)  → id, codigo_trazabilidad, estado_registro=BORRADOR
   │
   ├─► Vista de detalle (puede editar)
   │      └─ PATCH /:id/draft (las veces necesarias)
   │
   ▼
2. PATCH /:id/submit  →  estado_registro=PENDIENTE_VALIDACION
   │
   ▼
Bandeja del validador
   │
   ├─► PATCH /:id/approve  →  VALIDADO + nft minteado
   └─► PATCH /:id/reject   →  RECHAZADO + motivo_rechazo guardado
```

Una vez `VALIDADO`, la recolección **no** se puede editar y queda disponible como origen de lotes de vivero.

## POST /api/recolecciones

```txt
POST /api/recolecciones
Content-Type: multipart/form-data
x-auth-id: <auth_id>
```

Campos FormData:

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `fecha` | string ISO | sí | No futura, no más de 45 días atrás |
| `cantidad_inicial_canonica` | number | sí | ≥ 0.01 |
| `unidad_canonica` | string | sí | `KG`, `G` o `UNIDAD`. `KG` se normaliza a `G` |
| `tipo_material` | string | sí | `SEMILLA` o `ESQUEJE` |
| `planta_id` | number | sí | Catálogo `planta` |
| `metodo_id` | number | sí | Catálogo `metodo_recoleccion` |
| `vivero_id` | number | no | |
| `observaciones` | string | no | máx. 1000 chars |
| `ubicacion` | string JSON | sí | Serializar `CreateUbicacionDto` como JSON en el campo |
| `fotos` | File[] | sí | 1–5 archivos JPG/PNG |

Ejemplo del campo `ubicacion` (serializado como string en el FormData):

```json
{
  "latitud": -16.5833,
  "longitud": -68.15,
  "pais_id": 1,
  "division_id": 999,
  "nombre": "Vivero Central",
  "referencia": "Zona Sur",
  "precision_m": 10,
  "fuente": "GPS_MOVIL"
}
```

> No enviar imágenes en base64 dentro del JSON. Las fotos deben ir como `File[]` en el FormData; el backend las sube a Supabase Storage (`bucket recoleccion_fotos`).

## PATCH /api/recolecciones/:id/draft

Mismos campos que la creación, **todos opcionales**. Solo se aceptan si la recolección sigue en `BORRADOR`. Acepta nuevas `fotos` para reemplazar/añadir.

Header adicional opcional: `x-user-role` (default `GENERAL`).

## PATCH /api/recolecciones/:id/submit

Sin body. Transiciona de `BORRADOR` a `PENDIENTE_VALIDACION`.

## PATCH /api/recolecciones/:id/approve y /:id/reject

Headers obligatorios: `x-auth-id` y `x-user-role` (debe ser `VALIDADOR` o `ADMIN`).

Body de `reject`:

```json
{ "motivo_rechazo": "Datos incompletos o inconsistentes" }
```

`motivo_rechazo`: string 10–500 caracteres.

`approve` ejecuta de forma transaccional: actualización de estado → subida a IPFS via Pinata → mint NFT en blockchain. Si la cadena de blockchain falla, la transición se revierte. Ver [pinata-integracion.md](../modulos/pinata-integracion.md).

## GET /api/recolecciones (lista propia)

Query string admite `FiltersRecoleccionDto`:

| Parámetro | Tipo | Notas |
|---|---|---|
| `fecha_inicio`, `fecha_fin` | ISO date | Rango de captura |
| `vivero_id` | number | |
| `tipo_material` | `SEMILLA \| ESQUEJE` | |
| `q` o `search` | string | Busca en `codigo_trazabilidad`, `observaciones`, snapshots de planta y nombre común |
| `page` | int ≥ 1 | default 1 |
| `limit` | int 1–50 | default 10 |

Filtra automáticamente por el `auth_id` del header. Para ver recolecciones de otros usuarios usa la bandeja de validación o el filtro por vivero.

## GET /api/recolecciones/pending-validation

Mismos filtros + headers `x-auth-id` y `x-user-role` (debe ser VALIDADOR / ADMIN).

## GET /api/recolecciones/:id

Endpoint público (no requiere `x-auth-id`). Query opcional:

| Parámetro | Tipo | Para qué |
|---|---|---|
| `cantidad_solicitada_vivero` | number > 0 | Devuelve flag `elegible_para_vivero` chequeando saldo y reglas |

Forma de la respuesta (campos clave):

```json
{
  "id": 123,
  "codigo_trazabilidad": "REC-2026-0001",
  "fecha": "2026-03-04",
  "tipo_material": "SEMILLA",
  "cantidad_inicial_canonica": 60,
  "unidad_canonica": "G",
  "saldo_actual": 60,
  "estado_operativo": "DISPONIBLE",
  "estado_registro": "VALIDADO",
  "blockchain_url": "ipfs://bafkrei...",
  "token_id": "42",
  "transaction_hash": "0x...",
  "usuario": { "id": 1, "nombre": "Jhamil", "username": "jhamil", "correo": "..." },
  "vivero": { "id": 3, "codigo": "VIV-01", "nombre": "Central" },
  "metodo": { "id": 1, "nombre": "Manual" },
  "planta": {
    "id": 10,
    "especie": "Pinus radiata",
    "nombre_cientifico": "Pinus radiata",
    "variedad": "—",
    "nombre_comun_principal": "Pino",
    "imagen_url": "https://..."
  }
}
```

## Errores comunes

| HTTP | Causa frecuente |
|---|---|
| 400 | DTO inválido, `forbidNonWhitelisted` rechaza campos extra, fecha futura |
| 401 | Falta `x-auth-id` |
| 403 | Rol insuficiente (intento de aprobar sin VALIDADOR/ADMIN, edición de recolección ajena) |
| 404 | `id` no existe |
| 409 | Transición de estado inválida (p.ej. `approve` sobre un `BORRADOR`) |

## Notas para IA / agentes

- El backend usa `whitelist: true, forbidNonWhitelisted: true` (ver [main.ts](../../src/main.ts)). Cualquier campo no documentado en el DTO devolverá 400.
- Los identificadores son en español. No traducir `tipo_material`, `cantidad_inicial_canonica`, `unidad_canonica`, etc.
- Para crear lotes de vivero a partir de una recolección, ver [frontend/lotes-vivero.md](./lotes-vivero.md).
