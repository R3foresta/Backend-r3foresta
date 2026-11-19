# Reporte administrativo de plantaciones

La migración [114](../../../migrations/114_reportes_plantaciones.sql) incorpora la lectura para el tablero de plantaciones. Requiere los helpers privados de identidad de participación y el esquema de registros efectivos. La API exige Bearer JWT de una cuenta ADMIN activa y la RPC comprueba la misma identidad y rol en la base de datos. El servicio usa las credenciales privadas y las respuestas HTTP son de caché privada con `no-store`.

## Consulta

`GET /api/v1/reportes/plantaciones?desde=2026-01-01&hasta=2026-11-18`

| Parámetro | Formato |
| --- | --- |
| `desde`, `hasta` | Obligatorios. Fechas de plantación en formato `YYYY-MM-DD` con ambos extremos incluidos. |
| `organizacion_id` | Opcional. ID de la organización según el vínculo vigente con la campaña. |
| `campania_id` | Opcional. ID de la campaña. |
| `planta_id` | Opcional. ID de especie. |

Los IDs se transmiten como cadenas decimales positivas exactas. Los filtros se pueden combinar.

La respuesta es `{ success: true, data }`. `data.observado_en` identifica la consulta y `data.filtros` devuelve los filtros aplicados, con valor `null` para cada ID omitido. `data.totales` incluye `registros`, `iniciales`, `reposiciones` y `total`. `data.meses` agrupa iniciales y reposiciones por `mes` en formato `YYYY-MM`. Solo devuelve meses con actividad filtrada. `data.especies` entrega los mismos tipos de cantidades y total por `planta_id`, `nombre_comun` y `nombre_cientifico`. `data.opciones` ofrece catálogos `organizaciones`, `campanias` y `especies`, con `id` y `nombre` en cada elemento, independientes de los filtros de la consulta.

El consolidado cuenta cada registro vigente una vez. La consulta de una organización considera las campañas vinculadas a ella al consultar. Varias organizaciones pueden compartir una campaña. Para un filtro por especie, el total usa las cantidades de esa especie según el detalle verificable. Si el detalle suma menos que la cantidad registrada, la diferencia aparece en **Sin desglose de especie**. Si el detalle supera la cantidad registrada, toda la cantidad de ese registro aparece en esa fila. Su `planta_id` es `null`. Un período sin registros devuelve ceros confirmados y arrays de meses y especies vacíos.

## Exportación

`GET /api/v1/reportes/plantaciones/permiso-exportacion` confirma la sesión activa y el rol ADMIN antes de generar un PDF en la PWA. Devuelve `204` cuando se autoriza. El documento toma el resultado ya consultado para conservar las mismas cifras, filtros y fecha de corte.

Los estados HTTP de error incluyen `401` para sesión inválida, `403` para acceso insuficiente o cuenta inactiva, `422` para filtros inválidos y `503` cuando falla la lectura del reporte.

## Inventario y mermas de Vivero

La migración [115](../../../migrations/115_reportes_vivero_mermas.sql) añade dos consultas de solo lectura con la misma autorización ADMIN, verificación en PostgreSQL y caché privada de Plantaciones. Ambas aceptan `planta_id` y `vivero_id` opcionales y devuelven `{ success: true, data }`. Cada respuesta indica su corte en `observado_en` y devuelve los filtros aplicados en `filtros`. Los catálogos `opciones.viveros` y `opciones.especies` contienen pares `{ id, nombre }` de viveros y especies con lotes registrados, independientemente del filtro y del saldo actual. Los IDs de filtros, catálogos, lotes y eventos son cadenas decimales exactas.

### Inventario actual

`GET /api/v1/reportes/vivero?planta_id=42&vivero_id=2`

| Campo de `data` | Contenido |
| --- | --- |
| `filtros` | `planta_id` y `vivero_id`, con `null` cuando se omiten. |
| `totales` | `plantas`, `especies` y `viveros` con saldo elegible. |
| `filas` | `planta_id`, `especie`, `vivero_id`, `vivero` y `plantas` por combinación de especie y vivero. |
| `por_vivero` | `vivero_id`, `vivero` y `plantas`. |

El inventario se calcula con `saldo_vivo_actual` positivo en lotes activos con base viva registrada por `EMBOLSADO` o `INCORPORACION`. Una entrega ya descuenta el saldo físico del lote. Todos los saldos del ámbito se agregan dentro de la misma lectura SQL. El período del tablero se usa para los hechos históricos. Para inventario siempre se consulta el saldo actual, con su propio corte. El ámbito sin saldo devuelve totales en cero y desgloses vacíos.

### Mermas registradas

`GET /api/v1/reportes/mermas?desde=2026-01-01&hasta=2026-11-18&vivero_id=2&pagina=1`

`desde` y `hasta` son fechas operativas obligatorias `YYYY-MM-DD`, con extremos incluidos. `pagina` admite enteros de 1 a 1.000.000 y su valor por defecto es 1.

| Campo de `data` | Contenido |
| --- | --- |
| `filtros` | `desde`, `hasta`, `planta_id`, `vivero_id` y `pagina` aplicados. |
| `totales` | `plantas` acreditadas, `eventos` de merma registrados y `eventos_sin_cantidad` válida. |
| `por_causa` | `causa`, `plantas` y `eventos`. `causa` es `null` cuando falta en el registro. |
| `meses` | `mes` en formato `YYYY-MM` y `plantas` para los meses con eventos. |
| `detalle` | `id`, `fecha`, `lote_id`, `codigo_lote`, `planta_id`, `especie`, `vivero_id`, `vivero`, `causa` y `cantidad` por evento. La etiqueta de especie conserva el nombre comercial registrado en el lote cuando está disponible. |
| `tamano_pagina` | 25 eventos. Solo `detalle` se pagina, por fecha e ID descendentes. |

