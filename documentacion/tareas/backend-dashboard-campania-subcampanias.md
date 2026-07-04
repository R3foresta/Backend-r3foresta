# Tarea backend: endpoints faltantes para dashboard de campaña/subcampañas

Fecha: 2026-07-03
Prioridad: Alta
Modulo: Plantacion / Campanias / Subcampanias

## Contexto

El frontend del dashboard necesita reemplazar datos mock por contratos reales del backend. Actualmente existen endpoints base de `campanias` y `subcampanias`, pero faltan dos lecturas agregadas para el dashboard y el payload de subcampañas no trae todos los campos necesarios para renderizar las cards sin llamadas adicionales.

Ademas, queda una regla de negocio cerrada que debe aplicarse en backend:

- `RN-PLA-38` vigente: `CAMPANIA` admite correcciones basicas (`nombre`, `descripcion`, fechas estimadas y organizaciones asociadas) sin romper trazabilidad. `tipo` solo se puede cambiar si no existe ninguna `SUBCAMPANIA` asociada. La campaña se puede desactivar/inactivar logicamente si no tiene subcampañas, o si todas sus subcampañas estan `CANCELADA`. El `DELETE` fisico solo se permite si no existe ninguna subcampaña asociada.
- Referencia de reglas: `/Users/pabloandresfernandezcari/Projects/R3foresta/r3foresta-docs/03-plantacion-module/01_reglas_de_negocio_plantacion.md:54`
- ADR cerrado: `/Users/pabloandresfernandezcari/Projects/R3foresta/r3foresta-docs/decisiones/02_decisiones_plantacion.md:1`
- Existe una propuesta en `/Users/pabloandresfernandezcari/Projects/R3foresta/r3foresta-docs/database/migrations/050_m3_campania_edicion_eliminacion_estricta_mvp.sql`; revisar y adaptar a la implementacion real del backend/BD.

## Alcance

Implementar:

1. **P0:** Ampliacion de `GET /api/campanias/:id/subcampanias` y/o `GET /api/subcampanias?campania_id=:id`.
2. **P0:** `GET /api/campanias/:id/metrics` con metricas basicas.
3. **P0:** Aplicacion de `RN-PLA-38` actualizada: permitir edicion basica, bloquear cambio de `tipo` con subcampañas, regular desactivacion/inactivacion y bloquear `DELETE` fisico con subcampañas.
4. **P1:** `GET /api/campanias/:id/activity?limit=5` simple, usando solo fuentes disponibles.

No implementar en esta tarea:

- Edicion flexible de campañas con subcampañas en `BORRADOR`.
- Propagacion de cambios desde campaña a subcampañas.
- Cancelacion en cascada de subcampañas desde campaña.
- Flujo nuevo sofisticado de cambio de coordinador/equipo. Para esta tarea basta lectura de equipo y respetar las validaciones existentes.
- Formula final de carbono si producto no la confirma. No bloquear el endpoint por esto.
- Timeline/auditoria perfecta de todos los eventos. Para MVP basta actividad reciente simple.
- Alias `POST /api/campanias/:id/desactivar` salvo que sea trivial. Preferir reutilizar `DELETE /api/campanias/:id` como soft-delete si ya existe ese contrato.

## Orden sugerido de implementacion MVP

1. Payload enriquecido de subcampañas: desbloquea las cards principales del dashboard.
2. Metricas basicas de campaña: supervivencia, hectareas, comunidades, eventos y ultima actividad.
3. `RN-PLA-38`: reglas de edicion/desactivacion de campaña.
4. Activity simple: suficiente para mostrar movimiento reciente sin construir un modulo de auditoria completo.

## 1. Metricas agregadas de campaña

Endpoint:

```http
GET /api/campanias/:id/metrics
```

Respuesta:

```ts
{
  supervivencia_pct: number;
  co2_proyectado_ton: number;
  hectareas: number;
  comunidades_count: number;
  eventos_count: number;
  ultima_actividad: {
    autor: string;
    detalle: string;
    timestamp: string;
  } | null;
}
```

Criterios:

- Validar que la campaña exista y no tenga `deleted_at`.
- `supervivencia_pct`: calcular sobre subcampañas de la campaña usando `saldo_vivo_actual` y `total_plantado_inicial + total_repuesto`. Si el denominador es 0, devolver `0`.
- `hectareas`: sumar `subcampania.area_hectareas`, tratando `null` como 0.
- `comunidades_count`: contar `zona_id` distintos de subcampañas de la campaña.
- `eventos_count`: MVP simple. Contar registros/eventos faciles de consultar sin N+1; como minimo `registro_plantacion` y `subcampania_historial` si existe. Agregar `evento_plantacion` solo si ya esta disponible sin complejidad.
- `ultima_actividad`: devolver el evento mas reciente de la misma fuente usada por `activity`; `null` si no hay actividad.
- `co2_proyectado_ton`: para MVP devolver `0` con comentario/TODO documentado si no hay formula cerrada. No inventar formula compleja ni bloquear el endpoint por este campo.

