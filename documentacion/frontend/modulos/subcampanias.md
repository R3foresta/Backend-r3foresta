# Módulo: Subcampañas

Base URL: `/api/subcampanias`

---

## POST /subcampanias

**Rol mínimo**: GENERAL  
**Descripción**: Crea una subcampaña en estado BORRADOR dentro de una campaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| campania_id | number | ✓ | ID de campaña existente |
| nombre | string | ✓ | min 3, max 200 |
| descripcion | string | — | max 1000 caracteres |
| zona_id | number | ✓ | ID de división administrativa (ubicación) |
| meta_total_arboles | number | ✓ | >= 1 |
| fecha_estimada_inicio | string | — | ISO date (YYYY-MM-DD) |
| fecha_estimada_fin | string | — | ISO date |
| tolerancia_gps_metros | number | — | Default: 50; min 1 |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "campania_id": 1,
    "nombre": "Subcampaña Zona A",
    "descripcion": "Plantación en zona A de La Paz",
    "zona_id": 10,
    "meta_total_arboles": 1000,
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-08-31",
    "tolerancia_gps_metros": 50,
    "estado": "BORRADOR",
    "fase_mantenimiento": "NO_APLICA",
    "poligono": null,
    "saldo_vivo_actual": 1000,
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

**Campos GENERATED** (solo lectura):
- `estado`: "BORRADOR"
- `fase_mantenimiento`: "NO_APLICA"
- `saldo_vivo_actual`: Calculado en BD

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida |
| 401 | Header x-auth-id ausente |
| 404 | Campaña o zona no encontrada |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/subcampanias \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "campania_id": 1,
    "nombre": "Subcampaña Zona A",
    "zona_id": 10,
    "meta_total_arboles": 1000,
    "fecha_estimada_inicio": "2026-06-01",
    "tolerancia_gps_metros": 50
  }'
```

---

## GET /subcampanias

**Rol mínimo**: GENERAL  
**Descripción**: Lista subcampañas con filtros opcionales.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| campania_id | number | — | Filtrar por campaña |
| estado | string | — | Filtrar por estado (BORRADOR, ACTIVA, etc.) |
| zona_id | number | — | Filtrar por zona |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "campania_id": 1,
      "nombre": "Subcampaña Zona A",
      "estado": "ACTIVA",
      "zona_id": 10,
      "meta_total_arboles": 1000,
      "saldo_vivo_actual": 750,
      "fase_mantenimiento": "MANTENIMIENTO_ACTIVO",
      "created_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

**Ejemplo cURL**
```bash
curl -X GET "http://localhost:3000/api/subcampanias?campania_id=1&estado=ACTIVA" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /subcampanias/:id

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene detalle completo de una subcampaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "campania_id": 1,
    "nombre": "Subcampaña Zona A",
    "descripcion": "Plantación en zona A",
    "zona_id": 10,
    "meta_total_arboles": 1000,
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-08-31",
    "tolerancia_gps_metros": 50,
    "estado": "ACTIVA",
    "fase_mantenimiento": "MANTENIMIENTO_ACTIVO",
    "poligono": {
      "type": "Polygon",
      "coordinates": [[[-68.1193, -16.2902], [-68.1190, -16.2910], ...]]
    },
    "saldo_vivo_actual": 750,
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/subcampanias/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## PATCH /subcampanias/:id

**Rol mínimo**: GENERAL  
**Descripción**: Edita datos de una subcampaña (solo en estado BORRADOR o PAUSADA).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| nombre | string | — | min 3, max 200 |
| descripcion | string | — | max 1000 |
| zona_id | number | — | Division administrativa válida |
| meta_total_arboles | number | — | >= 1 |
| fecha_estimada_inicio | string | — | ISO date |
| fecha_estimada_fin | string | — | ISO date |
| tolerancia_gps_metros | number | — | >= 1 |
| observaciones_cierre | string | — | max 2000 (para cierre parcial) |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "campania_id": 1,
    "nombre": "Subcampaña Zona A - Actualizada",
    "meta_total_arboles": 1200,
    ...
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida |
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |
| 422 | Subcampaña en estado no editable |

