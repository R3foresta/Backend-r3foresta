# Pruebas Postman

Cookbooks operativos para probar el backend contra entorno local o staging. Cada documento describe pre-condiciones, payload, respuesta esperada y casos de error.

## Lotes de Vivero

| Evento | Documento | Endpoint principal |
|---|---|---|
| Embolsado | [embolsado.md](./embolsado.md) | `POST /api/lotes-vivero/:id/embolsado` |
| Adaptabilidad | [adaptabilidad.md](./adaptabilidad.md) | `POST /api/lotes-vivero/:id/adaptabilidad` |
| Merma | [merma.md](./merma.md) | `POST /api/lotes-vivero/:id/merma` |
| Timeline | [timeline.md](./timeline.md) | `GET /api/lotes-vivero/:id/timeline` |

## Catalogos

| Modulo | Documento | Endpoints |
|---|---|---|
| Plantas | [plantas.md](./plantas.md) | CRUD `/api/plantas` y `/api/plantas/tipos-planta` |

Para una visión completa de los endpoints del módulo, ver [../modulos/lotes-vivero.md](../modulos/lotes-vivero.md). Para guía de consumo desde el frontend, ver [../frontend/lotes-vivero.md](../frontend/lotes-vivero.md).

## Pre-condiciones comunes

Todos los flujos requieren:

1. Una **recolección VALIDADA con saldo disponible** (`estado_registro = VALIDADO`, `saldo_actual > 0`).
2. Un **vivero** registrado y accesible para el usuario operativo.
3. Header `x-auth-id` con el `auth_id` de Supabase del usuario.
4. Para crear el lote, haber subido **evidencias pendientes** vía `POST /api/lotes-vivero/evidencias-pendientes` (devuelve `evidencia_ids`).

## Despacho

El endpoint `POST /api/lotes-vivero/:id/despacho` está expuesto pero el backend devuelve `501 Not Implemented`. Ver TODO en [../README.md](../README.md).
