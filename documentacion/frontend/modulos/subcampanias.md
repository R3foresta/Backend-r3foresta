# Módulo: Subcampañas

Base URL: `/api/subcampanias`

---

## Decisiones de integración frontend

### `zona_id`

`zona_id` es el `id` de `division_administrativa`; no existe un catálogo aparte de zonas para subcampañas.

Si el selector de comunidad devuelve el `id` de una fila de `division_administrativa` (por ejemplo, una comunidad/localidad de la jerarquía País → Departamento → Provincia → Municipio → Comunidad), ese valor debe enviarse como `zona_id`.

No confundir con `ubicacion.id`: `ubicacion` es otra tabla usada para registros puntuales con coordenadas/referencia. Subcampaña referencia directamente `division_administrativa.id`.

### Momento de creación

`POST /subcampanias` requiere estos campos mínimos:

- `campania_id`
- `nombre`
- `zona_id`
- `meta_total_arboles`

`meta_total_arboles` no puede ser `null` ni `0`. Si el flujo de frontend obtiene comunidad/nombre en paso 1 y define especies/meta en paso 2, la subcampaña solo puede crearse al terminar el paso 2, cuando ya existan los cuatro campos mínimos.

### Plan de metas por especie (planeación) vs. reservas (cumplimiento)

Decisión cerrada 2026-07-01 (`RN-PLA-15..18`, `RN-PLA-36`, `RN-PLA-09`):

- **Plan de metas** (planeación) vive en `SUBCAMPANIA_META_ESPECIE`. Se persiste con `PUT /subcampanias/:id/plan` y se puede editar libremente mientras la subcampaña esté en `BORRADOR`. Cada meta lleva `planta_id`, `porcentaje_objetivo` (0 < x ≤ 100) y `cantidad_objetivo` (> 0).
- **Reservas de vivero** (cumplimiento) siguen registrándose en `POST /lotes-vivero/:loteId/reservas` y solo se aceptan cuando la subcampaña está `ACTIVA` (o `COMPLETADA` / `FINALIZADA_PARCIAL` para reposición). Ver "Guard de asignación" abajo.
- Al **activar** (`POST /subcampanias/:id/activar`) el backend valida el plan: `SUM(porcentaje_objetivo) = 100` y `SUM(cantidad_objetivo) = meta_total_arboles`. **Se permite activar con 0% de stock reservado** — la subcampaña puede activarse aunque aún no haya asignaciones de lote (`RN-PLA-09`). El sistema muestra advertencia visual con cobertura, pero no bloquea la activación.

Flujo persistente para frontend:

1. `POST /subcampanias` → crea BORRADOR con `meta_total_arboles`.
2. `PUT /subcampanias/:id/plan` (opcional al crear, editable mientras BORRADOR) → guarda las metas por especie.
3. `POST /subcampanias/:id/poligono` + `POST /subcampanias/:id/equipo` (coordinador).
4. Opcionalmente `POST /lotes-vivero/:loteId/reservas` para pre-cargar stock — **no obligatorio** (el guard actual rechaza reservas mientras la subcampaña siga en BORRADOR; ver siguiente sección).
5. `POST /subcampanias/:id/activar`.
6. Reservas reales de stock se hacen tras activar; se pueden ampliar durante toda la vida `ACTIVA`.

### Guard de asignación por estado

El endpoint `POST /lotes-vivero/:loteId/reservas` (M2) rechaza reservas contra subcampañas en estos casos:

- `estado = BORRADOR` o `estado = CANCELADA` → **409 Conflict** ("No se asignan lotes a una subcampaña en estado …"). Ver `RN-VIV-11` / `RF-PLA-04`.
- `proposito = PLANTACION_INICIAL` y `estado ≠ ACTIVA` → **422**.
- `proposito = REPOSICION` y `estado ∉ {ACTIVA, COMPLETADA, FINALIZADA_PARCIAL}` → **422**.

### Meta agregada de campaña derivada (`meta_planificada_campania`)

`GET /campanias` y `GET /campanias/:id` ahora devuelven `meta_planificada_campania` (número entero). Se calcula como `SUM(meta_total_arboles)` de las subcampañas hijas cuyo `estado <> CANCELADA` (incluye `BORRADOR`). Ver `RN-PLA-36`. La vista pública debe filtrar aparte a `ACTIVA | COMPLETADA | FINALIZADA_PARCIAL`.

