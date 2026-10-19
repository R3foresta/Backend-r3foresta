# PA-T-INT05 — Contrato de Impacto público y Mis registros

Contrato local del 17 de octubre de 2026, versión OpenAPI **1.3.0**. Base del corte original de pruebas: `10e5dc5`; la [entrega local](pa-int05-entrega-local.md) registra la consolidación posterior y enlaza las versiones de entrega. La implementación SQL corresponde a [081](../migrations/081_pa_int05_consulta.sql), después de 074–080. Este documento describe la proyección implementada; aplicación/cotejo remoto, push, despliegue y habilitación de piloto requieren evidencia separada.

Fuentes de producto: [PA-S02](../../r3foresta-docs/specs/plantacion/participacion-aliada/02-consulta-impacto-y-registros/spec.md), [D01/D08/CT06/CT11](../../r3foresta-docs/specs/plantacion/participacion-aliada/contrato-identidad-permisos-backend-propuesta.md), [RN-PLA-34](../../r3foresta-docs/03-plantacion-module/01_reglas_de_negocio_plantacion.md#rn-pla-34---transparencia-publica-sin-autenticacion) y [ADR-PLA-05](../../r3foresta-docs/decisiones/02_decisiones_plantacion.md#adr-pla-05--edicion-de-meta-y-especies-en-activa-solo-admin).

## Audiencias y compatibilidad

| Dato | Impacto público | Mis registros / detalle propio | Operación |
|---|---|---|---|
| Ámbito | Hijas `ACTIVA`, `COMPLETADA`, `FINALIZADA_PARCIAL`, sin borrados de campaña/subcampaña | Autor o participante histórico; no depende de permiso operativo vigente | Autoridad vigente por acción y objeto |
| Identidad requerida | Ninguna; visitante, VOLUNTARIO y sesión vencida ven la misma proyección | Bearer JWT válido y cuenta activa | Guard y política correspondiente |
| Hechos | GPS, fecha, referencia, cantidades grupales, especies y fotos elegibles | Lista deduplicada y enlace al detalle propio existente | Hechos existentes, sin copiar plantaciones |
| Personas | Nombre y afiliación históricos conservados; sin ID de cuenta, contactos o perfil | Relación `AUTOR`/`PARTICIPANTE`; detalle propio conserva su contrato CT06 | Selección/roster por capacidad vigente |
| Observaciones | Excluidas | Solo autor en `detalle-propio`; participante recibe `observaciones_autor: null` | Según operación autorizada |
| Stock, asignaciones, equipo | Excluidos | Autoría/participación no los concede | Lecturas privadas separadas |
| Plan técnico | Campos públicos de meta/avance por esta proyección | GET `/api/subcampanias/:id/plan` conserva JWT | Edición solo ADMIN global |

No hay estado «publicada» persistido de campaña. Una campaña se consulta públicamente a través de sus hijas elegibles; borradores, canceladas, `PAUSADA` y borrados no se revelan por mapas, listas ni agregados. Un ID público fuera de ese alcance produce el mismo 404 que uno inexistente. Los filtros no conceden permisos.

Se mantienen los aliases públicos `/api/v1/impact/organizations/*`; comparten la selección elegible corregida y las fotografías sanitizadas. Su DTO legado conserva IDs numéricos, mientras los contratos INT05 usan IDs decimales como cadenas. Los campos fotográficos legados `title` y `takenAt` permanecen `null`: no se transfieren texto libre ni metadatos de fotos. La atribución por asociación de campaña sigue siendo contextual, sin crédito exclusivo. Los enlaces nuevos no requieren organización como nivel inicial.

## Rutas y DTO

Todas las respuestas exitosas INT05 tienen solo el envelope `{ "data": ... }`; no incorporan `success` ni `observado_en`. El [OpenAPI generado](pa-int02c-openapi.json) define objetos estrictos con `additionalProperties: false`; el backend valida esa misma proyección antes de entregarla.

| GET | Schema del envelope | Query permitido |
|---|---|---|
| `/api/v1/impact/global` | `ImpactoConsultaRespuesta` | `campania_id`, `subcampania_id`, `organizacion_id`, `planta_id`, `desde`, `hasta`, `cursor`, `limite` |
| `/api/v1/impact/campanias/:id` | `ImpactoConsultaRespuesta` | `subcampania_id`, `organizacion_id`, `planta_id`, `desde`, `hasta`, `cursor`, `limite` |
| `/api/v1/impact/subcampanias/:id` | `ImpactoConsultaRespuesta` | `organizacion_id`, `planta_id`, `desde`, `hasta`, `cursor`, `limite` |
| `/api/v1/impact/registros/:id` | `ImpactoRegistroRespuesta` | Ninguno |
| `/api/v1/plantaciones/mis-registros` | `MisRegistrosRespuesta` | `cursor`, `limite` |

`id`, filtros de ID y `cursor`: decimal canónico positivo hasta `9223372036854775807`, representado como cadena; sin espacios, signo, cero inicial o notación exponencial. `limite` es un entero decimal 1–100 en query, por omisión 20. Campos desconocidos, parámetros repetidos/arrays o filtros de ámbito no permitidos en ese nivel se rechazan con 422; el ámbito del path no puede sustituirse por query. Una subcampaña incompatible con la campaña seleccionada da 404.

`desde` y `hasta` son días calendario válidos `YYYY-MM-DD`, inclusivos y con `desde <= hasta`. Filtran **fecha de plantación**, no fecha fotográfica. `organizacion_id` selecciona campañas asociadas a esa organización; no filtra afiliaciones personales ni acredita financiación. `planta_id` selecciona los registros que contienen esa especie y conserva su grupo completo: cantidades, participantes y otras especies no se recortan a la especie buscada. Filtro sin coincidencias devuelve 200 con listas vacías e indicadores 0; no equivale a fallo de lectura.

`ImpactoConsulta` contiene `indicadores`, `campanias`, `subcampanias`, `mapa`, `registros` y `siguiente_cursor`. El cursor exclusivo aplica `id < cursor`, con orden de registros por `id DESC`. Solo `registros` se pagina; indicadores, campañas, subcampañas y mapa describen **todo el alcance filtrado**, también al pedir páginas posteriores. `siguiente_cursor` es la última ID de la página si quedan hechos, o `null`. El cliente debe sustituir el mapa común y anexar únicamente páginas de registros; no sumar los indicadores de cada página.

`ImpactoRegistro` contiene referencia, ámbito, fecha, cantidad, tipo inicial/reposición, origen de reposición si corresponde, GPS, especies, personas históricas, fotos `{id,url}`, `seguimiento`, organizaciones de campaña y `url_publica`. Las URL del DTO son rutas de API estables; frontend las transforma en enlaces de navegación públicos que mantienen su destino. Cada punto del mapa representa un registro grupal, no una planta ni una fila por participante.

`MisRegistros` contiene `registros` y `siguiente_cursor`, con la misma paginación descendente. Incluye responsable **o** participante histórico, una sola fila por registro, con una o ambas relaciones identificables. Cada fila conserva fecha, cantidad, tipo, referencia, `url_detalle_propio` y `url_publica` nullable cuando el ámbito no es público. Retirar un permiso no borra autoría/participación ni permite nuevos registros. La cantidad sigue siendo grupal; no es crédito individual. Un ADMIN tampoco obtiene registros ajenos por su rol.

081 también redefine de forma aditiva el detalle propio de 075: si el responsable figura además como corresponsable, conserva `relaciones: ["AUTOR","PARTICIPANTE"]` y entrega una sola persona responsable. Su contrato de observaciones no cambia: disponibles solo para el autor.

## Fórmulas, snapshots y fotos

Los hechos se seleccionan una vez antes de incorporar personas/organizaciones; sus uniones no multiplican cantidades. El conjunto filtrado es común a agregados, mapa y registros. `plantacion_inicial` suma cantidades con `es_reposicion=false`; `reposiciones` suma cantidades con `es_reposicion=true`. `bajas_reportadas` refleja el acumulado reportado de grupos iniciales seleccionados. No se ofrece supervivencia comprobada ni composición viva por especie.

`seguimiento` del registro conserva contadores `bajas_reportadas` y `reposiciones_registradas`, con listas separadas: `bajas:[{evento_id,fecha,cantidad}]` usa la fecha UTC del evento `MORTANDAD_REPORTADA`; `reposiciones:[{registro_id,fecha,cantidad,url_publica}]` usa el día de cada reposición vinculada por origen. No publica observaciones ni causas libres. Si el legado conserva un acumulado pero carece de eventos históricos, la lista correspondiente queda vacía; el contador no se borra y no se inventan fechas.

En subcampaña, `meta_inicial` es la meta vigente completa, `faltantes=max(meta_inicial-plantacion_inicial,0)` y `avance_porcentaje=100*plantacion_inicial/meta_inicial` sin limitar a 100; sin meta positiva, el porcentaje es `null`. Fechas/especie filtran los hechos del numerador y mantienen la meta vigente del ámbito; frontend debe nombrar ese alcance filtrado y no presentarlo como avance de todos los hechos. Reposiciones y bajas no cambian faltantes ni avance inicial. No se agregan faltantes a campaña/global, y superar la meta no cierra ni habilita una subcampaña cerrada.

`personas[].afiliacion` conserva `{estado,tipo,nombre,organizacion_id}` del hecho. `NO_DECLARADA` declara ausencia; `HISTORICA_NO_DISPONIBLE` indica que la fuente histórica no existe. Nombres desconocidos permanecen `null`. No se consultan perfil actual, actividad/nombre vigente del catálogo ni organizaciones de campaña para reconstruir afiliación. La organización de procedencia es contexto histórico, no permiso. `organizaciones_campania` se muestra separada de esas afiliaciones.

Las fotos nuevas solo se enumeran si cumplen la elegibilidad de `pa_foto_publica` o `pa_d_foto_legada_publica`. Su URL `/api/v1/impact/imagenes/:id` entrega JPEG sanitizado; no entrega bucket, ruta de original, EXIF, archivos pendientes ni previews privados. El GPS público pertenece al registro y se mantiene separado de los metadatos excluidos del archivo. Se conserva el mecanismo de bytes de INT02-D y su `Cache-Control: no-store`.

## Errores, caché y SQL

JSON público exitoso: `Cache-Control: no-store`; no requiere Bearer ni consulta de capacidades y no personaliza por sesión. Los errores conservan el filtro común de participación: `Cache-Control: private, no-store` y `Vary: Authorization`, sin inspeccionar ni exigir JWT en la consulta pública. Mis registros/detalle propio usan también `private, no-store` y `Vary: Authorization`. El cliente no debe compartir ni conservar datos privados entre cuentas. Una sesión vencida en la lectura propia solicita autenticación; Impacto público permanece disponible.

Errores INT05 conservan `ErrorFueraDeRecibo`: `{error:{codigo,mensaje,campos,ambitos,reintento},comando_id:null,resultado_concluyente:false}`. 422 identifica entrada inválida/campo no permitido; 404 `RECURSO_NO_VISIBLE`; 503 `RESULTADO_NO_DETERMINADO` es fallo temporal de lectura, con `reintento: NO_APLICA`, sin reinterpretarlo como total cero o resultado de escritura. En privado, 401 `SESION_INVALIDA`/`IDENTIDAD_DISCORDANTE` y 403 `CUENTA_INACTIVA` requieren recuperar sesión. No se entregan errores SQL ni rutas de Storage.

Las funciones de 081 y sus helpers son `SECURITY INVOKER`, ejecutables solo por `service_role` tras revocar `PUBLIC`/`anon`/`authenticated`. La API usa `getAdminClient()` sin fallback público. Una llamada `STABLE` mantiene la misma instantánea SQL entre agregados, mapa y página; no introduce escrituras, tablas de plantaciones ni permisos nuevos. Esto no acredita grants/RLS/Storage del destino remoto.

Para reproducir el contrato sin servicios externos: `node scripts/qa/pa-int02c-openapi.cjs --check` y el unitario `src/participacion/tests/participacion-openapi.spec.ts`. La evidencia HTTP/SQL usa datos sintéticos aislados; sus versiones y límites se registran en la entrega INT05.

[Ejemplos runtime](pa-int05-ejemplos.json), capturados por HTTP con SQL081 real en PostgreSQL/PostGIS aislado el 17 de octubre: `global`, `campania` 800, `subcampania` 826, `registro` 826000 y `mis_registros` de la cuenta sintética 801. El dataset contiene 5 + 25 = 30 iniciales en campaña 800 y 20 en campaña 801: global 50, reposiciones 4 y bajas reportadas 11 por separado. Subcampaña 826 tiene meta 20 e inicial 25: 125%, faltantes 0. Conserva participantes mixtos, perfil cambiado tras el hecho, afiliación histórica no disponible, observaciones privadas excluidas y una foto pública elegible 900050. Las claves de ejemplo contienen únicamente el cuerpo de respuesta, listo para validación runtime contra los schemas `*Respuesta`; no incluyen tokens. Fechas, nombres e IDs pertenecen al fixture sintético y no acreditan datos de campo.
