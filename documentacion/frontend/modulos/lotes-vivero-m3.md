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

## GET /lotes-vivero/stock/especies

**Rol mínimo**: GENERAL
**Descripción**: Lista stock vivo disponible para asignación agrupado por especie/planta. Es el endpoint recomendado para que el frontend muestre disponibilidad antes de reservar.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": [
    {
      "planta_id": 5,
      "especie": "Aliso",
      "nombre_cientifico": "Alnus acuminata",
      "nombre_comun_principal": "Aliso",
      "saldo_vivo_actual_total": 1200,
      "saldo_reservado_total": 300,
      "saldo_disponible_total": 900,
      "lotes": [
        {
          "lote_id": 31,
          "codigo_trazabilidad": "VIV-000031-REC-2026-057",
          "saldo_vivo_actual": 700,
          "saldo_reservado": 200,
          "saldo_disponible": 500
        }
      ]
    }
  ]
}
```

**Notas**
- `saldo_disponible_total` = suma de saldos disponibles para asignación por especie.
- Cada lote incluye `saldo_reservado`, que corresponde a reservas activas para subcampañas.
- No usar este endpoint como garantía de concurrencia. La garantía final la aplica `POST /lotes-vivero/:id/reservas` en BD.

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/lotes-vivero/stock/especies \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /lotes-vivero/:id/saldos

**Rol mínimo**: GENERAL  
**Descripción**: Obtiene saldos operativos de un lote para asignación. El saldo disponible descuenta reservas activas.

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
    "saldo_vivo_actual": 500,
    "saldo_asignado_total": 150,
    "saldo_vivo_disponible_asignacion": 350,
    "asignaciones_activas": [
      {
        "id": 10,
        "subcampania_id": 5,
        "subcampania_nombre": "Subcampaña Zona A",
        "proposito": "PLANTACION_INICIAL",
        "cantidad_asignada": 150,
        "cantidad_consumida": 0,
        "cantidad_devuelta": 0,
        "cantidad_mermada": 0,
        "saldo_asignado_disponible": 150
      }
    ]
  }
}
```

**Campos clave**:
- `saldo_vivo_actual`: plantas vivas actuales del lote.
- `saldo_asignado_total`: suma de saldos reservados en asignaciones activas.
- `saldo_vivo_disponible_asignacion`: saldo que todavía puede reservarse o despacharse manualmente sin tocar reservas.

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
**Descripción**: Asigna/reserva una cantidad de un lote a una subcampaña. Usa la misma lógica transaccional que `POST /lotes-vivero/:id/reservas`.

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
| 400 | Validación fallida: proposito inválido o error no clasificable |
| 401 | Header x-auth-id ausente |
| 404 | Lote o subcampaña no encontrado |
| 422 | Lote no está en estado ACTIVO; subcampaña no válida; cantidad excede saldo disponible |

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

## POST /lotes-vivero/:id/reservas

**Rol mínimo**: GENERAL
**Descripción**: Endpoint recomendado para reservar stock por lote hacia una subcampaña. Ejecuta la reserva en una RPC transaccional que bloquea el lote y las reservas activas antes de calcular saldo disponible.

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
| subcampania_id | number | ✓ | ID de subcampaña existente en BORRADOR o ACTIVA |
| cantidad_asignada | number | ✓ | >= 1, <= saldo_vivo_disponible_asignacion |
| proposito | PropositoAsignacion | — | Default: PLANTACION_INICIAL |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 10,
    "lote_vivero_id": 1,
    "subcampania_id": 5,
    "cantidad_asignada": 100,
    "cantidad_consumida": 0,
    "cantidad_devuelta": 0,
    "cantidad_mermada": 0,
    "saldo_asignado_disponible": 100,
    "proposito": "PLANTACION_INICIAL",
    "estado": "ACTIVA",
    "usuario_asignacion_id": 1,
    "fecha_asignacion": "2026-05-28T14:00:00Z",
    "updated_at": "2026-05-28T14:00:00Z",
    "subcampania_nombre": "Subcampaña Zona A"
  }
}
```

**Concurrencia**
- La reserva es atómica en BD mediante `fn_vivero_reservar_stock_lote`.
- Si dos usuarios reservan el mismo lote al mismo tiempo, la segunda operación recalcula saldo después del bloqueo y puede devolver 422 si ya no alcanza.
- El frontend no debe asumir que el saldo leído previamente sigue disponible; debe mostrar el mensaje del backend si recibe 422.

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida o error no clasificable |
| 401 | Header x-auth-id ausente |
| 404 | Lote o subcampaña no encontrado |
| 422 | Lote no ACTIVO, subcampaña no admite reservas, o cantidad excede saldo |
| 500 | RPC no aplicada o no visible en schema cache |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/lotes-vivero/1/reservas \
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
  cantidad_consumida: number;
  cantidad_devuelta: number;
  cantidad_mermada: number;
  saldo_asignado_disponible: number;
  proposito?: PropositoAsignacion;
  estado: string;
  usuario_asignacion_id: number;
  fecha_asignacion: string;
  updated_at: string;
}
```

### Saldo
```typescript
{
  lote_id: number;
  saldo_vivo_actual: number | null;
  saldo_asignado_total: number;
  saldo_vivo_disponible_asignacion: number | null;
  asignaciones_activas: Asignacion[];
}
```

### StockDisponiblePorEspecie
```typescript
{
  planta_id: number;
  especie: string | null;
  nombre_cientifico: string | null;
  nombre_comun_principal: string | null;
  saldo_vivo_actual_total: number;
  saldo_reservado_total: number;
  saldo_disponible_total: number;
  lotes: Array<{
    lote_id: number;
    codigo_trazabilidad: string;
    saldo_vivo_actual: number;
    saldo_reservado: number;
    saldo_disponible: number;
  }>;
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

1. **Saldo disponible para reserva**: `saldo_vivo_disponible_asignacion = saldo_vivo_actual - saldo_asignado_total`.
2. **Reserva máxima**: No puede superar `saldo_vivo_disponible_asignacion`.
3. **Reserva transaccional**: `POST /lotes-vivero/:id/reservas` bloquea lote y reservas activas antes de calcular saldo.
4. **Lote requerido ACTIVO**: Solo se reserva desde lotes en estado ACTIVO.
5. **Subcampaña destino**: Solo admite reservas si está en BORRADOR o ACTIVA.
6. **Proposito**: Opcional; default `PLANTACION_INICIAL`; también admite `REPOSICION`.
7. **Cancelación**: Devuelve cantidad al saldo disponible si la asignación no fue consumida.
8. **Timeline**: Read-only, auditoria completa de eventos.

---

## Flujo Típico (M3)

1. **GET /lotes-vivero/stock/especies** → Mostrar disponibilidad agrupada por especie.
2. **GET /lotes-vivero/:id/saldos** → Verificar saldos del lote seleccionado.
3. **POST /lotes-vivero/:id/reservas** → Reservar stock de forma transaccional.
4. **GET /lotes-vivero/:id/asignaciones** → Ver asignaciones activas.
5. **DELETE /lotes-vivero/:id/asignaciones/:asignacionId** → Cancelar si no fue consumida.
6. **GET /lotes-vivero/:id/timeline** → Auditar historial del lote.
