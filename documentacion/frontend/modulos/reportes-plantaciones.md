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