Los agregados abarcan todo el conjunto filtrado, incluidos los eventos repetidos en un mismo lote y los de lotes hoy finalizados. Cada línea corresponde al evento `MERMA` en `fecha_evento`. La cantidad suma solo con `UNIDAD` entera positiva en rango de saldo `INTEGER`. Los eventos incompletos permanecen visibles con `cantidad: null` y se cuentan en `eventos_sin_cantidad`. El descarte previo al embolsado y la mortandad en campo pertenecen a sus registros operativos.

Una página posterior a la última devuelve detalle vacío con agregados del período. Cada solicitud se calcula en su propio corte. El listado y los totales de esa respuesta comparten el mismo corte.

### Detalle completo para el PDF de mermas

La migración [116](../../../migrations/116_reportes_mermas_exportacion.sql) mantiene la lectura paginada y agrega `GET /api/v1/reportes/mermas?desde=2026-01-01&hasta=2026-11-18&exportar=1`. Acepta los mismos filtros de especie y vivero. Se puede omitir `pagina` o enviar `1`. La respuesta conserva `filtros.pagina` en `1` y `tamano_pagina` en `25` como metadato del contrato de consulta. En esta modalidad, `detalle` contiene todos los eventos del alcance con los mismos totales y `observado_en` de la respuesta. La PWA usa ese corte para la vista previa y pone las cantidades de merma no acreditadas como dato faltante.

La exportación requiere ADMIN activo y conserva `Cache-Control: private, no-store`. La PWA vuelve a confirmar el permiso antes de descargar mediante la ruta de autorización existente. El PDF de inventario usa el resultado completo que el tablero ya tiene al corte, con esa misma comprobación de permiso.

## Semillas

La migración [117](../../../migrations/117_reportes_semillas.sql) incorpora dos consultas de solo lectura para ADMIN. Ambas aceptan `planta_id` y `vivero_id` opcionales y devuelven `{ success: true, data }`. El servidor devuelve la hora del corte ISO en `observado_en`, los filtros aplicados en `filtros` y los catálogos completos en `opciones.viveros` y `opciones.especies` como pares `{ id, nombre }`. Los IDs son cadenas decimales exactas. Ambas lecturas excluyen esquejes y fichas eliminadas.

| GET bajo `/api/v1/reportes` | Respuesta |
| --- | --- |
| `/semillas` | `totales: { G, UNIDAD }` y `filas[]` con `planta_id`, `especie`, `vivero_id`, `vivero`, `unidad`, `saldo`. |
| `/semillas/movimientos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&pagina=1` | `totales` contiene `G` y `UNIDAD` con `recibido`, `consumido`, `descartado`, además de `eventos` y `eventos_sin_cantidad` del período completo. `detalle` se pagina en grupos de 25. El intervalo es inclusivo y `pagina` es opcional, con valor inicial 1. |

El **saldo actual** suma `recoleccion.saldo_actual` de semillas abiertas y validadas con recepción conforme en su vivero de custodia. Ante un saldo inválido dentro del ámbito consultado, la lectura devuelve 503. Una consulta completa sin saldo devuelve `"0"` en cada unidad. Los totales y el detalle de saldo corresponden a toda la consulta, sin paginación.

El **histórico** registra la entrada con `recoleccion_recepcion.fecha_recepcion` y `cantidad_recibida`. El consumo hacia vivero y el descarte usan el día de asiento persistido `recoleccion_movimiento.created_at` y el valor positivo del débito. Las capturas de recolección no se vuelven a contar como entradas. Las fichas cerradas y los débitos legados persistidos con especie identificada conservan su historial. El filtro de vivero corresponde a recepción o custodia del origen. Cuando el consumo está vinculado a un lote, `vivero_destino` muestra el nombre del vivero que recibe ese consumo.

Cada fila de `detalle` contiene `id`, `tipo` (`RECEPCION_CONFORME`, `CONSUMO_A_VIVERO` o `DESECHO`), `fecha`, `recoleccion_id`, `codigo_recoleccion` (nullable), `planta_id`, `especie`, `vivero_id`, `vivero` y `vivero_destino` (estos últimos tres pueden ser nulos), `unidad` y `cantidad`. Usar `tipo + id` como clave, pues recepción y movimientos tienen secuencias independientes. Las cantidades se devuelven en cadenas decimales no negativas con hasta seis decimales para `G` y enteros para `UNIDAD`. Los eventos históricos de cantidad inválida conservan `cantidad: null` (la unidad también puede ser nula) y se contabilizan en `eventos_sin_cantidad`. Los totales de montos suman únicamente valores verificables.

### Detalle completo para el PDF de movimientos de semillas

La migración [118](../../../migrations/118_reportes_semillas_movimientos_exportacion.sql) agrega `GET /api/v1/reportes/semillas/movimientos?desde=2026-01-01&hasta=2026-11-19&exportar=1`. Aplica el mismo período y los mismos filtros opcionales de especie y vivero. Se puede omitir `pagina` o enviar `1`. El contrato conserva `filtros.pagina = 1` y `tamano_pagina = 25`. Con `exportar=1`, `detalle` trae todos los movimientos del período en el mismo corte que los totales y `observado_en`, incluso los eventos sin cantidad verificable. La lectura sin `exportar` sigue paginada.

El histórico completo exige ADMIN activo y se sirve con `Cache-Control: private, no-store`. Antes de descargar, la PWA vuelve a comprobar el acceso en `/api/v1/reportes/plantaciones/permiso-exportacion`. El saldo de semillas sigue disponible en su consulta de saldo actual, con su propio corte.
