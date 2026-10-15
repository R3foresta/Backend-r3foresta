# Pruebas Postman

Cookbooks operativos para probar el backend contra entorno local o staging. Cada documento describe pre-condiciones, payload, respuesta esperada y casos de error.

## Lotes de Vivero

| Evento | Documento | Endpoint principal |
|---|---|---|
| Embolsado | [embolsado.md](./embolsado.md) | `POST /api/lotes-vivero/:id/embolsado` |
| Adaptabilidad | [adaptabilidad.md](./adaptabilidad.md) | `POST /api/lotes-vivero/:id/adaptabilidad` |
| Merma | [merma.md](./merma.md) | `POST /api/lotes-vivero/:id/merma` |
| Asignación física + devolución (M2↔M3) | [asignacion-fisica.md](./asignacion-fisica.md) | `POST /api/lotes-vivero/:id/asignaciones` |
| Timeline | [timeline.md](./timeline.md) | `GET /api/lotes-vivero/:id/timeline` |

## Catalogos

| Modulo | Documento | Endpoints |
|---|---|---|
| Plantas | [plantas.md](./plantas.md) | CRUD `/api/plantas` y `/api/plantas/tipos-planta` |

## Subcampañas (Modulo 3)

| Evento | Documento | Endpoint principal |
|---|---|---|
| Cancelar subcampaña (RN-PLA-37) | [cancelar-subcampania.md](./cancelar-subcampania.md) | `POST /api/subcampanias/:id/cancelar` |
| Contexto de plantación inicial | [plantacion-context.md](./plantacion-context.md) | `GET /api/subcampanias/:id/plantacion/context` |

## Campañas (Modulo 3)

| Evento | Documento | Endpoints |
|---|---|---|
| Desactivación con cancelación masiva | [desactivar-campania.md](./desactivar-campania.md) | `GET /api/campanias/:id/desactivacion/preview` + `POST /api/campanias/:id/desactivar` |

Para una visión completa de los endpoints del módulo, ver [../modulos/lotes-vivero.md](../modulos/lotes-vivero.md). Para guía de consumo desde el frontend, ver [../frontend/lotes-vivero.md](../frontend/lotes-vivero.md).

## Pre-condiciones comunes

Todos los flujos requieren:

1. Una **recolección VALIDADA con saldo disponible** (`estado_registro = VALIDADO`, `saldo_actual > 0`).
2. Un **vivero** registrado y accesible para el usuario operativo.
3. Bearer JWT válido de una cuenta interna activa y autoridad para la operación. `x-auth-id` por sí solo no autentica; si se conserva, debe coincidir con `sub`.
4. Para crear el lote, haber subido **evidencias pendientes** vía `POST /api/lotes-vivero/evidencias-pendientes` (devuelve `evidencia_ids`).

## Despacho

El despacho manual está implementado y rechaza `PLANTACION_CAMPANIA`; entregar a campo usa asignación física. Ver [guía M2↔M3](../frontend/guia-migracion-asignacion-fisica.md).

Para gestión de accesos usar [participación](../modulos/participacion.md) y sus ejemplos HTTP ejecutados. Las precondiciones físicas de Vivero anteriores no se aplican a sus lecturas/comandos de acceso.
