# Módulo: Ubicaciones

Base URL: `/api/ubicaciones`

---

## GET /ubicaciones/paises

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene el catálogo de países habilitados. Se usa como raíz para jerarquía de divisiones.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario autenticado |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nombre": "Bolivia",
      "codigo_iso2": "BO"
    },
    {
      "id": 2,
      "nombre": "Perú",
      "codigo_iso2": "PE"
    },
    {
      "id": 3,
      "nombre": "Colombia",
      "codigo_iso2": "CO"
    }
  ]
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 500 | Error interno del servidor |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/ubicaciones/paises \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /ubicaciones/divisiones

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene divisiones administrativas (Departamento → Provincia → Municipio → Localidad/Comunidad) de forma jerárquica.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario autenticado |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| pais_id | number | ✓ | ID del país (obtenido de /paises) |
| parent_id | number | — | ID de la división padre. Si se omite, retorna divisiones raíz (nivel top) |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "pais_id": 1,
      "parent_id": null,
      "tipo_id": 1,
      "tipo_nombre": "Departamento",
      "tipo_orden": 1,
      "nombre": "La Paz"
    },
    {
      "id": 11,
      "pais_id": 1,
      "parent_id": null,
      "tipo_id": 1,
      "tipo_nombre": "Departamento",
      "tipo_orden": 1,
      "nombre": "Cochabamba"
    }
  ]
}
```

**Campo `tipo_orden`**: Define la jerarquía (1 = Departamento, 2 = Provincia, 3 = Municipio, etc.)

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | `pais_id` inválido o no es entero |
| 401 | Header x-auth-id ausente |
| 500 | Error interno del servidor |

**Ejemplos cURL**

Obtener divisiones raíz (sin parent_id):
```bash
curl -X GET "http://localhost:3000/api/ubicaciones/divisiones?pais_id=1" \
  -H "x-auth-id: <tu-auth-id>"
```

Obtener subdivisiones de un departamento:
```bash
curl -X GET "http://localhost:3000/api/ubicaciones/divisiones?pais_id=1&parent_id=10" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /ubicaciones/divisiones/flexible

**Rol mínimo**: GENERAL  
**Descripción**: Busca una división por nombre bajo un parent_id. Si existe, la retorna. Si no existe, la crea automáticamente con tipo flexible (Localidad/Comunidad).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario autenticado |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| pais_id | number | ✓ | ID del país |
| parent_id | number | ✓ | ID de la división padre (debe existir) |
| nombre | string | ✓ | max 200; búsqueda case-insensitive |

**Respuesta exitosa - Recuperada (200)**
```json
{
  "success": true,
  "data": {
    "id": 150,
    "pais_id": 1,
    "parent_id": 10,
    "tipo_id": 4,
    "nombre": "Mi Comunidad"
  },
  "created": false
}
```

**Respuesta exitosa - Creada (201)**
```json
{
  "success": true,
  "data": {
    "id": 151,
    "pais_id": 1,
    "parent_id": 10,
    "tipo_id": 4,
    "nombre": "Nueva Comunidad"
  },
  "created": true
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Datos inválidos; parent_id no pertenece a pais_id |
| 401 | Header x-auth-id ausente |
| 404 | División padre o tipo no encontrado |
| 500 | Error interno del servidor |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/ubicaciones/divisiones/flexible \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "pais_id": 1,
    "parent_id": 10,
    "nombre": "Mi Comunidad"
  }'
```

---

## Tipos & Estructuras

### Pais
```typescript
{
  id: number;
  nombre: string;
  codigo_iso2: string;
}
```

### Division Administrativa
```typescript
{
  id: number;
  pais_id: number;
  parent_id: number | null;
  tipo_id: number;
  tipo_nombre?: string;
  tipo_orden?: number;
  nombre: string;
}
```

---

## Reglas de Negocio

1. **Jerarquía**: Divisiones se organizan por niveles (departamento → provincia → municipio → localidad).
2. **parent_id**: `null` para divisiones raíz; number para subdivisiones.
3. **tipo_id**: Determina el nivel jerárquico (orden).
4. **Búsqueda flexible**: Case-insensitive, trimmed, respeta unicidad bajo parent_id.
5. **Auto-creación**: Si la división flexible no existe, se crea con tipo "Localidad/Comunidad".

---

## Flujo Típico

1. **GET /paises** → Obtiene lista de países
2. **GET /divisiones?pais_id=1** → Obtiene departamentos
3. **GET /divisiones?pais_id=1&parent_id=10** → Obtiene provincias de La Paz
4. **POST /divisiones/flexible** → Crea/recupera comunidad específica si no existe