**Ejemplo cURL**
```bash
curl -X PATCH http://localhost:3000/api/subcampanias/1 \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "nombre": "Subcampaña Zona A - Nueva",
    "meta_total_arboles": 1200
  }'
```

---

## POST /subcampanias/:id/poligono

**Rol mínimo**: GENERAL  
**Descripción**: Establece el polígono GeoJSON de la zona de la subcampaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| poligono | GeoJSON | ✓ | Polygon con `type: "Polygon"`, coordinates: [[[lng, lat], ...]] |

**Ejemplo de Body**
```json
{
  "poligono": {
    "type": "Polygon",
    "coordinates": [
      [
        [-68.1193, -16.2902],
        [-68.1190, -16.2910],
        [-68.1180, -16.2905],
        [-68.1193, -16.2902]
      ]
    ]
  }
}
```

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "poligono": {
      "type": "Polygon",
      "coordinates": [[[-68.1193, -16.2902], ...]]
    },
    "updated_at": "2026-05-28T10:30:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | GeoJSON inválido |
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/subcampanias/1/poligono \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "poligono": {
      "type": "Polygon",
      "coordinates": [[[-68.1193, -16.2902], [-68.1190, -16.2910], [-68.1180, -16.2905], [-68.1193, -16.2902]]]
    }
  }'
```

---

## POST /subcampanias/:id/activar

**Rol mínimo**: GENERAL  
**Descripción**: Activa una subcampaña (transición: BORRADOR → ACTIVA).

**Pre-condiciones**:
- Estado actual: BORRADOR
- Debe tener poligono seteado
- Debe tener meta_total_arboles >= 1

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "estado": "ACTIVA",
    "fase_mantenimiento": "NO_APLICA",
    "updated_at": "2026-05-28T11:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |
| 422 | No cumple pre-condiciones (sin polígono, estado no es BORRADOR) |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/subcampanias/1/activar \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /subcampanias/:id/cerrar

**Rol mínimo**: GENERAL  
**Descripción**: Cierra una subcampaña (transición: ACTIVA → COMPLETADA o FINALIZADA_PARCIAL).

**Pre-condiciones**:
- Estado actual: ACTIVA
- Debe setearse estado_final (COMPLETADA o FINALIZADA_PARCIAL)
- Si FINALIZADA_PARCIAL, debe indicarse motivo_cierre_parcial

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| estado_final | enum | ✓ | COMPLETADA, FINALIZADA_PARCIAL |
| fecha_cierre_operativo | string | ✓ | ISO date |
| fecha_fin_mantenimiento | string | ✓ | ISO date |
| motivo_cierre_parcial | MotivoCierreParcial | ✓ si PARCIAL | Enum válido |
| observaciones_cierre | string | — | max 2000 caracteres |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "estado": "COMPLETADA",
    "fase_mantenimiento": "MONITOREO_HISTORICO",
    "fecha_cierre_operativo": "2026-08-31",
    "fecha_fin_mantenimiento": "2026-09-30",
    "updated_at": "2026-05-28T12:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida |
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |
| 422 | Estado no es ACTIVA; motivo_cierre_parcial no válido o ausente |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/subcampanias/1/cerrar \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "estado_final": "COMPLETADA",
    "fecha_cierre_operativo": "2026-08-31",
    "fecha_fin_mantenimiento": "2026-09-30"
  }'
```

---

## DELETE /subcampanias/:id

**Rol mínimo**: GENERAL  
**Descripción**: Elimina una subcampaña (solo en estado BORRADOR).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Subcampaña eliminada correctamente."
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |
| 422 | Estado no es BORRADOR |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/subcampanias/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /subcampanias/:id/equipo

