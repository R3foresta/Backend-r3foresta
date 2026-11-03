# Consumo frontend - Recolecciones

Documento operativo para que el equipo de frontend (PWA) y herramientas IA consuman el backend sin inventar campos ni asumir comportamientos.

Referencia interna del backend: [modulos/recolecciones.md](../modulos/recolecciones.md).

## Base URL

```txt
http://localhost:3000/api
```

En producción la URL viene de la variable `VITE_API_URL` (o equivalente) del frontend.

## Autenticación

Todas las rutas de `/api/recolecciones` requieren el JWT emitido por WebAuthn:

```txt
Authorization: Bearer <token>
```

`InternalActorGuard` verifica el JWT y resuelve cuenta activa y rol en el servidor.
La audiencia interna incluye `ADMIN`, `GENERAL` y `VALIDADOR`; las reglas de cada
operación siguen aplicándose. `x-auth-id` es opcional y, si se envía, debe coincidir
con `sub`. `x-user-role` no concede permisos: el guard lo deriva de la cuenta.

Abrir la URL directamente en la barra del navegador no agrega el Bearer almacenado
por la PWA y devuelve 401. Un 500 con `Error al obtener evidencias de recolecciones`
corresponde a una lectura posterior a la autenticación en el backend.

## Endpoints disponibles

| HTTP | Ruta | Cuándo usarlo |
|---|---|---|
| POST | `/api/recolecciones` | Crear borrador (paso 1) |
| PATCH | `/api/recolecciones/:id/draft` | Editar borrador antes de enviar a validación |
| DELETE | `/api/recolecciones/:id` | Eliminar lógicamente un `BORRADOR` propio (o cualquiera si es ADMIN) |
| PATCH | `/api/recolecciones/:id/submit` | Enviar borrador a la bandeja del validador |
| PATCH | `/api/recolecciones/:id/approve` | Validar (solo VALIDADOR / ADMIN). Dispara IPFS + NFT |
| PATCH | `/api/recolecciones/:id/reject` | Rechazar con motivo (solo VALIDADOR / ADMIN) |
| GET | `/api/recolecciones/pending-validation` | Bandeja del validador |
| GET | `/api/recolecciones` | Lista propia con filtros |
| GET | `/api/recolecciones/vivero/:viveroId` | Recolecciones aptas para un vivero (cuenta interna) |
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

## DELETE /api/recolecciones/:id — RN-REC-09A

Disponible en el código local del 3 de noviembre de 2026. Antes de consumirla en
un entorno desplegado, aplicar/cotejar la [migración 089](../../migrations/089_recoleccion_eliminar_borrador.sql)
y publicar este backend. Requiere los antecedentes de historial 014, fechas DATE
de 015 y cuenta
activa (`usuario.activo`), además de los permisos privados del servicio.

