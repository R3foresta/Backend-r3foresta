# Módulo: Lotes de Vivero — M3 (Asignaciones físicas)

Base URL: `/api/lotes-vivero`

**Alcance**: Documenta solo los endpoints relevantes para M3 (flujo de asignaciones).
**Nota**: Endpoints de lifecycle completo (embolsado, adaptabilidad, merma, despacho) están en documentación separada.

> **Cambio de contrato (2026-07)**: la asignación dejó de ser una *reserva lógica*
> y pasó a ser una **entrega física** (RN-VIV-47). Asignar descuenta
> `saldo_vivo_actual` del lote en ese momento y exige evidencia fotográfica de
> la entrega (RN-VIV-54). Ya no existen `POST /:id/reservas` ni
> `DELETE /:id/asignaciones/:asignacionId`; la devolución se registra con
> `POST /:id/asignaciones/:asignacionId/devolucion`. Ver la
> [guía de migración](../guia-migracion-asignacion-fisica.md).

---

## GET /lotes-vivero

**Rol mínimo**: GENERAL
**Descripción**: Lista lotes de vivero. Cada fila incluye el saldo físico (`saldo_vivo_actual`) y el stock ya entregado a subcampañas (`saldo_asignado_subcampanias`, informativo).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| estado | string | — | Filtrar por estado (ej. ACTIVO) |

**Respuesta exitosa** `200` (fragmento)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo_trazabilidad": "VIV-000001-REC-000005",
      "estado_lote": "ACTIVO",
      "saldo_vivo_actual": 350,
      "saldo_asignado_subcampanias": 150,
      "cantidad_asignaciones_activas": 2
    }
  ]
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |

---

## GET /lotes-vivero/:id

**Rol mínimo**: GENERAL
**Descripción**: Detalle completo de un lote. Incluye `saldo_vivo_actual` (físico), `saldo_asignado_subcampanias` (informativo) y `ultimo_evento_por_tipo`.

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

---

## GET /lotes-vivero/stock/especies

**Rol mínimo**: GENERAL
**Descripción**: Lista stock vivo disponible para asignación agrupado por especie/planta. **El disponible para asignar es el saldo físico del lote** (`saldo_vivo_actual`): las asignaciones anteriores ya lo descontaron, no se resta nada más.

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
      "saldo_vivo_actual_total": 900,
      "saldo_asignado_subcampanias_total": 300,
      "lotes": [
        {
          "lote_id": 31,
          "codigo_trazabilidad": "VIV-000031-REC-2026-057",
          "saldo_vivo_actual": 500,
          "saldo_asignado_subcampanias": 200
        }
      ]
    }
  ]
}
```

**Notas**
- `saldo_vivo_actual_total` = plantas físicamente en vivero por especie; es lo asignable.
- `saldo_asignado_subcampanias_total` = stock ya entregado a subcampañas con saldo disponible en M3. Informativo: **no** está en el vivero y **no** resta disponibilidad.
- No usar este endpoint como garantía de concurrencia. La garantía final la aplica `POST /lotes-vivero/:id/asignaciones` en BD.

---

## GET /lotes-vivero/:id/saldos

**Rol mínimo**: GENERAL
**Descripción**: Saldos del contrato físico M2-M3 (RN-VIV-57): saldo físico en vivero y stock asignado a subcampañas, con detalle por asignación activa.

**Respuesta exitosa** `200`
```json
{
  "success": true,
  "data": {
    "lote_id": 1,
    "saldo_vivo_actual": 350,
    "saldo_asignado_subcampanias": 150,
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
- `saldo_vivo_actual`: plantas que siguen **físicamente** en el vivero. Contra este saldo se validan asignaciones, despachos manuales y mermas.
- `saldo_asignado_subcampanias`: stock ya **entregado** a subcampañas y aún disponible para consumo en M3. No está en el vivero.
- Ya **no** existe `saldo_vivo_disponible_asignacion`: la identidad `vivo - asignado` no aplica al flujo vigente.

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

---

## POST /lotes-vivero/:id/asignaciones

**Rol mínimo**: GENERAL (global) + **ADMIN o COORDINADOR de la subcampaña**
**Descripción**: Registra la **entrega física** de plantas del lote a una subcampaña (RF-VIV-11). En una sola transacción: crea la asignación, registra el evento M2 `DESPACHO` con `origen_despacho = ASIGNACION_SUBCAMPANIA`, **descuenta `saldo_vivo_actual` del lote**, vincula la evidencia obligatoria de entrega y registra `ASIGNACION_VIVERO` en la línea de tiempo de M3.

**Prerequisito**: subir las fotos de la entrega vía `POST /lotes-vivero/evidencias-pendientes` y enviar sus IDs en `evidencia_ids`.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| subcampania_id | number | ✓ | Subcampaña existente, no eliminada. PLANTACION_INICIAL → ACTIVA; REPOSICION → ACTIVA/COMPLETADA/FINALIZADA_PARCIAL |
| cantidad_asignada | number | ✓ | >= 1, <= `saldo_vivo_actual` del lote |
| proposito | PropositoAsignacion | ✓ | PLANTACION_INICIAL \| REPOSICION |
| fecha_asignacion | string (date) | ✓ | YYYY-MM-DD, dentro de la ventana operativa |
| evidencia_ids | number[] | ✓ | Mínimo 1 evidencia pendiente (RN-VIV-54) |
| observaciones | string | — | Máx. 1000 caracteres |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "asignacion_id": 123,
    "evento_lote_vivero_id": 456,
    "evento_plantacion_id": 789,
    "lote_vivero_id": 31,
    "codigo_trazabilidad_lote": "VIV-000031-REC-2026-057",
    "subcampania_id": 33,
    "subcampania_nombre": "Subcampaña Zona A",
    "campania_id": 7,
    "proposito": "PLANTACION_INICIAL",
    "estado": "ACTIVA",
    "cantidad_asignada": 100,
    "saldo_vivo_antes": 500,
    "saldo_vivo_despues": 400,
    "evidencia_ids_vinculadas": [501],
    "lote_finalizado": false,
    "motivo_cierre": null
  }
}
```

**Concurrencia**
- La entrega es atómica en BD mediante `fn_vivero_asignar_stock_subcampania` (bloquea el lote).
- Si dos usuarios asignan el mismo lote a la vez, la segunda operación revalida el saldo tras el bloqueo y puede devolver 422 si ya no alcanza. El saldo nunca queda negativo.
- Si el saldo del lote llega a 0, el lote se cierra automáticamente (`lote_finalizado: true`).

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida o error no clasificable |
| 401 | Header x-auth-id ausente |
| 403 | Rol global sin permiso de escritura |
| 404 | Lote o subcampaña no encontrados |
| 409 | Subcampaña en BORRADOR o CANCELADA |
| 422 | Lote no ACTIVO, sin EMBOLSADO, saldo físico insuficiente, evidencia faltante, estado incompatible con el propósito, o usuario sin permiso ADMIN/COORDINADOR |
| 500 | RPC no aplicada o no visible en schema cache |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/lotes-vivero/31/asignaciones \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "subcampania_id": 33,
    "cantidad_asignada": 100,
    "proposito": "PLANTACION_INICIAL",
    "fecha_asignacion": "2026-07-06",
    "evidencia_ids": [501]
  }'
```

