# Módulo: Lotes de Vivero — M3 (Asignaciones)

Base URL: `/api/lotes-vivero`

**Alcance**: Documenta solo los endpoints relevantes para M3 (flujo de asignaciones).  
**Nota**: Endpoints de lifecycle completo (embolsado, adaptabilidad, merma, despacho) están en documentación separada.

---

## GET /lotes-vivero

**Rol mínimo**: GENERAL  
**Descripción**: Lista lotes de vivero disponibles para asignación a subcampañas.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| estado | string | — | Filtrar por estado (ej. ACTIVO) |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "recoleccion_id": 5,
      "especie": "Aliso",
      "cantidad_inicial": 500,
      "estado": "ACTIVO",
      "saldo_disponible": 350,
      "created_at": "2026-05-20T10:00:00Z"
    },
    {
      "id": 2,
      "recoleccion_id": 6,
      "especie": "Pino",
      "cantidad_inicial": 800,
      "estado": "ACTIVO",
      "saldo_disponible": 600,
      "created_at": "2026-05-21T10:00:00Z"
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
curl -X GET "http://localhost:3000/api/lotes-vivero?estado=ACTIVO" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /lotes-vivero/:id

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene detalle completo de un lote de vivero.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID del lote de vivero |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "recoleccion_id": 5,
    "codigo_trazabilidad": "LV-2026-001",
    "especie": "Aliso",
    "cantidad_inicial": 500,
    "estado": "ACTIVO",
    "descripcion": "Lote de Aliso de recolección La Paz",
    "created_at": "2026-05-20T10:00:00Z",
    "updated_at": "2026-05-20T10:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/lotes-vivero/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /lotes-vivero/:id/saldos

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene el saldo disponible de un lote para asignación. Resultado de: cantidad_inicial - cantidad_asignada.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID del lote de vivero |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "lote_id": 1,
    "cantidad_inicial": 500,
    "cantidad_asignada": 150,
    "saldo_disponible": 350,
    "cantidad_en_embolsado": 50,
    "cantidad_en_adaptabilidad": 0,
    "cantidad_en_merma": 0,
    "cantidad_en_despacho": 0
  }
}
```

**Campos GENERATED**:
- `saldo_disponible`: Calculado en BD como `cantidad_inicial - cantidad_asignada`
- Otros campos desglosados por etapa del ciclo de vivero

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/lotes-vivero/1/saldos \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /lotes-vivero/:id/asignaciones

**Rol mínimo**: GENERAL  
**Descripción**: Asigna una cantidad de un lote a una subcampaña.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID del lote de vivero |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| subcampania_id | number | ✓ | ID de subcampaña existente |
| cantidad_asignada | number | ✓ | >= 1, <= saldo_disponible |
| proposito | PropositoAsignacion | — | PLANTACION_INICIAL, REPOSICION |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 10,
    "lote_vivero_id": 1,
    "subcampania_id": 5,
    "cantidad_asignada": 100,
    "proposito": "PLANTACION_INICIAL",
    "estado": "ACTIVA",
    "created_at": "2026-05-28T14:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida: cantidad > saldo, proposito inválido |
| 401 | Header x-auth-id ausente |
| 404 | Lote o subcampaña no encontrado |
| 422 | Lote no está en estado ACTIVO; subcampaña no válida |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/lotes-vivero/1/asignaciones \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "subcampania_id": 5,
    "cantidad_asignada": 100,
    "proposito": "PLANTACION_INICIAL"
  }'
```

---

## GET /lotes-vivero/:id/asignaciones

**Rol mínimo**: GENERAL  
**Descripción**: Lista todas las asignaciones activas de un lote.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID del lote de vivero |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "lote_vivero_id": 1,
      "subcampania_id": 5,
      "subcampania_nombre": "Subcampaña Zona A",
      "cantidad_asignada": 100,
      "proposito": "PLANTACION_INICIAL",
      "estado": "ACTIVA",
      "created_at": "2026-05-28T14:00:00Z"
    },
    {
      "id": 11,
      "lote_vivero_id": 1,
      "subcampania_id": 6,
      "subcampania_nombre": "Subcampaña Zona B",
      "cantidad_asignada": 50,
      "proposito": "REPOSICION",
      "estado": "ACTIVA",
      "created_at": "2026-05-28T14:15:00Z"
    }
  ]
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/lotes-vivero/1/asignaciones \
  -H "x-auth-id: <tu-auth-id>"
