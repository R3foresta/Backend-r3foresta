# Pruebas Postman — Plantas

Cookbook para probar el CRUD de plantas contra el backend local. Para el contrato detallado ver [../modulos/plantas.md](../modulos/plantas.md).

> Todos los endpoints son hoy publicos (no exigen `x-auth-id`). Cuando se introduzca el guard global esto cambiara.

## Pre-condiciones

- Backend corriendo en `http://localhost:3000` (`npm run start:dev`).
- Migracion `022_planta_soft_delete.sql` aplicada en Supabase (agrega `activo` y `updated_at`).
- Bucket `fotos_plantas` existente (provisionado en `002_create_fotos_plantas_bucket.sql`).

## 1. Listar plantas

```
GET http://localhost:3000/api/plantas?page=1&limit=20&incluir_inactivas=false
```

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "especie": "Caoba",
      "nombre_cientifico": "Swietenia macrophylla",
      "variedad": "Hondureña",
      "tipo_planta_id": 1,
      "nombre_comun_principal": "Caoba",
      "nombres_comunes": "Caoba, Mahogany",
      "imagen_url": "https://xxx.supabase.co/storage/v1/object/public/fotos_plantas/swietenia_macrophylla_1737588000000.png",
      "notas": null,
      "activo": true,
      "created_at": "2026-02-04T10:00:00.000Z",
      "updated_at": "2026-05-14T12:34:56.000Z"
    }
  ],
  "pagination": {
    "page": 1, "limit": 20, "total": 1,
    "totalPages": 1, "hasNextPage": false, "hasPrevPage": false
  }
}
```

### Variantes de filtro

```
GET /api/plantas?q=caoba
GET /api/plantas?tipo_planta_id=1
GET /api/plantas?incluir_inactivas=true
GET /api/plantas?page=2&limit=50
```

## 2. Obtener una planta

```
GET http://localhost:3000/api/plantas/1
```

`200` con `{ success, data }`, `404` si no existe.

## 3. Listar tipos de planta

```
GET http://localhost:3000/api/plantas/tipos-planta
```

```json
{
  "success": true,
  "data": [
    { "id": 1, "nombre": "Arbol", "created_at": "..." },
    { "id": 2, "nombre": "Arbusto", "created_at": "..." }
  ]
}
```

## 4. Crear tipo de planta

```
POST http://localhost:3000/api/plantas/tipos-planta
Content-Type: application/json

{ "nombre": "Liana" }
```

`201` con el objeto creado. `409` si ya existe (case-insensitive).

## 5. Crear planta (multipart)

> Importante: en Postman, en la pestaña Body elegir **form-data**, NO `x-www-form-urlencoded` ni `raw`.

```
POST http://localhost:3000/api/plantas
Content-Type: multipart/form-data
```

| Key | Tipo | Value |
|---|---|---|
| `especie` | Text | `Caoba` |
| `nombre_cientifico` | Text | `Swietenia macrophylla` |
| `variedad` | Text | `Hondureña` |
| `tipo_planta_id` | Text | `1` |
| `nombre_comun_principal` | Text | `Caoba` (opcional) |
| `nombres_comunes` | Text | `Caoba, Mahogany` (opcional) |
| `notas` | Text | `Madera fina` (opcional) |
| `imagen` | **File** | `caoba.png` (opcional) |

```bash
curl -X POST http://localhost:3000/api/plantas \
  -F "especie=Caoba" \
  -F "nombre_cientifico=Swietenia macrophylla" \
  -F "variedad=Hondurena" \
  -F "tipo_planta_id=1" \
  -F "imagen=@./caoba.png"
```

**Response 201**

```json
{
  "success": true,
  "message": "Planta creada exitosamente",
  "data": { "id": 5, "especie": "Caoba", "...": "..." }
}
```

### Errores comunes

| Caso | Status | Body |
|---|---|---|
| Campos faltantes | 400 | `{ "message": ["especie es requerida", ...] }` |
| `tipo_planta_id` inexistente | 404 | `{ "message": "No existe un tipo de planta con ID 999. ..." }` |
| Duplicado (`nombre_cientifico` + `variedad`) | 409 | `{ "message": "Ya existe una planta con nombre cientifico ... y variedad ..." }` |
| Imagen > 2MB | 400 | `Validation failed (current file size is X, expected size is less than 2097152)` |
| MIME no permitido | 400 | `Validation failed (expected type is .(png\|jpeg\|jpg\|webp))` |

## 6. Actualizar planta

`PATCH /api/plantas/:id` — mismo formato que crear, todo opcional. Solo enviar los campos que cambian.

```bash
curl -X PATCH http://localhost:3000/api/plantas/5 \
  -F "notas=Especie de la familia Meliaceae" \
  -F "imagen=@./caoba_nueva.png"
```

Para reactivar una planta desactivada:

```bash
curl -X PATCH http://localhost:3000/api/plantas/5 \
  -F "activo=true"
```

## 7. Desactivar planta (soft delete)

```
PATCH http://localhost:3000/api/plantas/5/desactivar
```

`200` con el objeto actualizado (`activo: false`). Idempotente: si ya estaba desactivada, devuelve el estado actual sin error.

## Tips

- Si el cliente HTTP no agrega el `Content-Type: multipart/form-data; boundary=...` automaticamente, **no setearlo a mano**. Dejar que el SDK/browser lo genere.
- Para probar busqueda fuzzy: `?q=swiet` debe encontrar "Swietenia macrophylla".
- Para limpiar imagenes huerfanas en Storage ver [../modulos/plantas-storage.md](../modulos/plantas-storage.md).
