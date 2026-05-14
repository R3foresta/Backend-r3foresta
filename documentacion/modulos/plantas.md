# Modulo Plantas

Catalogo de especies vegetales de Reforesta. Mantiene la informacion taxonomica de cada planta y su tipo, sirve de referencia FK para `recoleccion.planta_id` y `lote_vivero.planta_id`.

> Para el end-to-end del proyecto ver [../README.md](../README.md). Para los breaking changes recientes del refactor multipart ver [../../CLAUDE.md](../../CLAUDE.md).

## Base URL

`/api/plantas`

## Conceptos

| Termino | Definicion | Ejemplo |
|---|---|---|
| Especie | Grupo biologico | Papa |
| Nombre cientifico | Nomenclatura binomial | *Solanum tuberosum* |
| Variedad | Subdivision de la especie | Hondureña, Andina |
| Tipo de planta | Clasificacion (Arbol, Arbusto, Hierba, Palma, Enredadera, ...) | catalogo `tipo_planta` |
| `imagen_url` | URL publica del bucket `fotos_plantas` (Supabase Storage) | `https://<proyecto>.supabase.co/storage/v1/object/public/fotos_plantas/swietenia_macrophylla_1737588000000.png` |

La identidad de una planta es `(LOWER(nombre_cientifico), LOWER(variedad))` — indice unico definido en `migrations/005_update_planta_table_structure.sql`.

## Endpoints

| Metodo | Path | Descripcion |
|---|---|---|
| GET | `/api/plantas` | Listado paginado |
| GET | `/api/plantas/:id` | Obtener una planta |
| GET | `/api/plantas/tipos-planta` | Catalogo de tipos |
| POST | `/api/plantas/tipos-planta` | Crear tipo |
| POST | `/api/plantas` | Crear planta (multipart) |
| PATCH | `/api/plantas/:id` | Actualizar planta (multipart) |
| PATCH | `/api/plantas/:id/desactivar` | Soft delete |

> No existe `DELETE /api/plantas/:id` ni `GET /api/plantas/search` — se removieron en el refactor.

### GET `/api/plantas`

Listado paginado del catalogo. Por defecto solo retorna `activo=true`.

**Query**

| Param | Tipo | Default | Descripcion |
|---|---|---|---|
| `q` | string | — | Busqueda parcial en `especie`, `nombre_cientifico`, `nombre_comun_principal`, `nombres_comunes` |
| `page` | int >= 1 | 1 | Pagina |
| `limit` | int >= 1 | 20 | Items por pagina |
| `incluir_inactivas` | bool | false | Incluir plantas desactivadas |
| `tipo_planta_id` | int | — | Filtra por tipo |

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "especie": "Caoba",
      "nombre_cientifico": "Swietenia macrophylla",
      "variedad": "Hondureña",
      "tipo_planta_id": 1,
      "nombre_comun_principal": "Caoba",
      "nombres_comunes": "Caoba, Mahogany",
      "imagen_url": "https://.../fotos_plantas/swietenia_macrophylla_...png",
      "notas": null,
      "activo": true,
      "created_at": "2026-02-04T10:00:00.000Z",
      "updated_at": "2026-05-14T12:34:56.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### GET `/api/plantas/:id`

Retorna una planta por ID. `200` con el objeto en `data`; `404` si no existe.

### GET `/api/plantas/tipos-planta`

```json
{
  "success": true,
  "data": [
    { "id": 1, "nombre": "Arbol", "created_at": "..." },
    { "id": 2, "nombre": "Arbusto", "created_at": "..." }
  ]
}
```

### POST `/api/plantas/tipos-planta`

Crea un tipo. `Content-Type: application/json`.

**Body**

```json
{ "nombre": "Liana" }
```

`201` con el objeto creado. `409` si el nombre ya existe (case-insensitive).

### POST `/api/plantas`

**Content-Type: `multipart/form-data`** (sin esto el body se rechaza).

| Campo | Tipo | Requerido |
|---|---|---|
| `especie` | text | si |
| `nombre_cientifico` | text | si |
| `variedad` | text | si |
| `tipo_planta_id` | text (numerico) | si |
| `nombre_comun_principal` | text | no |
| `nombres_comunes` | text | no |
| `notas` | text | no |
| `imagen` | file (png/jpg/jpeg/webp, max 2MB) | no |

El backend sube `imagen` al bucket `fotos_plantas` y guarda la URL publica en `imagen_url`. Si no se envia imagen, `imagen_url` queda `null`.

**Errores**

- `400`: validacion de campos (incluye tipo MIME / tamaño de imagen).
- `404`: `tipo_planta_id` no existe.
- `409`: planta duplicada por `(nombre_cientifico, variedad)`.

### PATCH `/api/plantas/:id`

`multipart/form-data`. Todos los campos opcionales, incluye `imagen` y `activo`. Solo se actualizan los campos enviados; el resto queda intacto.

Para reactivar una planta desactivada: enviar `activo=true`.

### PATCH `/api/plantas/:id/desactivar`

Soft delete: marca `activo=false`. Las referencias en `recoleccion.planta_id` y `lote_vivero.planta_id` se conservan (no hay borrado fisico). Idempotente.

## Storage de imagenes

Las imagenes viven en el bucket publico **`fotos_plantas`** (provisionado en `migrations/002_create_fotos_plantas_bucket.sql` y reafirmado en `004_create_all_storage_buckets.sql`).

- Solo se acepta el campo file `imagen` en `multipart/form-data`.
- Restricciones: MIME `png|jpg|jpeg|webp`, max 2 MB.
- Nombre generado: `{slug(nombre_cientifico)}_{timestamp}.{ext}`.
- Detalle del flujo: ver [plantas-storage.md](./plantas-storage.md).

## Convenciones

- Metodos del service en español (`listar`, `obtenerPorId`, `crear`, `actualizar`, `desactivar`).
- DTOs con `class-validator` + Swagger inline en el controller.
- Soft delete consistente con `comunidades`.

## Drift conocido

La columna `tipo_planta_id` en `planta` y la tabla `tipo_planta` viven hoy en Supabase pero no estan en `migrations/` (la migracion 005 todavia define el modelo viejo con `tipo_planta` TEXT). Hay un TODO en `migrations/022_planta_soft_delete.sql` para crear la migracion de alineamiento.