```

---

## DELETE /lotes-vivero/:id/asignaciones/:asignacionId

**Rol mínimo**: GENERAL  
**Descripción**: Cancela una asignación (devuelve la cantidad al saldo disponible).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID del lote de vivero |
| asignacionId | number | ID de la asignación a cancelar |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "message": "Asignación cancelada correctamente.",
    "asignacion_id": 10,
    "cantidad_devuelta": 100
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote o asignación no encontrado |
| 422 | Asignación ya está cancelada o en estado no editable |

**Ejemplo cURL**
```bash
curl -X DELETE http://localhost:3000/api/lotes-vivero/1/asignaciones/10 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /lotes-vivero/:id/timeline

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene el historial completo de eventos de un lote (read-only, para trazabilidad).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| id | number | ID del lote de vivero |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| tipo_evento | string | — | Filtrar por tipo (CREACION, ASIGNACION, EMBOLSADO, etc.) |

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 100,
      "lote_id": 1,
      "tipo_evento": "CREACION",
      "descripcion": "Lote creado desde recolección",
      "usuario_id": 1,
      "usuario_nombre": "Juan Pérez",
      "cantidad_afectada": 500,
      "metadata": { "recoleccion_id": 5 },
      "created_at": "2026-05-20T10:00:00Z"
    },
    {
      "id": 101,
      "lote_id": 1,
      "tipo_evento": "ASIGNACION",
      "descripcion": "Asignado a Subcampaña Zona A",
      "usuario_id": 2,
      "usuario_nombre": "María González",
      "cantidad_afectada": 100,
      "metadata": { "subcampania_id": 5 },
      "created_at": "2026-05-28T14:00:00Z"
    }
  ]
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

**Ejemplo cURL**
```bash
curl -X GET "http://localhost:3000/api/lotes-vivero/1/timeline?tipo_evento=ASIGNACION" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## Tipos & Estructuras

### PropositoAsignacion
```
PLANTACION_INICIAL | REPOSICION
```

### Estado Lote
```
ACTIVO | INACTIVO | CERRADO
```

### Lote de Vivero
```typescript
{
  id: number;
  recoleccion_id: number;
  codigo_trazabilidad: string;
  especie: string;
  cantidad_inicial: number;
  estado: string;
  descripcion?: string;
  created_at: string;
  updated_at: string;
}
```

### Asignación
```typescript
{
  id: number;
  lote_vivero_id: number;
  subcampania_id: number;
  subcampania_nombre?: string;
  cantidad_asignada: number;
  proposito?: PropositoAsignacion;
  estado: string;
  created_at: string;
}
```

### Saldo
```typescript
{
  lote_id: number;
  cantidad_inicial: number;
  cantidad_asignada: number;
  saldo_disponible: number; // GENERATED
  cantidad_en_embolsado: number;
  cantidad_en_adaptabilidad: number;
  cantidad_en_merma: number;
  cantidad_en_despacho: number;
}
```

### Evento Timeline
```typescript
{
  id: number;
  lote_id: number;
  tipo_evento: string;
  descripcion: string;
  usuario_id: number;
  usuario_nombre: string;
  cantidad_afectada: number;
  metadata: Record<string, any>;
  created_at: string;
}
```

---

## Reglas de Negocio

1. **Saldo**: `saldo_disponible = cantidad_inicial - cantidad_asignada` (GENERATED)
2. **Asignación máxima**: No puede superar `saldo_disponible`
3. **Lote requerido ACTIVO**: Solo se asigna desde lotes en estado ACTIVO
4. **Proposito**: Opcional; documentar si es plantación inicial o reposición
5. **Cancelación**: Devuelve cantidad al saldo_disponible
6. **Timeline**: Read-only, auditoria completa de eventos

---

## Flujo Típico (M3)

1. **GET /lotes-vivero** → Listar lotes disponibles
2. **GET /lotes-vivero/:id** → Ver detalle
3. **GET /lotes-vivero/:id/saldos** → Verificar saldo disponible
4. **POST /asignaciones** → Asignar cantidad a subcampaña
5. **GET /asignaciones** → Ver asignaciones activas
6. **DELETE /asignaciones/:id** → Cancelar si es necesario
7. **GET /timeline** → Auditar historial del lote