```ts
const response = await fetch(`${API_URL}/recolecciones/${id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` },
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
// Quitar el registro de la lista y volver a consultar su paginación/resumen.
```

`API_URL` incluye `/api`. No se envía body, motivo, usuario, fecha ni rol.
El actor proviene del JWT verificado y el servidor vuelve a comprobar su cuenta,
rol y propiedad dentro de la transacción. Audiencia: cuenta interna activa
(`GENERAL`, `VALIDADOR`, `ADMIN`); permiso por objeto: creador o `ADMIN`.

Respuesta `200`:

```json
{
  "success": true,
  "data": {
    "recoleccion_id": 292,
    "eliminado_en": "2026-11-03",
    "eliminado_por_usuario_id": 7
  }
}
```

| HTTP | Comportamiento |
|---|---|
| 400 | ID inválido: debe ser entero positivo seguro |
| 401 | Bearer ausente/inválido o `x-auth-id` no coincide con la sesión |
| 403 | Cuenta inactiva, rol fuera de la audiencia o registro ajeno sin ADMIN |
| 404 | Registro inexistente o ya eliminado; incluye repetir el DELETE |
| 409 | Ya no está en `BORRADOR`, o hay conflicto concurrente; refrescar antes de reintentar |
| 500 | Fallo interno; si el resultado es incierto, releer antes de repetir |

Mostrar la acción solo en `BORRADOR` cuando la cuenta sea creadora o `ADMIN`.
El backend valida siempre estas condiciones. `RECHAZADO` no puede eliminarse
directamente mediante esta ruta.

El soft delete conserva el estado `BORRADOR`, código, ficha, snapshots, ubicación
y fotos. Solo marca `eliminado_en`/`eliminado_por_usuario_id` y agrega el evento
append-only `BORRADOR_ELIMINADO` con el mismo actor/fecha en una transacción.
`eliminado_en` es el día de negocio en `America/La_Paz` (`YYYY-MM-DD`), coherente
con lo persistido en 015. No representa una hora exacta.
No hay consumo ni cambio de saldo. No existe restauración en este contrato.
Listas, detalle privado, resumen y banco público de semillas excluyen los eliminados;
editar/enviar a validación un eliminado devuelve no encontrado al releerlo.
No se reutilizan códigos de trazabilidad.

Una carga de fotos iniciada antes del DELETE puede terminar después: si la
vinculación aún no confirmó, SQL la rechaza con 404 y el backend intenta retirar
solo esos archivos nuevos. Si las fotos confirmaron antes, se conservan junto
con el registro eliminado. Un fallo de transporte conserva archivos hasta
conciliar el resultado. La limpieza de una creación fallida tampoco borra una
ficha eliminada ni con historia confirmada.

[Verificación local, concurrencia y límites](../../docs/recoleccion-soft-delete.md).

## POST /api/recolecciones

```txt
POST /api/recolecciones
Content-Type: multipart/form-data
Authorization: Bearer <token>
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
| `fotos` | File[] | sí | 2–10 archivos JPG/JPEG/PNG/WEBP/HEIC/HEIF |

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

Mismos campos de datos que la creación, **todos opcionales**, para una recolección
en `BORRADOR` o `RECHAZADO` y con permiso de edición. Editar un `RECHAZADO` lo
devuelve a `BORRADOR`; después se llama a `PATCH /:id/submit` para reenviarlo.
El rol se resuelve desde la cuenta verificada en el servidor.

`ubicacion` es opcional. Si se omite, se conserva la actual; si se envía, requiere
`latitud` y `longitud` y valida los demás campos como en creación. Se acepta objeto
en JSON, texto JSON en el campo multipart `ubicacion` o campos multipart
`ubicacion[latitud]`, `ubicacion[longitud]`, etc. Enviar solo una representación.
No se admite `ubicacion: null`, escalares, arrays ni campos extra.

Cambiar solo la fecha funciona aunque la PWA vuelva a enviar la misma ubicación:
se conserva su ID sin modificarla. Una ubicación distinta crea una nueva referencia
para esta recolección y refresca el snapshot de comunidad; la ubicación anterior se
conserva porque puede estar compartida o ser histórica.

Las nuevas `fotos` se **añaden** a las existentes. Omitirlas conserva las fotos
guardadas; corregir la fecha no requiere volver a subirlas. Esperar el éxito del
PATCH antes de llamar a `submit`; un error de edición debe impedir el reenvío.

## PATCH /api/recolecciones/:id/submit

Sin body. Transiciona de `BORRADOR` a `PENDIENTE_VALIDACION`.

## PATCH /api/recolecciones/:id/approve y /:id/reject

Requiere Bearer y rol `VALIDADOR` o `ADMIN` verificado por el servidor.

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

Filtra automáticamente por la identidad verificada del JWT, también para `ADMIN`.
Para ver recolecciones de otros usuarios usa la bandeja de validación o el filtro por vivero.

## GET /api/recolecciones/pending-validation

Mismos filtros y Bearer. `VALIDADOR` y `ADMIN` ven pendientes globales;
las demás cuentas internas ven los propios.

## GET /api/recolecciones/:id

Requiere Bearer y cuenta interna. Query opcional:

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