## 2. Actividad reciente

MVP: actividad simple, no timeline exhaustivo.

Endpoint:

```http
GET /api/campanias/:id/activity?limit=5
```

Respuesta:

```ts
Array<{
  id: string;
  tipo: 'plantacion' | 'nueva_subcampana' | 'activacion' | 'cancelacion' | 'cambio_coordinador';
  autor: string;
  detalle: string;
  ubicacion: string;
  timestamp: string;
}>
```

Criterios:

- Validar campaña existente.
- `limit` default `5`; aceptar rango razonable, por ejemplo `1..50`.
- Ordenar descendente por `timestamp`.
- Normalizar eventos desde:
  - `registro_plantacion` como `plantacion`.
  - `subcampania_historial` para `nueva_subcampana`, `activacion`, `cancelacion`, `cambio_coordinador`, solo si la tabla/eventos ya existen en el backend actual.
- `autor`: nombre completo del usuario responsable/creador cuando exista; fallback controlado, por ejemplo `"Sistema"` o string vacio segun convencion del backend.
- `detalle`: para plantacion debe incluir cantidad, por ejemplo `"12 arboles"`. Para eventos sin cantidad puede ser string vacio.
- `ubicacion`: nombre de subcampaña o zona si aplica.
- Si una fuente no existe o no esta poblada todavia, no bloquear la entrega: usar las fuentes disponibles y devolver `[]` si no hay actividad.
- `metrics.ultima_actividad` debe reutilizar la misma construccion simple de este endpoint para evitar discrepancias.

## 3. Payload enriquecido de subcampañas

Endpoint afectado:

```http
GET /api/campanias/:id/subcampanias
```

Mantener compatibilidad con:

```http
GET /api/subcampanias?campania_id=:id
```

Cada item debe incluir:

```ts
{
  // campos actuales de Subcampania
  zona_nombre: string;
  area_hectareas: number | null;
  plantados: number | null;
  avance_pct: number | null;
  has_plan_especies: boolean;
  personas_count: number | null;
  lotes_count: number | null;
  eventos_count: number | null;
  equipo: EquipoMember[];
}
```

Criterios:

- `zona_nombre`: resolver desde `division_administrativa` o snapshot si corresponde.
- `area_hectareas`: usar `subcampania.area_hectareas`.
- `plantados`: mapear desde `total_plantado_inicial`.
- `avance_pct`: `plantados / meta_total_arboles * 100`, acotado a `0..100`; si la meta es 0/null devolver `null`.
- `has_plan_especies`: `true` si existen filas en `subcampania_meta_especie`.
- `personas_count`: cantidad de miembros en `subcampania_equipo`.
- `lotes_count`: cantidad de lotes/asignaciones vinculadas a la subcampaña.
- `eventos_count`: total de eventos relevantes de esa subcampaña.
- `equipo`: incluir siempre array, aunque este vacio.
- `equipo`: resolver desde `subcampania_equipo`, incluyendo al menos `usuario_id`, nombre visible y `rol` (`COORDINADOR | OPERARIO`) si el backend ya expone esos datos.
- No agregar `coordinador_id` en `SUBCAMPANIA`; el coordinador vive como membresia en `subcampania_equipo`.

## 4. RN-PLA-38: edicion basica y desactivacion de campaña

Regla:

`CAMPANIA` admite correcciones basicas sin cascada:

- Se puede editar `nombre`.
- Se puede editar `descripcion`.
- Se pueden editar `fecha_estimada_inicio` y `fecha_estimada_fin`.
- Se pueden asociar/desasociar organizaciones (`CAMPANIA_ORGANIZACION`).
- No se edita `codigo_trazabilidad`.
- `tipo` solo puede cambiar si no existe ninguna `SUBCAMPANIA` asociada.

Para cambio de `tipo`, debe contar cualquier subcampaña asociada:

- Subcampañas `BORRADOR`.
- Subcampañas `ACTIVA`.
- Subcampañas `CANCELADA`.
- Subcampañas historicas o soft-deleted.

Implementar el bloqueo de `tipo` con equivalente a:

```sql
EXISTS (
  SELECT 1
  FROM subcampania
  WHERE campania_id = :campania_id
)
```