**Rol mínimo**: GENERAL  
**Descripción**: Lista miembros del equipo de la subcampaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "usuario_id": 1,
      "nombre": "Juan Pérez",
      "rol": "COORDINADOR",
      "added_at": "2026-05-28T10:00:00Z"
    },
    {
      "usuario_id": 2,
      "nombre": "María González",
      "rol": "OPERARIO",
      "added_at": "2026-05-28T10:15:00Z"
    }
  ]
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña no encontrada |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/subcampanias/1/equipo \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /subcampanias/:id/equipo

**Rol mínimo**: GENERAL  
**Descripción**: Agrega un miembro al equipo de la subcampaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| usuario_id | number | ✓ | Usuario existente |
| rol | RolEnSubcampania | ✓ | COORDINADOR, OPERARIO |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "usuario_id": 3,
    "nombre": "Carlos López",
    "rol": "OPERARIO",
    "added_at": "2026-05-28T13:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Rol inválido |
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña o usuario no encontrado |
| 409 | Usuario ya es miembro del equipo |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/subcampanias/1/equipo \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "usuario_id": 3,
    "rol": "OPERARIO"
  }'
```

---

## DELETE /subcampanias/:id/equipo/:usuarioId

**Rol mínimo**: GENERAL  
**Descripción**: Remueve un miembro del equipo.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID de la subcampaña |
| usuarioId | number | ID del usuario a remover |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Miembro removido correctamente."
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña o usuario no encontrado; usuario no es miembro |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/subcampanias/1/equipo/3 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## Tipos & Estructuras

### EstadoSubcampania
```
BORRADOR | ACTIVA | COMPLETADA | FINALIZADA_PARCIAL | PAUSADA | CANCELADA
```

### FaseMantenimiento
```
NO_APLICA | MANTENIMIENTO_ACTIVO | MONITOREO_HISTORICO
```

### MotivoCierreParcial
```
FALTA_STOCK | PROBLEMAS_CLIMATICOS | CANCELACION_CONVENIO | CONFLICTO_SOCIAL |
ACCESO_RESTRINGIDO | CAMBIO_PRIORIDAD_INSTITUCIONAL | RIESGO_OPERATIVO |
META_REDEFINIDA | CIERRE_ADMINISTRATIVO | OTRO
```

### RolEnSubcampania
```
COORDINADOR | OPERARIO
```

### Subcampaña
```typescript
{
  id: number;
  campania_id: number;
  nombre: string;
  descripcion?: string;
  zona_id: number;
  meta_total_arboles: number;
  fecha_estimada_inicio?: string;
  fecha_estimada_fin?: string;
  tolerancia_gps_metros: number;
  estado: EstadoSubcampania;
  fase_mantenimiento: FaseMantenimiento;
  poligono?: GeoJSON;
  saldo_vivo_actual: number; // GENERATED
  created_at: string;
  updated_at: string;
}
```

---

## Reglas de Negocio

1. **Ciclo de vida**: BORRADOR → ACTIVA → (COMPLETADA | FINALIZADA_PARCIAL)
2. **Pre-condiciones de activación**: Polígono requerido, meta >= 1
3. **Campos GENERATED**: `saldo_vivo_actual` es calculado en BD
4. **GeoJSON**: Orden [longitud, latitud]
5. **Equipo**: Un usuario puede tener rol COORDINADOR o OPERARIO por subcampaña
6. **Soft delete**: Solo en estado BORRADOR; otros estados se archivan

---

## Flujo Típico

1. **POST** → Crear subcampaña (BORRADOR)
2. **PATCH** → Editar detalles
3. **POST /poligono** → Establecer zona
4. **POST /equipo** → Agregar coordinadores y operarios
5. **POST /activar** → Pasar a ACTIVA
6. **POST /cerrar** → Cerrar (COMPLETADA o FINALIZADA_PARCIAL)