---

## GET /lotes-vivero/:id/asignaciones

**Rol mínimo**: GENERAL
**Descripción**: Lista todas las asignaciones activas de un lote con sus contadores (`cantidad_asignada/consumida/devuelta/mermada`) y `saldo_asignado_disponible`.

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Header x-auth-id ausente |
| 404 | Lote no encontrado |

---

## POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion

**Rol mínimo**: GENERAL (global) + **ADMIN o COORDINADOR de la subcampaña**
**Descripción**: Registra el **retorno físico** (parcial o total) de plantas asignadas que no fueron consumidas (RF-VIV-12). Aumenta `cantidad_devuelta` de la asignación **y** `saldo_vivo_actual` del lote (RN-VIV-48). Registra el evento M2 `DEVOLUCION_PLANTACION` y el evento M3 `DEVOLUCION_A_VIVERO`. Si el lote estaba FINALIZADO por saldo 0, se **reabre**. En MVP no exige fotos.

Reemplaza al antiguo `DELETE /:id/asignaciones/:asignacionId` (que solo liberaba la reserva sin retornar stock).

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| cantidad_devuelta | number | ✓ | >= 1, <= `saldo_asignado_disponible` |
| motivo_devolucion | MotivoDevolucionPlantacion | ✓ | Ver enum abajo |
| fecha_devolucion | string (date) | ✓ | YYYY-MM-DD, no anterior a la asignación |
| observaciones | string | — | Máx. 1000 caracteres |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "asignacion_id": 10,
    "estado": "DEVUELTA",
    "cantidad_devuelta": 100,
    "cantidad_devuelta_total": 100,
    "saldo_asignado_disponible": 0,
    "lote_vivero_id": 31,
    "saldo_vivo_antes": 400,
    "saldo_vivo_despues": 500,
    "lote_reabierto": false,
    "evento_lote_vivero_id": 460,
    "evento_plantacion_id": 795
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida |
| 401 | Header x-auth-id ausente |
| 403 | Rol global sin permiso de escritura |
| 404 | Lote o asignación no encontrados, o asignación de otro lote |
| 409 | Asignación ya DEVUELTA o cantidad mayor al saldo asignado disponible |
| 422 | Fecha fuera de ventana operativa o usuario sin permiso ADMIN/COORDINADOR |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/lotes-vivero/31/asignaciones/10/devolucion \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "cantidad_devuelta": 100,
    "motivo_devolucion": "SOBRANTE_OPERATIVO",
    "fecha_devolucion": "2026-07-06"
  }'