Desactivacion/inactivacion logica:

- Permitida si no existe ninguna subcampaña asociada.
- Permitida si todas las subcampañas asociadas estan `CANCELADA`.
- Bloqueada si existe al menos una subcampaña en `BORRADOR`, `ACTIVA`, `COMPLETADA`, `FINALIZADA_PARCIAL` o `PAUSADA`.
- Justificacion: `CANCELADA` solo existe sin plantaciones iniciales (`RN-PLA-37`).

`DELETE` fisico:

- Solo permitido si no existe ninguna subcampaña asociada.
- Si existe cualquier subcampaña asociada, incluso `CANCELADA` o soft-deleted, bloquear `DELETE` fisico.

Endpoints afectados:

- `PATCH /api/campanias/:id`
- `DELETE /api/campanias/:id`
- `POST /api/campanias/:id/desactivar`, si se decide exponer este contrato para el frontend.
- `POST /api/campanias/:id/organizaciones`
- `DELETE /api/campanias/:id/organizaciones/:orgId`

Criterios:

- `PATCH` debe permitir datos generales y organizaciones segun lo anterior.
- `PATCH` debe bloquear cambio de `tipo` si existe cualquier subcampaña asociada.
- `DELETE` usado como soft-delete debe permitir desactivar si no hay subcampañas o todas estan `CANCELADA`.
- `DELETE` fisico, si existe internamente, debe bloquearse si hay cualquier subcampaña asociada.
- Responder `422 Unprocessable Entity` con mensaje claro cuando se bloquee por regla de negocio.
- Actualizar mensajes Swagger/documentacion que hoy hablan de "subcampañas activas".
- No agregar `POST /api/campanias/:id/desactivar` para MVP salvo que sea un alias trivial. Si se agrega, debe ser inactivacion logica equivalente a la eliminacion existente, sin cascada a subcampañas.

## Referencias actuales de backend

- `src/campanias/api/campanias.controller.ts`
- `src/campanias/application/campanias.service.ts`
- `src/campanias/application/campanias-consultas.service.ts`
- `src/campanias/application/campanias-edicion.service.ts`
- `src/campanias/application/campanias-organizaciones.service.ts`
- `src/subcampanias/application/subcampanias-consultas.service.ts`
- `migrations/029_m3_subcampania.sql`
- `migrations/030_m3_registro_plantacion.sql`
- `migrations/031_m3_evento_plantacion.sql`
- `migrations/047_m3_cancelacion_subcampania_y_plan.sql`

## Observaciones criticas

- La implementacion actual debe revisarse contra `RN-PLA-38` vigente: los cambios de `nombre`, `descripcion`, fechas y organizaciones deben quedar permitidos; el bloqueo importante es `tipo` con cualquier subcampaña asociada.
- La desactivacion de campaña no debe revisar solo subcampañas con `deleted_at IS NULL` si el objetivo es decidir `DELETE` fisico. Para soft-delete basta validar que no existan subcampañas no canceladas.
- `co2_proyectado_ton` queda como placeholder `0` si no hay formula cerrada. Formula final queda post-MVP.
- `activity` debe ser suficiente para demostrar actividad reciente; timeline canonico completo queda post-MVP.
- Enriquecer subcampañas puede generar consultas N+1 si se implementa item por item. Usar consultas agregadas por IDs o vistas/RPC.
- Para equipo/coordinador, usar el modelo existente `subcampania_equipo`: exactamente un `COORDINADOR` por subcampaña y N `OPERARIO`. No introducir `coordinador_id` ni flujo nuevo en esta tarea.

## Pruebas esperadas

- Unit tests para calculo de metricas con denominadores 0, campos null y actividad vacia.
- Unit/integration tests basicos para `activity` con orden y limit usando las fuentes disponibles.
- Tests para payload enriquecido de subcampañas, incluyendo `equipo: []`.
- Tests de `RN-PLA-38`:
  - `PATCH /campanias/:id` permite `nombre`, `descripcion` y fechas aunque existan subcampañas.
  - `PATCH /campanias/:id` permite asociar/desasociar organizaciones aunque existan subcampañas.
  - `PATCH /campanias/:id` bloquea cambio de `tipo` si existe cualquier subcampaña, incluso soft-deleted.
  - `DELETE /campanias/:id` como soft-delete permite desactivar si no hay subcampañas.
  - `DELETE /campanias/:id` como soft-delete permite desactivar si todas las subcampañas estan `CANCELADA`.
  - `DELETE /campanias/:id` como soft-delete bloquea si existe alguna subcampaña no cancelada.
  - `DELETE` fisico, si existe, falla si existe cualquier subcampaña.
