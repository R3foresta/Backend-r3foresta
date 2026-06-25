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
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    },
    {
      "id": 2,
      "nombre": "Arborización Sur 2026",
      "tipo": "ARBORIZACION",
      "codigo_trazabilidad": "CMP-2026-002",
      "descripcion": null,
      "fecha_estimada_inicio": null,
      "fecha_estimada_fin": null,
      "created_at": "2026-05-27T15:00:00Z",
      "updated_at": "2026-05-27T15:00:00Z"
    }
  ]
}
```

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
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

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
**Descripción**: Lista las subcampañas de una campaña específica. Es equivalente a `GET /subcampanias?campania_id=:id`, pero valida primero que la campaña exista.

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
      "tipo": "PLANTACION",
      "estado": "BORRADOR",
      "fase_mantenimiento": "NO_APLICA",
      "zona_id": 10,
      "area_hectareas": null,
      "meta_total_arboles": 500,
      "codigo_trazabilidad": "SUB-001-CMP-2026-001",
      "total_plantado_inicial": 0,
      "total_repuesto": 0,
      "total_muerto_acumulado": 0,
      "saldo_vivo_actual": 0,
      "coordinador": {
        "id": 7,
        "nombre": "Coord Pepe"
      },
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

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

## PATCH /campanias/:id

**Rol mínimo**: ADMIN  
**Descripción**: Edita datos de una campaña (nombre, tipo, descripción, fechas).

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
| nombre | string | — | min 3, max 200, unique |
| tipo | TipoCampania | — | Enum válido |
| descripcion | string | — | max 1000 caracteres |
| fecha_estimada_inicio | string | — | ISO date, <= fecha_fin |
| fecha_estimada_fin | string | — | ISO date, >= fecha_inicio |

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
| 404 | Campaña no encontrada |
| 409 | Nombre duplicado |

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
**Descripción**: Elimina una campaña.

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
    "message": "Campaña eliminada correctamente."
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Campaña no encontrada |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/campanias/1 \
  -H "x-auth-id: <tu-auth-id>"
```

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
4. **ADMIN only**: Creación, edición, asociaciones requieren rol ADMIN.
5. **Soft associations**: Desasociar no elimina la organización, solo quita la relación.

---

## Flujo Típico

1. **POST** → Crea campaña
2. **POST /organizaciones** → Asocia organizaciones
3. **GET** → Lista para selectores en subcampañas
4. **GET /:id/subcampanias** → Lista subcampañas de la campaña
5. **PATCH** → Actualiza detalles
6. **DELETE /organizaciones/:id** → Desasocia org si es necesario
7. **DELETE** → Elimina campaña
