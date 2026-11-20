# Módulo: Plantaciones (Registros de Plantación)

Plantación inicial usa las rutas v1 de [Participación](../../modulos/participacion.md). La reposición interna usa `/api/registros-plantacion`.

Ambos recorridos guardan `original` y `derivada.jpg` en el bucket privado
`participacion_evidencias`, bajo `inicial/` y `reposiciones/` respectivamente.
La imagen pública elegible se consulta por la API de Impacto. [Mapa de Storage](../../modulos/storage-evidencias.md)

> **Cambio de contrato (2026-07)**: registrar una plantación **ya no genera
> despachos automáticos en Vivero** ni modifica `saldo_vivo_actual` del lote
> (RN-VIV-52/55). La plantación consume el stock que la subcampaña recibió al
> crear la **asignación física** (`saldo_asignado_disponible`). La respuesta
> reemplaza `despachos` por `consumos`. Ver la
> [guía de migración](../guia-migracion-asignacion-fisica.md).

---

## POST /registros-plantacion/evidencias-pendientes 📎

Sube fotos de reposición para una cuenta interna activa que pertenece al equipo
como `COORDINADOR` u `OPERARIO`. Enviar los `evidencia_ids` devueltos a
`POST /api/registros-plantacion` para vincularlas.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| Authorization | ✓ | `Bearer <JWT>` verificado |
| Content-Type | ✓ | `multipart/form-data` |

**Body** (`multipart/form-data`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| subcampania_id | string BIGINT | ✓ | Subcampaña autorizada |
| es_reposicion | boolean | ✓ | `true` |
| fotos | file[] | ✓ | De 1 a 10 archivos, cada uno hasta 10 MiB |
| titulo | string | — | max 120 caracteres |
| descripcion | string | — | max 1000 caracteres |
| tomado_en | string | — | ISO date |
| es_principal | boolean | — | La principalidad se establece al vincular |

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida, archivos inválidos |
| 401 | Bearer ausente o inválido |
| 409 | Contrato incompatible si falta el contexto de reposición |

---

## DELETE /registros-plantacion/evidencias-pendientes

**Rol mínimo**: GENERAL
**Descripción**: Descarta evidencias pendientes de plantación que ya fueron pre-subidas pero no se usarán en `POST /registros-plantacion` porque el usuario canceló el flujo o el registro final no se completará. El backend marca las evidencias como eliminadas y borra sus archivos de Storage.

Los IDs inexistentes, ya vinculados o de otra cuenta se devuelven en
`evidencia_ids_ignoradas`. Repetir un descarte propio permite completar la
limpieza de sus archivos cuando falla Storage después del borrado lógico.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| Authorization | ✓ | `Bearer <JWT>` verificado |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| subcampania_id | string BIGINT | ✓ | Mismo ámbito de la carga |
| es_reposicion | boolean | ✓ | `true` |
| evidencia_ids | (number \| string)[] | ✓ | IDs devueltos por `POST /registros-plantacion/evidencias-pendientes` |

**Respuesta exitosa** `200`

```json
{
  "success": true,
  "data": {
    "evidencia_ids_descartadas": [50, 51],
    "evidencia_ids_ignoradas": [999]
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | IDs inválidos |
| 401 | Bearer ausente o inválido |
| 403 | Rol global insuficiente |
| 404 | Usuario no encontrado o falta tipo_entidad_evidencia REGISTRO_PLANTACION |
| 500 | Error al marcar evidencias o borrar archivos de Storage |

---

## POST /registros-plantacion

**Rol mínimo**: GENERAL (el responsable debe pertenecer al equipo de la subcampaña como COORDINADOR u OPERARIO)
Registra una reposición interna **consumiendo stock ya asignado físicamente** a la subcampaña. La RPC valida estado, GPS, equipo, asignaciones activas de reposición y pendiente del grupo origen. En la misma transacción inserta el registro, detalles y corresponsables, actualiza el consumo de las asignaciones y vincula las fotos propias. La plantación inicial y sus fotos se registran por [Participación v1](../../modulos/participacion.md).

Desde la migración 061, `cantidad_objetivo` es una meta orientativa: una especie incluida en el plan puede superar su objetivo si existe stock asignado. Por ejemplo, meta 40 y asignación 50 permiten plantar 50 de una vez, o 40 y luego 10. Alcanzar o superar la meta no cierra la subcampaña; el cierre es manual. El contexto entrega `reglas.permite_exceder_meta_especie: true`, que el frontend usa para limitar la entrada al stock, sin limitarla al pendiente de la meta.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| Authorization | ✓ | `Bearer <JWT>` verificado |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| subcampania_id | string BIGINT | ✓ | Subcampaña `ACTIVA`, `COMPLETADA` o `FINALIZADA_PARCIAL` |
| es_reposicion | boolean | ✓ | `true` |
| registro_plantacion_origen_id | string BIGINT | ✓ | Registro inicial de la misma subcampaña |
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
| 400 | Estado de subcampaña incompatible, GPS no evaluable, responsable/coresponsable fuera del equipo, saldo asignado insuficiente, propósito incoherente, especie fuera del plan, reposición mayor al pendiente del grupo origen, evidencias inválidas |
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
4. **Meta por especie** (inicial): la especie debe existir en el plan (`SUBCAMPANIA_META_ESPECIE`). `cantidad_objetivo` orienta la planificación; se permiten cantidades mayores hasta consumir el stock asignado disponible. La subcampaña permanece ACTIVA hasta el cierre manual.
5. **Tope de reposición**: la cantidad total no puede exceder `cantidad_muerta_acumulada - cantidad_repuesta_acumulada` del grupo origen. La reposición **no** avanza la meta.
6. **Reposición libre de especie** (RN-VIV-60): puede usar cualquier especie disponible en asignaciones REPOSICION.
7. **Conservación** (RN-VIV-53): `SUM(detalles.cantidad) = cantidad_total_plantada`.
8. **GPS**: fuera de polígono no aborta; se guarda `gps_dentro_poligono=false` como bandera.
9. **Código de trazabilidad**: `PLT-NNN-{codigo_subcampania}`.

---

## Flujo de reposición interna

1. Vivero entrega stock de propósito `REPOSICION` mediante `POST /api/lotes-vivero/:id/asignaciones`.
2. Subir las fotos con `POST /api/registros-plantacion/evidencias-pendientes` y conservar los `evidencia_ids`.
3. Registrar la reposición con `POST /api/registros-plantacion` y sus IDs de evidencia. Si se cancela antes de confirmar, usar `DELETE /api/registros-plantacion/evidencias-pendientes` con el mismo ámbito y los IDs.
