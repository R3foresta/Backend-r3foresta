# Módulo: Organizaciones

Base URL: `/api/organizaciones`

---

## POST /organizaciones 📎

**Rol mínimo**: ADMIN  
**Descripción**: Crea una nueva organización. El logo es opcional pero recomendado.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `multipart/form-data` (si hay logo) o `application/json` |

**Body** (`multipart/form-data` o `application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| nombre | string | ✓ | min 2, max 200, unique (case-insensitive) |
| tipo | TipoOrganizacion enum | ✓ | ONG, EMPRESA_PRIVADA, EMPRESA_PUBLICA, FUNDACION, ETFs, ALCALDIA, ASOCIACION_CIUDADANA, OTRO |
| activo | boolean | — | Default: true |
| logo | file | — | max 2 MB, PNG/JPEG/WebP (solo si multipart) |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Fundación Verde Andina",
    "tipo": "FUNDACION",
    "activo": true,
    "logo_url": "https://supabase.../organizaciones/1/logo.jpg?v=1716920000000",
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida: tipo no válido, archivo incorrecto |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 409 | Ya existe una organización con ese nombre |

**Ejemplos cURL**

Sin logo (JSON):
```bash
curl -X POST http://localhost:3000/api/organizaciones \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "nombre": "Fundación Verde Andina",
    "tipo": "FUNDACION",
    "activo": true
  }'
```

Con logo (multipart):
```bash
curl -X POST http://localhost:3000/api/organizaciones \
  -H "x-auth-id: <tu-auth-id>" \
  -F "nombre=Fundación Verde Andina" \
  -F "tipo=FUNDACION" \
  -F "logo=@/path/to/logo.jpg"
```

---

## GET /organizaciones

**Rol mínimo**: GENERAL  
**Descripción**: Lista todas las organizaciones, con filtros opcionales.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| activo | boolean | — | Filtrar por estado (true/false, 1/0) |
| tipo | TipoOrganizacion | — | Filtrar por tipo |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nombre": "Fundación Verde Andina",
      "tipo": "FUNDACION",
      "activo": true,
      "logo_url": "https://supabase.../organizaciones/1/logo.jpg?v=1716920000000",
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    },
    {
      "id": 2,
      "nombre": "ONG Reforestación Bolivia",
      "tipo": "ONG",
      "activo": true,
      "logo_url": null,
      "created_at": "2026-05-27T15:00:00Z",
      "updated_at": "2026-05-27T15:00:00Z"
    }
  ]
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Filtro activo o tipo inválido |
| 401 | Header x-auth-id ausente |

**Ejemplo cURL**
```bash
curl -X GET "http://localhost:3000/api/organizaciones?activo=true&tipo=FUNDACION" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /organizaciones/:id

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene detalle completo de una organización.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la organización |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Fundación Verde Andina",
    "tipo": "FUNDACION",
    "activo": true,
    "logo_url": "https://supabase.../organizaciones/1/logo.jpg?v=1716920000000",
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Organización no encontrada |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/organizaciones/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## PATCH /organizaciones/:id

**Rol mínimo**: ADMIN  
**Descripción**: Edita datos de una organización (nombre, tipo, estado).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la organización |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| nombre | string | — | min 2, max 200, unique |
| tipo | TipoOrganizacion | — | Enum válido |
| activo | boolean | — | true/false (archivar/reactivar) |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Fundación Verde Andina - Actualizada",
    "tipo": "FUNDACION",
    "activo": true,
    "logo_url": "https://supabase.../organizaciones/1/logo.jpg?v=1716920000000",
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T11:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Organización no encontrada |
| 409 | Nombre duplicado |

**Ejemplo cURL**
```bash
curl -X PATCH http://localhost:3000/api/organizaciones/1 \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "nombre": "Fundación Verde Andina - Nueva",
    "activo": true
  }'
```

---

## DELETE /organizaciones/:id

**Rol mínimo**: ADMIN  
**Descripción**: Elimina una organización. Si no tiene campañas asociadas hace hard delete; si está ligada a una o más campañas hace soft delete marcando `activo=false`.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la organización |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Organizacion archivada correctamente porque tiene campañas asociadas.",
    "id": 1,
    "metodo": "soft_delete",
    "referencias": 2,
    "organizacion": {
      "id": 1,
      "nombre": "Fundación Verde Andina",
      "tipo": "FUNDACION",
      "activo": false,
      "logo_url": "https://supabase.../organizaciones/1/logo.jpg?v=1716920000000",
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T13:00:00Z"
    }
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Organización no encontrada |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/organizaciones/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /organizaciones/:id/logo 📎

**Rol mínimo**: ADMIN  
**Descripción**: Sube o reemplaza el logo de una organización.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `multipart/form-data` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la organización |

**Body** (`multipart/form-data`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| logo | file | ✓ | max 2 MB, PNG/JPEG/WebP |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "logo_url": "https://supabase.../organizaciones/1/logo.jpg?v=1716920000000",
    "updated_at": "2026-05-28T12:30:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Archivo inválido o demasiado grande |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Organización no encontrada |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/organizaciones/1/logo \
  -H "x-auth-id: <tu-auth-id>" \
  -F "logo=@/path/to/logo.jpg"
```

---

## DELETE /organizaciones/:id/logo

**Rol mínimo**: ADMIN  
**Descripción**: Elimina el logo de una organización.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la organización |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "logo_url": null,
    "updated_at": "2026-05-28T13:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Organización no encontrada |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/organizaciones/1/logo \
  -H "x-auth-id: <tu-auth-id>"
```

---

## Tipos & Estructuras

### TipoOrganizacion
```
ONG | EMPRESA_PRIVADA | EMPRESA_PUBLICA | FUNDACION | ETFs | 
ALCALDIA | ASOCIACION_CIUDADANA | OTRO
```

### Organización
```typescript
{
  id: number;
  nombre: string;
  tipo: TipoOrganizacion;
  activo: boolean;
  logo_url?: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```

---

## Reglas de Negocio

1. **Nombre único**: Case-insensitive, constraint en BD.
2. **Logo**: Reemplaza automáticamente al subir uno nuevo. URL con cache-busting (`?v=timestamp`).
3. **Borrado híbrido**: `DELETE` hace hard delete si no hay vínculos con campañas; si existen vínculos, marca `activo=false`.
4. **ADMIN only**: Creación, edición, y eliminación requieren rol ADMIN.
5. **Activo default**: Nueva organización se crea con `activo=true`.

---

## Flujo Típico

1. **POST** → Crea organización con datos básicos
2. **POST /logo** → Sube logo
3. **GET** → Lista para selectores en campañas
4. **PATCH** → Actualiza información
5. **DELETE /logo** → Elimina logo si es necesario
6. **DELETE** → Hard delete o soft delete según vínculos con campañas