### Cancelación de subcampaña sin plantaciones

Ver la sección `POST /subcampanias/:id/cancelar` más abajo. Regla resumen: cancelable solo si `total_plantado_inicial = 0` (BORRADOR o ACTIVA sin plantar); si ya hay plantaciones, usar cierre `FINALIZADA_PARCIAL`.

### Coordinador

El coordinador no se envía en `POST /subcampanias` ni en `PATCH /subcampanias/:id`.

Se persiste como miembro del equipo con rol `COORDINADOR`:

```json
[{ "usuario_id": 15, "rol": "COORDINADOR" }]
```

Endpoint: `POST /subcampanias/:id/equipo`.

Para cambiar coordinador:

- En `BORRADOR`: usar `DELETE /subcampanias/:id/equipo/:usuarioId` para quitar el coordinador anterior y luego `POST /subcampanias/:id/equipo` para agregar el nuevo.
- En `ACTIVA`: el backend no permite quitar al coordinador actual y tampoco permite agregar un segundo `COORDINADOR`; no hay endpoint de reemplazo atómico. Si ese caso de uso es requerido, falta contrato backend nuevo.

---

## POST /subcampanias

**Rol mínimo**: ADMIN  
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
| zona_id | number | ✓ | ID de `division_administrativa` |
| meta_total_arboles | number | ✓ | >= 1 |
| fecha_estimada_inicio | string | — | ISO date (YYYY-MM-DD) |
| fecha_estimada_fin | string | — | ISO date |
| tolerancia_gps_metros | number | — | Default: 50; min 1 |

**Respuesta exitosa** `201`

```json
{
  "success": true,
  "data": {
    "message": "Subcampaña creada correctamente.",
    "id": 1,
    "campania_id": 1,
    "nombre": "Subcampaña Zona A",
    "tipo": "REFORESTACION",
    "estado": "BORRADOR",
    "zona_id": 10,
    "meta_total_arboles": 1000,
    "codigo_trazabilidad": "SUB-001-CMP-2026-001",
    "descripcion": "Plantación en zona A de La Paz",
    "fecha_estimada_inicio": "2026-06-01",
    "fecha_estimada_fin": "2026-08-31",
    "tolerancia_gps_metros": 50,
    "created_at": "2026-05-28T10:00:00Z"
  }
}
```

**Campos generados / derivados**

- `estado`: "BORRADOR"
- `tipo`: heredado desde la campaña; no enviar en el payload
- `codigo_trazabilidad`: generado por backend
- `saldo_vivo_actual`: calculado en BD y disponible en consultas (`GET`)

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida |
| 401 | Header x-auth-id ausente |
| 403 | El usuario autenticado no tiene rol ADMIN |
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

**Rol mínimo**: usuario autenticado
**Descripción**: Lista subcampañas con filtros opcionales, **con payload enriquecido para dashboard** (2026-07-04). Idéntica respuesta a `GET /campanias/:id/subcampanias` (ver módulo Campañas para la especificación de los campos agregados).

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
      "descripcion": null,
      "tipo": "REFORESTACION",
      "estado": "ACTIVA",
      "fase_mantenimiento": "MANTENIMIENTO_ACTIVO",
      "zona_id": 10,
      "zona_nombre": "Comunidad Sur",
      "area_hectareas": 2.5,
      "meta_total_arboles": 1000,
      "codigo_trazabilidad": "SUB-001-CMP-2026-001",
      "total_plantado_inicial": 250,
      "total_repuesto": 0,
      "total_muerto_acumulado": 0,
      "saldo_vivo_actual": 250,
      "plantados": 250,
      "avance_pct": 25,
      "has_plan_especies": true,
      "personas_count": 3,
      "lotes_count": 2,
      "eventos_count": 5,
      "equipo": [
        {
          "usuario_id": 7,
          "nombre_usuario": "Coord Pepe",
          "rol": "COORDINADOR",
          "foto_perfil_url": null
        }
      ],
      "coordinador": { "id": 7, "nombre": "Coord Pepe" },
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

**Campos agregados (2026-07-04)** — mismos que `GET /campanias/:id/subcampanias`:

| Campo | Tipo | Semántica |
|-------|------|-----------|
| `zona_nombre` | string \| null | Snapshot si existe, si no `division_administrativa.nombre`. |
| `plantados` | number | Alias de `total_plantado_inicial`. |
| `avance_pct` | number \| null | `plantados / meta × 100` acotado a `[0, 100]`; `null` si meta = 0. |
| `has_plan_especies` | boolean | `SUBCAMPANIA_META_ESPECIE` tiene filas para la subcampaña. |
| `personas_count` | number | Total de miembros (COORDINADOR + OPERARIO). |
| `lotes_count` | number | `lote_vivero_id` distintos con asignación `ACTIVA`. |
| `eventos_count` | number | `registro_plantacion` + `evento_plantacion`. |
| `equipo` | `EquipoMember[]` | Siempre presente (puede ser `[]`). |

**Ejemplo cURL**

```bash
curl -X GET "http://localhost:3000/api/subcampanias?campania_id=1&estado=ACTIVA" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /subcampanias/:id

**Rol mínimo**: usuario autenticado  
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

**Rol mínimo**: ADMIN  
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
| zona_id | number | — | ID válido de `division_administrativa` |
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
| 403 | El usuario autenticado no tiene rol ADMIN |
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

**Rol mínimo**: ADMIN  
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
        [-68.119, -16.291],
        [-68.118, -16.2905],
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
| 403 | El usuario autenticado no tiene rol ADMIN |
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

**Rol mínimo**: ADMIN
**Descripción**: Activa una subcampaña (transición: BORRADOR → ACTIVA). El plan por especie debe estar completo, pero **el stock reservado NO tiene que cubrir la meta** (`RN-PLA-09`).

**Pre-condiciones**:

- Estado actual: BORRADOR
- `zona_id` (`division_administrativa.id`) y polígono seteados
- Equipo con un miembro `COORDINADOR`
- `meta_total_arboles > 0`
- Plan de metas por especie completo (`RN-PLA-16`): ≥1 fila en `SUBCAMPANIA_META_ESPECIE`, `SUM(porcentaje_objetivo) = 100` y `SUM(cantidad_objetivo) = meta_total_arboles`

**Se permite activar con 0 reservas**. La respuesta expone `composicion_reservada` (puede ser `[]`) para que el frontend muestre la brecha de cobertura por especie sin bloquear la activación.

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
    "message": "Subcampaña activada correctamente.",
    "id": 1,
    "estado": "ACTIVA",
    "nombre_zona_snapshot": "Zona A",
    "nombre_coordinador_snapshot": "Coord Pepe",
    "nombres_organizaciones_snapshot": ["Org A"],
    "composicion_reservada": [
      {
        "planta_id": 5,
        "especie": "Aliso",
        "nombre_cientifico": "Alnus acuminata",
        "saldo_reservado": 500
      }
    ],
    "updated_at": "2026-05-28T11:00:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Subcampaña no encontrada |
| 422 | No cumple pre-condiciones: estado no BORRADOR, sin polígono, sin coordinador, sin reservas, o reservas insuficientes |

**Notas para frontend**

- Si el backend devuelve `422`, mostrar el mensaje del backend: indica exactamente qué falta.
- Antes de activar, verificar que ya existan polígono, coordinador y reservas suficientes.
- Las reservas se crean desde `POST /lotes-vivero/:loteId/reservas`.

**Ejemplo cURL**

```bash
curl -X POST http://localhost:3000/api/subcampanias/1/activar \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /subcampanias/:id/cerrar

**Rol mínimo**: ADMIN  
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
    "fase_mantenimiento": "MANTENIMIENTO_ACTIVO",
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
| 403 | El usuario autenticado no tiene rol ADMIN |
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

## POST /subcampanias/:id/cancelar

**Rol mínimo**: ADMIN  
**Descripción**: Cancela una subcampaña sin plantaciones (`RN-PLA-37`). Aplica a `BORRADOR` (siempre) y a `ACTIVA` cuyo `total_plantado_inicial = 0`. Deja `estado = CANCELADA`, setea `deleted_at`/`deleted_by` (inactivación, no borrado físico), libera todas las asignaciones activas como devolución lógica al lote (no genera evento en M2) y registra `SUBCAMPANIA_CANCELADA` en el historial. Si `total_plantado_inicial > 0`, responde 409 sugiriendo `FINALIZADA_PARCIAL`. Atómico.

**Body** (`application/json`)

```json
{
  "motivo": "Cambio de prioridad institucional"
}
```

