# Asignaciones de especies fuera del plan — diagnóstico y corrección

Consulta de solo lectura en Supabase el 2026-10-08. Subcampaña
`SUB-005-CMP-2026-020` (id 54), «Calle 32 - Arborización», estado ACTIVA.

## Qué ocurrió

| Lote | Especie del catálogo | Asignación | Cantidad | Consumida |
| --- | --- | --- | --- | --- |
| VIV-000030-REC-2026-058 | Tajibo, planta_id 13 | 47 | 50 | 0 |
| VIV-000115-REC-2026-110 | Arbusto de la mermelada, planta_id 54 | 46 | 10 | 0 |

Ambas asignaciones existen, están ACTIVA y tienen propósito
PLANTACION_INICIAL. Los despachos M2 315 y 311 descontaron todo el saldo
de sus respectivos lotes. Por eso los lotes están FINALIZADO, con motivo
DESPACHO_TOTAL: el saldo físico en vivero llegó a cero al asignar.

El plan de la subcampaña tiene exclusivamente:

| Especie | planta_id | Objetivo | Plantado inicial | Pendiente |
| --- | --- | --- | --- | --- |
| Kiswara | 42 | 160 | 160 | 0 |
| Tilo | 39 | 40 | 0 | 40 |

La pantalla de registro de plantación construye sus opciones a partir del
plan y cruza el stock por `planta_id`. Tajibo y Arbusto de la mermelada no
aparecen entre esas opciones. El stock asignado está registrado, pero no es
utilizable para la plantación inicial de esta subcampaña.

## Causa y cambio

La API y la RPC de asignación validaban lote, saldo físico, estado,
propósito, permisos y evidencias. La pertenencia de la especie al plan se
comprobaba recién en `fn_m3_registrar_plantacion`, después de entregar las
plantas y descontar el vivero.

`ViveroAsignacionesService.crearAsignacion` ahora consulta el plan con el
`planta_id` del lote para PLANTACION_INICIAL y responde 422 si no pertenece.
La migración `060_vivero_asignacion_validar_plan_especie.sql` repite la
validación dentro de la RPC, después de los bloqueos y antes de cualquier
escritura. Conserva firma y permisos de la función existente.

REPOSICION conserva su política vigente: puede usar cualquier especie
(RN-VIV-60). Después del diagnóstico, el usuario aclaró que se permiten
cantidades adicionales de las especies del plan y que el cierre debe ser
manual. La migración 061 elimina el tope de cantidades al plantar y
conserva el stock asignado como límite. En esta subcampaña existen además
260 Kiswaras asignadas disponibles (asignaciones 31 y 32), aunque su
objetivo ya está cumplido; pueden consumirse en nuevas plantaciones
iniciales mientras la subcampaña continúe ACTIVA.

## Recuperación de los registros existentes

Las asignaciones 46 y 47 no fueron modificadas por esta investigación.
Si las plantas se retornan al vivero, registrar la devolución física con
la fecha real y motivo ERROR_PLANIFICACION:

- `POST /lotes-vivero/115/asignaciones/46/devolucion`: cantidad_devuelta 10.
- `POST /lotes-vivero/30/asignaciones/47/devolucion`: cantidad_devuelta 50.

El flujo existente marca la asignación DEVUELTA, recupera saldo, reabre
el lote y conserva eventos M2/M3 de la devolución. Evitar borrar filas o
editar saldos manualmente: perdería la trazabilidad de las entregas.

Para completar la plantación inicial, la necesidad observada es de 40
Tilos (`planta_id` 39).

Una segunda consulta durante la investigación confirmó la nueva
asignación 48: 50 Tilos desde el lote 116, ACTIVA, PLANTACION_INICIAL,
con 0 consumidos y 50 disponibles. Esta especie sí corresponde al plan.
Con la política aclarada por el usuario y la migración 061, se pueden
plantar los 50 juntos o 40 y después 10. Al consultar la base, la cantidad
plantada total continuaba en 160; la investigación no la modificó.

## Aplicación y validación

Desplegar el backend y aplicar la migración 060 para proteger también
llamadas directas a la RPC. La investigación no desplegó cambios ni aplicó
migraciones en Supabase.

- 69 tests unitarios de asignaciones y Swagger aprobados; build aprobado.
- PostgreSQL local desechable: 052 reproduce la aceptación incorrecta;
  060 aplicada dos veces preserva identidad y permisos de la función.
- Especie fuera del plan y subcampaña sin plan: rechazo sin cambios en
  saldo, asignaciones, eventos ni evidencias.
- Especie válida: entrega parcial y total correctas, incluido cierre
  automático por DESPACHO_TOTAL. REPOSICION conserva su comportamiento.
- Se agregaron casos E2E para Supabase con 060 aplicada. No se ejecutaron
  contra la base compartida.
- El chequeo global de tipos conserva errores previos del repositorio:
  132 diagnósticos en HEAD frente a 130 con el cambio, sin diagnósticos
  nuevos. El lint de servicio y tests unitarios modificados pasa; el
  archivo E2E conserva problemas previos de tipos Supabase, sin agregar
  infracciones.