```

---

## GET /lotes-vivero/:id/timeline

**Rol mínimo**: GENERAL
**Descripción**: Historial completo de eventos del lote (read-only, trazabilidad). Los eventos relevantes para M3 son `DESPACHO` con `origen_despacho = ASIGNACION_SUBCAMPANIA` (salida física por asignación) y `DEVOLUCION_PLANTACION` (entrada física por devolución).

---

## Tipos & Estructuras

### PropositoAsignacion
```
PLANTACION_INICIAL | REPOSICION
```

### MotivoDevolucionPlantacion
```
SOBRANTE_OPERATIVO | ERROR_PLANIFICACION | CAMBIO_SUBCAMPANIA |
CIERRE_SUBCAMPANIA | PROBLEMAS_CALIDAD_LOTE | CONDICIONES_CAMPO_NO_APTAS |
ACCESO_RESTRINGIDO | CANCELACION_ACTIVIDAD | REASIGNACION_PRIORIDAD | OTRO
```

### Asignación
```typescript
{
  id: number;
  lote_vivero_id: number;
  subcampania_id: number;
  subcampania_nombre?: string;
  cantidad_asignada: number;      // inmutable: lo entregado originalmente
  cantidad_consumida: number;     // plantado/repuesto desde esta asignación
  cantidad_devuelta: number;      // devuelto físicamente al vivero
  cantidad_mermada: number;       // perdido en campo antes de plantar (post-MVP)
  saldo_asignado_disponible: number; // asignada - consumida - devuelta - mermada
  proposito: PropositoAsignacion;
  estado: 'ACTIVA' | 'AGOTADA' | 'DEVUELTA';
  usuario_asignacion_id: number;
  fecha_asignacion: string;
  updated_at: string;
}
```

### Saldos del lote
```typescript
{
  lote_id: number;
  saldo_vivo_actual: number | null;      // saldo FÍSICO en vivero
  saldo_asignado_subcampanias: number;   // stock entregado, disponible en M3
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
  saldo_vivo_actual_total: number;            // asignable (físico)
  saldo_asignado_subcampanias_total: number;  // informativo
  lotes: Array<{
    lote_id: number;
    codigo_trazabilidad: string;
    saldo_vivo_actual: number;
    saldo_asignado_subcampanias: number;
  }>;
}
```

---

## Reglas de Negocio

1. **Asignar es entregar** (RN-VIV-47): crear una asignación descuenta `saldo_vivo_actual` del lote en ese momento y genera un evento M2 `DESPACHO / ASIGNACION_SUBCAMPANIA` con evidencia propia (RN-VIV-54).
2. **Validación física**: `cantidad_asignada <= saldo_vivo_actual`. No se restan asignaciones previas: ya descontaron el saldo (RN-VIV-57).
3. **Requisitos del lote** (RN-VIV-61): ACTIVO + evento EMBOLSADO + `saldo_vivo_actual > 0`.
4. **Propósito tipado** (RN-VIV-58): la asignación se consume solo para su propósito. PLANTACION_INICIAL exige subcampaña ACTIVA; REPOSICION admite ACTIVA/COMPLETADA/FINALIZADA_PARCIAL.
5. **Plantar no toca al vivero** (RN-VIV-52): registrar plantación/reposición consume `saldo_asignado_disponible`; no genera eventos M2 ni cambia `saldo_vivo_actual`.
6. **Devolución es física** (RN-VIV-48): aumenta `cantidad_devuelta` y `saldo_vivo_actual`; sin fotos en MVP; `cantidad_asignada` nunca se modifica (RN-VIV-49).
7. **Merma M2 solo físico**: una merma del lote no puede afectar asignaciones ya entregadas.
8. **Despacho manual** (RN-VIV-56): valida contra `saldo_vivo_actual`; `PLANTACION_CAMPANIA` está prohibido como destino manual.

---

## Flujo Típico (M3)

1. **GET /lotes-vivero/stock/especies** → Mostrar disponibilidad física por especie.
2. **GET /lotes-vivero/:id/saldos** → Verificar saldo físico del lote seleccionado.
3. **POST /lotes-vivero/evidencias-pendientes** → Subir fotos de la entrega.
4. **POST /lotes-vivero/:id/asignaciones** → Registrar la entrega física (descuenta saldo).
5. **GET /lotes-vivero/:id/asignaciones** → Ver asignaciones activas y sus saldos.
6. **POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion** → Retornar stock no consumido.
7. **GET /lotes-vivero/:id/timeline** → Auditar historial del lote.