| Campo | Tipo | Requerido | Reglas |
|-------|------|-----------|--------|
| motivo | string | ✓ | 3–1000 caracteres. Texto libre (MVP). |

**Respuesta exitosa** `201`

```json
{
  "success": true,
  "data": {
    "message": "Subcampaña cancelada correctamente.",
    "id": 5,
    "estado": "CANCELADA",
    "deleted_at": "2026-07-02T00:00:00Z",
    "deleted_by": 42,
    "motivo": "Cambio de prioridad institucional"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Motivo faltante o vacío |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Subcampaña no encontrada |
| 409 | Ya existen plantaciones (`total_plantado_inicial > 0`) — usar `FINALIZADA_PARCIAL` |
| 409 | Estado no permite cancelación (ya `CANCELADA`, `COMPLETADA` o `FINALIZADA_PARCIAL`) |

---

## GET /subcampanias/:id/plan

**Rol mínimo**: cualquier usuario autenticado.  
**Descripción**: Devuelve el plan de metas por especie (`SUBCAMPANIA_META_ESPECIE`). Vacío si aún no se cargó.

**Respuesta exitosa** `200`

```json
{
  "success": true,
  "data": {
    "subcampania_id": 1,
    "estado": "BORRADOR",
    "meta_total_arboles": 500,
    "metas": [
      {
        "planta_id": 5,
        "porcentaje_objetivo": 60,
        "cantidad_objetivo": 300,
        "planta": { "id": 5, "especie": "Aliso", "nombre_cientifico": "Alnus acuminata" }
      },
      {
        "planta_id": 8,
        "porcentaje_objetivo": 40,
        "cantidad_objetivo": 200,
        "planta": { "id": 8, "especie": "Nogal", "nombre_cientifico": "Juglans regia" }
      }
    ]
  }
}
```

---

## PUT /subcampanias/:id/plan

**Rol mínimo**: ADMIN  
**Descripción**: Reemplazo bulk del plan de metas por especie. Solo permitido en `BORRADOR` (`RN-PLA-17`). Cada `planta_id` una sola vez, `porcentaje_objetivo ∈ (0, 100]`, `cantidad_objetivo > 0`. La consistencia total (`SUM(%) = 100`, `SUM(cantidad) = meta_total_arboles`) se verifica al activar (`RN-PLA-16`), no aquí.

**Body** (`application/json`)

```json
{
  "metas": [
    { "planta_id": 5, "porcentaje_objetivo": 60, "cantidad_objetivo": 300 },
    { "planta_id": 8, "porcentaje_objetivo": 40, "cantidad_objetivo": 200 }
  ]
}
```

**Respuesta exitosa** `200`

```json
{
  "success": true,
  "data": {
    "message": "Plan de metas guardado correctamente.",
    "subcampania_id": 1,
    "metas": [
      { "planta_id": 5, "porcentaje_objetivo": 60, "cantidad_objetivo": 300 },
      { "planta_id": 8, "porcentaje_objetivo": 40, "cantidad_objetivo": 200 }
    ]
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Datos inválidos o `planta_id` inexistente en catálogo |
| 401 | Header x-auth-id ausente |
| 403 | Rol distinto de ADMIN |
| 404 | Subcampaña no encontrada |
| 422 | Estado ≠ BORRADOR o `planta_id` repetido en el payload |

---

## DELETE /subcampanias/:id

**Rol mínimo**: ADMIN  
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
| 403 | El usuario autenticado no tiene rol ADMIN |
| 404 | Subcampaña no encontrada |
| 422 | Estado no es BORRADOR |

**Ejemplo cURL**

```bash
curl -X DELETE http://localhost:3000/api/subcampanias/1 \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /subcampanias/:id/equipo

**Rol mínimo**: usuario autenticado  
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
      "id": 10,
      "usuario_id": 1,
      "nombre_usuario": "Juan Pérez",
      "rol": "COORDINADOR",
      "agregado_at": "2026-05-28T10:00:00Z",
      "foto_perfil_url": "https://supabase.../imagenes-perfil/user_1716910800000_abc123/profile-picture.jpg?v=1716920000000"
    },
    {
      "id": 11,
      "usuario_id": 2,
      "nombre_usuario": "María González",
      "rol": "OPERARIO",
      "agregado_at": "2026-05-28T10:15:00Z",
      "foto_perfil_url": null
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

**Rol mínimo**: ADMIN  
**Descripción**: Agrega uno o más miembros al equipo de la subcampaña. La operación recibe un arreglo y se inserta de forma atómica: si un miembro falla, no se agrega ninguno.

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

Arreglo de 1 a N miembros:

| Campo      | Tipo             | Requerido | Validación                                             |
| ---------- | ---------------- | --------- | ------------------------------------------------------ |
| usuario_id | number           | ✓         | Usuario existente; no repetir dentro del mismo payload |
| rol        | RolEnSubcampania | ✓         | COORDINADOR, OPERARIO                                  |

Reglas:

- Solo puede existir un `COORDINADOR` por subcampaña.
- No se aceptan usuarios duplicados en la misma solicitud.
- No se usa `equipo_ids` en `PATCH /subcampanias/:id`; el equipo se administra con este endpoint y con `DELETE /subcampanias/:id/equipo/:usuarioId`.

**Respuesta exitosa** `201`

```json
{
  "success": true,
  "data": {
    "message": "Miembros agregados correctamente.",
    "miembros": [
      {
        "id": 20,
        "usuario_id": 3,
        "nombre_usuario": "Carlos López",
        "rol": "OPERARIO",
        "agregado_at": "2026-05-28T13:00:00Z",
        "foto_perfil_url": "https://supabase.../imagenes-perfil/user_1716910800000_ghi789/profile-picture.jpg?v=1716920000000"
      },
      {
        "id": 21,
        "usuario_id": 4,
        "nombre_usuario": "Coord Pepe",
        "rol": "COORDINADOR",
        "agregado_at": "2026-05-28T13:00:00Z",
        "foto_perfil_url": null
      }
    ]
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Payload inválido; rol inválido; uno o más usuarios referenciados no existen |
| 401 | Header x-auth-id ausente |
| 403 | El usuario autenticado no tiene rol ADMIN |
| 404 | Subcampaña no encontrada; usuario autenticado no encontrado |
| 422 | Más de un COORDINADOR en el payload; ya existe un coordinador; usuarios duplicados; uno o más usuarios ya pertenecen al equipo |

**Ejemplo cURL**

```bash
curl -X POST http://localhost:3000/api/subcampanias/1/equipo \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '[
    {
      "usuario_id": 3,
      "rol": "OPERARIO"
    },
    {
      "usuario_id": 4,
      "rol": "COORDINADOR"
    }
  ]'
```

---

## DELETE /subcampanias/:id/equipo/:usuarioId

**Rol mínimo**: ADMIN  
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
    "message": "Miembro quitado correctamente."
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 403 | El usuario autenticado no tiene rol ADMIN |
| 404 | Subcampaña no encontrada; usuario autenticado no encontrado; usuario no es miembro del equipo |
| 422 | Se intenta quitar al COORDINADOR mientras la subcampaña está ACTIVA |

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

### EquipoMember

```typescript
{
  id: number;
  usuario_id: number;
  nombre_usuario: string | null;
  rol: RolEnSubcampania;
  agregado_at: string | null;
  foto_perfil_url: string | null;
}
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

### ComposicionReservada

```typescript
{
  planta_id: number;
  especie: string | null;
  nombre_cientifico: string | null;
  saldo_reservado: number;
}
```

---

## Reglas de Negocio

1. **Ciclo de vida**: BORRADOR → ACTIVA → (COMPLETADA | FINALIZADA_PARCIAL)
2. **Pre-condiciones de activación**: Polígono, ubicación, coordinador, meta >= 1 y reservas activas suficientes
3. **Campos GENERATED**: `saldo_vivo_actual` es calculado en BD
4. **GeoJSON**: Orden [longitud, latitud]
5. **Equipo**: Un usuario puede tener rol COORDINADOR o OPERARIO por subcampaña
6. **Reservas**: La suma de `saldo_reservado` debe cubrir `meta_total_arboles` antes de activar
7. **Soft delete**: Solo en estado BORRADOR; otros estados se archivan

---

## Flujo Típico

1. **POST** → Crear subcampaña (BORRADOR)
2. **PATCH** → Editar detalles
3. **POST /poligono** → Establecer polígono
4. **POST /equipo** → Agregar coordinadores y operarios
5. **POST /lotes-vivero/:loteId/reservas** → Reservar stock suficiente
6. **POST /activar** → Pasar a ACTIVA
7. **POST /cerrar** → Cerrar (COMPLETADA o FINALIZADA_PARCIAL)
