# Contexto de plantación inicial

`GET /api/subcampanias/:id/plantacion/context`

Entrega en una sola llamada todo lo necesario para registrar una plantación inicial desde campo, sin que el frontend tenga que resolver asignaciones buscando lote por lote.

## Pre-condiciones

1. Subcampaña existente, no eliminada y en estado `ACTIVA`.
2. Usuario con rol global operativo (`ADMIN`, `VALIDADOR` o `GENERAL`) que **pertenece al equipo** de la subcampaña como `COORDINADOR` u `OPERARIO`. Aplica también a `ADMIN`: sin fila en `SUBCAMPANIA_EQUIPO` no hay contexto.
3. La subcampaña tiene plan por especie (`SUBCAMPANIA_META_ESPECIE`), polígono evaluable y al menos una asignación `ACTIVA` con `proposito = PLANTACION_INICIAL` y saldo disponible.

## Request

```
GET {{base_url}}/api/subcampanias/123/plantacion/context
x-auth-id: {{auth_id}}
```

## Respuesta 200

```json
{
  "success": true,
  "data": {
    "subcampania": {
      "id": 123,
      "codigo_trazabilidad": "SUB-001-CMP-2026-001",
      "nombre": "Subcampaña Norte",
      "estado": "ACTIVA",
      "fase_mantenimiento": "NO_APLICA",
      "campania_id": 10,
      "campania_nombre": "Campaña 2026",
      "zona_id": 44,
      "zona_nombre": "Comunidad X",
      "meta_total_arboles": 500,
      "total_plantado_inicial": 120,
      "tolerancia_gps_metros": 30,
      "poligono": { "type": "Polygon", "coordinates": [] }
    },
    "usuario": {
      "id": 7,
      "nombre": "Usuario Campo",
      "rol_global": "ADMIN",
      "rol_en_subcampania": "OPERARIO",
      "puede_registrar": true,
      "motivo_bloqueo": null
    },
    "equipo": [
      { "usuario_id": 7, "nombre_usuario": "Usuario Campo", "rol": "OPERARIO" },
      { "usuario_id": 9, "nombre_usuario": "Otro Operario", "rol": "OPERARIO" }
    ],
    "plan_por_especie": [
      {
        "planta_id": 5,
        "nombre_comun_principal": "Molle",
        "nombre_cientifico": "Schinus molle",
        "cantidad_objetivo": 200,
        "plantado_inicial": 80,
        "pendiente_meta": 120
      }
    ],
    "stock_por_especie": [
      {
        "planta_id": 5,
        "nombre_comun_principal": "Molle",
        "nombre_cientifico": "Schinus molle",
        "stock_asignado_disponible": 150,
        "asignaciones": [
          {
            "asignacion_id": 55,
            "lote_vivero_id": 31,
            "codigo_lote": "VIV-000031",
            "vivero_nombre": "Vivero Central",
            "fecha_asignacion": "2026-07-01",
            "cantidad_asignada": 100,
            "cantidad_consumida": 20,
            "cantidad_devuelta": 0,
            "cantidad_mermada": 0,
            "saldo_asignado_disponible": 80,
            "orden_consumo": 1
          }
        ]
      }
    ],
    "reglas": {
      "max_dias_retroactivos": 10,
      "gps_fuera_poligono_bloquea": false,
      "precision_gps_advertencia_m": 50,
      "requiere_evidencia": true,
      "min_fotos": 1,
      "max_fotos": 10,
      "permite_exceder_meta_especie": false,
      "orden_consumo_asignaciones": "fecha_asignacion ASC, asignacion_id ASC"
    }
  }
}
```

## Cómo consume el frontend

El campo clave es `stock_por_especie[].asignaciones`. Con eso el frontend transforma la intención del operario:

```json
{ "planta_id": 5, "cantidad": 70 }
```

en los `detalles` que espera `POST /api/plantaciones`:

```json
[
  { "asignacion_id": 55, "lote_vivero_id": 31, "planta_id": 5, "cantidad": 70 }
]
```

Si hay varias asignaciones de la misma especie, se consume automáticamente en `orden_consumo` (`fecha_asignacion ASC, asignacion_id ASC`), rebalsando a la siguiente cuando el saldo no alcanza. **No se le pregunta al operario.**

Las `reglas` son espejo de validaciones que la RPC `fn_m3_registrar_plantacion` aplica igualmente en el servidor (ver `src/subcampanias/domain/policies/reglas-plantacion.policy.ts`); el frontend las usa para validar antes de enviar, no las reemplaza.

## Errores

| Código | Caso |
|---|---|
| `401` | Falta header `x-auth-id`. |
| `403` | Rol global sin permiso operativo, o el usuario no pertenece al equipo como `COORDINADOR`/`OPERARIO` (incluye `ADMIN` fuera del equipo). |
| `404` | Subcampaña no existe (o eliminada), o usuario no encontrado. |
| `409` | Subcampaña no está `ACTIVA`. |
| `422` | Sin plan por especie, sin polígono evaluable, o sin stock asignado disponible (`ACTIVA` + `PLANTACION_INICIAL`). El mensaje lista todos los motivos. |
