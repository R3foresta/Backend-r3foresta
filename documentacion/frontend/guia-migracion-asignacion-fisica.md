# Guía de migración frontend — Asignación física M2 ↔ M3 (2026-07)

El backend migró del modelo "reserva lógica + despacho automático al plantar"
al contrato vigente de **asignación física + consumo de stock asignado**
(contrato `90-contratos-integracion/02_contrato_vivero_a_plantacion.md`,
RN-VIV-47..61). Esta guía resume todo lo que el cliente PWA debe cambiar.

## Cambio conceptual

| Antes (reserva lógica) | Ahora (entrega física) |
|---|---|
| Asignar = apartar saldo dentro del vivero | Asignar = **entregar plantas**: el saldo del lote baja en ese momento |
| Plantar generaba `DESPACHO AUTOMATICO_PLANTACION` y bajaba el saldo del lote | Plantar solo consume `saldo_asignado_disponible`; **no toca al vivero** |
| Cancelar asignación liberaba la reserva | Devolver = **retorno físico**: el saldo del lote sube |
| Disponible = `saldo_vivo_actual - saldo_asignado_total` | Disponible = `saldo_vivo_actual` (físico) |

## Endpoints

| Endpoint | Cambio |
|---|---|
| `POST /lotes-vivero/:id/reservas` | **ELIMINADO**. Usar `POST /lotes-vivero/:id/asignaciones` |
| `POST /lotes-vivero/:id/asignaciones` | Nuevo contrato: body exige `proposito`, `fecha_asignacion` y `evidencia_ids` (mínimo 1, pre-subidas vía `POST /lotes-vivero/evidencias-pendientes`). Response nueva (ver módulo) |
| `DELETE /lotes-vivero/:id/asignaciones/:asignacionId` | **ELIMINADO**. Usar `POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion` con `cantidad_devuelta`, `motivo_devolucion` y `fecha_devolucion` (sin fotos en MVP) |
| `POST /registros-plantacion` | Mismo request; la response reemplaza `despachos` por `consumos`. La reposición ahora también se acepta con subcampaña `COMPLETADA` / `FINALIZADA_PARCIAL` |
| `GET /lotes-vivero/:id/saldos` | `saldo_asignado_total` → `saldo_asignado_subcampanias`; `saldo_vivo_disponible_asignacion` **desaparece** |
| `GET /lotes-vivero` y `GET /lotes-vivero/:id` | Ídem: exponen `saldo_asignado_subcampanias`; ya no hay `saldo_vivo_disponible_asignacion` |
| `GET /lotes-vivero/stock/especies` | `saldo_reservado*` y `saldo_disponible*` → `saldo_vivo_actual*` (asignable) y `saldo_asignado_subcampanias*` (informativo) |
| `POST /subcampanias/:id/activar` | `composicion_reservada` → `composicion_asignada` (campo interno `saldo_reservado` → `saldo_asignado_disponible`) |
| `POST /subcampanias/:id/cancelar` | Mismo request; ahora la cancelación devuelve físicamente el stock al vivero y deja eventos M2/M3 |

## Campos renombrados / eliminados

| Antes | Ahora |
|---|---|
| `saldo_asignado_total` | `saldo_asignado_subcampanias` |
| `saldo_vivo_disponible_asignacion` | — (usar `saldo_vivo_actual`) |
| `saldo_reservado`, `saldo_disponible` (stock/especies) | `saldo_asignado_subcampanias`, `saldo_vivo_actual` |
| `despachos` (response de plantación) | `consumos` |
| `composicion_reservada` / `saldo_reservado` (activación) | `composicion_asignada` / `saldo_asignado_disponible` |

## Validaciones que cambian para UX

- **Cantidad máxima al asignar**: ya no es `vivo - asignado`; es directamente `saldo_vivo_actual` del lote.
- **Asignar exige evidencia**: flujo de dos pasos — subir fotos (`/lotes-vivero/evidencias-pendientes`) y luego asignar con `evidencia_ids`. Un 422 con "evidencia" indica fotos faltantes o ya vinculadas.
- **Permisos**: asignar y devolver requieren ADMIN global o COORDINADOR de la subcampaña (422 si no).
- **Plantación inicial valida meta por especie**: 400 si la especie no está en el plan o si el acumulado supera `cantidad_objetivo`.
- **Reposición valida pendiente**: 400 si la cantidad excede `muertas - repuestas` del grupo origen.
- **Lote cerrado por asignación total**: si `lote_finalizado: true` en la response de asignación, el lote quedó FINALIZADO (saldo 0). Una devolución posterior puede reabrirlo (`lote_reabierto: true`).

## Mensajes de UI

Reemplazar todo lenguaje de "reservar / reserva / liberar reserva" por
"asignar / entrega / devolver". Sugerencias:

- "Reservar stock" → **"Asignar (entregar) plantas"**
- "Reservado para subcampañas" → **"Entregado a subcampañas"**
- "Liberar reserva" / "Cancelar asignación" → **"Devolver al vivero"**
- "Disponible para reserva" → **"Disponible en vivero"**
- El detalle de un despacho con `origen_despacho = ASIGNACION_SUBCAMPANIA` debe leerse como "Salida por asignación a subcampaña"; `AUTOMATICO_PLANTACION` solo aparece en historial legado.
- Nuevo evento M2 `DEVOLUCION_PLANTACION` en el timeline del lote: "Devolución desde plantación (+N)".

## Orden de despliegue

Backend (migraciones 051–055 + API) y frontend deben desplegarse coordinados:
la API nueva rechaza los requests con el shape viejo (faltará `evidencia_ids`
en asignación) y los campos renombrados desaparecen de las responses.
