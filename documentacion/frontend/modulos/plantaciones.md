# Módulo: Plantaciones (Registros de Plantación)

Base URL: `/api/registros-plantacion`

> **Cambio de contrato (2026-07)**: registrar una plantación **ya no genera
> despachos automáticos en Vivero** ni modifica `saldo_vivo_actual` del lote
> (RN-VIV-52/55). La plantación consume el stock que la subcampaña recibió al
> crear la **asignación física** (`saldo_asignado_disponible`). La respuesta
> reemplaza `despachos` por `consumos`. Ver la
> [guía de migración](../guia-migracion-asignacion-fisica.md).

---

## POST /registros-plantacion/evidencias-pendientes 📎

**Rol mínimo**: GENERAL
**Descripción**: Sube fotos y crea evidencias pendientes (entidad_id=0) del tipo REGISTRO_PLANTACION. Sus IDs se envían luego en `POST /registros-plantacion` para vinculación atómica.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `multipart/form-data` |

**Body** (`multipart/form-data`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| fotos | file[] | ✓ | max 10 archivos |
| titulo | string | — | max 120 caracteres |
| descripcion | string | — | max 1000 caracteres |
| metadata | string | — | JSON serializado (opcional) |
| tomado_en | string | — | ISO date |
| es_principal | boolean | — | true si es la foto principal (default false) |

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida, archivos inválidos |
| 401 | Header x-auth-id ausente |

---

## POST /registros-plantacion

**Rol mínimo**: GENERAL (el responsable debe pertenecer al equipo de la subcampaña como COORDINADOR u OPERARIO)
**Descripción**: Registra una plantación inicial o una reposición **consumiendo stock ya asignado físicamente** a la subcampaña. En una sola transacción (RPC `fn_m3_registrar_plantacion`): valida estado de la subcampaña, GPS contra polígono, equipo, asignaciones ACTIVAS de propósito coherente y su `saldo_asignado_disponible`, la meta por especie (inicial) y el pendiente de reposición del grupo origen (reposición); inserta el registro + detalles + coresponsables, aumenta `cantidad_consumida` de las asignaciones, actualiza contadores de la subcampaña y vincula evidencias. **No crea eventos en Vivero ni cambia el saldo del lote.**

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| subcampania_id | number | ✓ | Inicial: subcampaña ACTIVA. Reposición: ACTIVA, COMPLETADA o FINALIZADA_PARCIAL |
| es_reposicion | boolean | — | default false |
| registro_plantacion_origen_id | number | — | Obligatorio si es_reposicion=true; el origen no puede ser otra reposición |
| fecha_plantacion | string | ✓ | YYYY-MM-DD; no anterior a la entrega del stock consumido |
| latitud | number | ✓ | [-90, 90] |
| longitud | number | ✓ | [-180, 180] |
| observaciones | string | — | max 2000 caracteres |
| coresponsable_ids | number[] | — | Subset del equipo de la subcampaña |
| detalles | PlantacionDetalle[] | ✓ | Mínimo 1 |
| evidencia_ids | number[] | ✓ | Mínimo 1 evidencia pendiente |

**PlantacionDetalle**:
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| asignacion_id | number | ✓ | Asignación ACTIVA de la subcampaña, con propósito coherente (inicial↔PLANTACION_INICIAL, reposición↔REPOSICION) |
| lote_vivero_id | number | ✓ | Debe coincidir con el lote de la asignación |
| planta_id | number | ✓ | Debe coincidir con la planta del lote |
| cantidad | number | ✓ | >= 1; por asignación no puede exceder `saldo_asignado_disponible` |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "message": "Plantacion registrada correctamente.",
    "registro_plantacion_id": 41,
    "codigo_trazabilidad": "PLT-001-SUB-001-CMP-2026-001",
    "cantidad_total_plantada": 100,
    "gps_dentro_poligono": true,
    "gps_distancia_a_poligono_m": 0,
    "consumos": [
      {
        "asignacion_id": 10,
        "lote_vivero_id": 31,
        "cantidad_consumida": 100,
        "saldo_asignado_antes": 150,
        "saldo_asignado_despues": 50,
        "estado_final": "ACTIVA"
      }
    ],
    "coresponsable_ids_vinculados": [],
    "evidencia_ids_vinculadas": [50, 51]
  }
}
```

> La respuesta **no incluye `despachos`**: plantar no genera eventos M2. El
> campo `consumos` detalla qué asignaciones se consumieron y con qué saldos.

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Estado de subcampaña incompatible, GPS no evaluable, responsable/coresponsable fuera del equipo, saldo asignado insuficiente, propósito incoherente, especie fuera del plan o meta excedida, reposición mayor al pendiente del grupo origen, evidencias inválidas |
| 401 | Header x-auth-id ausente |
| 403 | Rol global insuficiente |
| 404 | Usuario o subcampaña no encontrada |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/registros-plantacion \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "subcampania_id": 33,
    "fecha_plantacion": "2026-07-06",
    "latitud": -16.2902,
    "longitud": -68.1193,
    "observaciones": "Plantacion inicial sector A",
    "detalles": [
      {
        "asignacion_id": 10,
        "lote_vivero_id": 31,
        "planta_id": 5,
        "cantidad": 100
      }
    ],
    "evidencia_ids": [50, 51]
  }'
```

---

## Tipos & Estructuras

### PlantacionDetalle
```typescript
{
  asignacion_id: number;
  lote_vivero_id: number;
  planta_id: number;
  cantidad: number;
}
```

### ConsumoAsignacion (respuesta)
```typescript
{
  asignacion_id: number;
  lote_vivero_id: number;
  cantidad_consumida: number;
  saldo_asignado_antes: number;
  saldo_asignado_despues: number;
  estado_final: 'ACTIVA' | 'AGOTADA' | null;
}
```

---

## Reglas de Negocio

1. **Consumo de asignaciones** (RN-VIV-52): la plantación consume `saldo_asignado_disponible` de asignaciones ACTIVAS de la subcampaña. No genera despachos M2 ni toca `LOTE_VIVERO.saldo_vivo_actual`.
2. **Propósito tipado** (RN-VIV-58): inicial consume asignaciones PLANTACION_INICIAL; reposición consume REPOSICION. Nunca cruzados.
3. **Estados**: inicial solo con subcampaña ACTIVA; reposición también en COMPLETADA y FINALIZADA_PARCIAL.
4. **Meta por especie** (inicial): la especie debe existir en el plan (`SUBCAMPANIA_META_ESPECIE`) y el acumulado de plantaciones iniciales no puede exceder `cantidad_objetivo`.
5. **Tope de reposición**: la cantidad total no puede exceder `cantidad_muerta_acumulada - cantidad_repuesta_acumulada` del grupo origen. La reposición **no** avanza la meta.
6. **Reposición libre de especie** (RN-VIV-60): puede usar cualquier especie disponible en asignaciones REPOSICION.
7. **Conservación** (RN-VIV-53): `SUM(detalles.cantidad) = cantidad_total_plantada`.
8. **GPS**: fuera de polígono no aborta; se guarda `gps_dentro_poligono=false` como bandera.
9. **Código de trazabilidad**: `PLT-NNN-{codigo_subcampania}`.

---

## Flujo Típico

1. **Vivero entrega stock**: `POST /lotes-vivero/:id/asignaciones` (asignación física; ver módulo lotes-vivero-m3).
2. **POST /registros-plantacion/evidencias-pendientes** → Subir fotos de la plantación.
3. **POST /registros-plantacion** → Registrar consumo de las asignaciones.
4. **Sobrante**: `POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion` → devolver físicamente lo no plantado.
