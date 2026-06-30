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

### Mix de especies

No existe un endpoint para persistir un mix planificado por porcentaje como `[{ planta_id, pct }]`.

El backend persiste la composición operativa mediante reservas de vivero: `POST /lotes-vivero/:loteId/reservas`. La `composicion_reservada` que devuelve `POST /subcampanias/:id/activar` se calcula desde reservas activas (`asignacion_vivero_subcampania`) y sus lotes/especies; no desde una tabla de porcentajes planificados.

Implicación para frontend:

- Si el paso "Especies y meta" solo guarda porcentajes, eso queda como borrador local hasta que se traduzca a cantidades/lotes y se creen reservas.
- Si producto necesita persistir el mix porcentual antes de reservar stock, falta contrato backend nuevo, por ejemplo `PUT /subcampanias/:id/composicion`.
- Con el contrato actual, el flujo persistente real es: elegir especie/stock disponible → seleccionar lote(s) → reservar cantidades por lote → activar cuando la suma reservada cubra `meta_total_arboles`.

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
**Descripción**: Activa una subcampaña (transición: BORRADOR → ACTIVA) solo si la composición operativa está completa.

**Pre-condiciones**:

- Estado actual: BORRADOR
- Debe tener `zona_id` (`division_administrativa.id`) y polígono seteado
- Debe tener equipo con un miembro `COORDINADOR`
- Debe tener `meta_total_arboles >= 1`
- Debe tener reservas activas de vivero
- El total reservado debe cubrir `meta_total_arboles`

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
