# Conciliación histórica del remanente de Vivero

El postflight aportado el 10 de noviembre coincide con la versión actual de
097 en PostgreSQL 17.6. Los 13 cuerpos de función y sus grants/configuraciones
cotejados coinciden con el ensayo local. El informe registra cero eventos y
cero orígenes en el padrón. [Evidencia y límites del cotejo](evidencia/vivero-conciliacion-postflight-aportado-2026-11-10.json).
El 10 de noviembre se aplicó 098 en `vyrjlehkhabydkhjxagx` mediante Supabase
Studio y se creó por API el bucket privado `r3foresta-conciliacion`. El postflight
de solo lectura confirmó sus seis controles en PostgreSQL 17.6, con límite de
15 MiB e imágenes JPEG, PNG, WebP, HEIC y HEIF. Desde la PWA local se verificaron
Material con M2 en VIV-001 y VIV-002 y la ficha fuera del padrón con ADMIN en
VIV-003. El piloto físico, la carga real y el despliegue quedan pendientes.
[Evidencia de aplicación, entorno y límites](evidencia/vivero-conciliacion-storage-aplicado-2026-11-10.json).

La migración 097 añade un padrón revisable para recolecciones históricas
`VALIDADO`, `ABIERTO`, con saldo positivo y sin recepción T4 conforme de la
custodia. Solo ADMIN admite o retira un origen individual, con motivo y revisión.
Un actor M2 vigente de la custodia, distinto del recolector, coteja y registra
el remanente físico. ADMIN conserva su alcance M2 derivado y la misma prohibición
de autoconciliación.

La ficha confronta cantidad inicial canónica + suma de deltas con el saldo
materializado. Conserva referencias a movimientos, lotes, eventos INICIO y
asignaciones M3. Cantidades y revisiones de conciliación viajan como texto
decimal. La marca de trazabilidad identifica la versión consultada y complementa
las revisiones de captura y padrón. SQL revalida todo bajo lock antes de confirmar.

Una comprobación conforme habilita el remanente existente en su custodia.
La conciliación conserva la fecha, autor, validación, cantidad inicial, snapshots,
saldo e historial de M1. El evento histórico registra quién comprobó, cuándo,
cuánto encontró y qué evidencia aportó. Una diferencia física, de unidad o de
trazabilidad registra `INCIDENCIA` y mantiene el bloqueo. Una nueva comprobación
con evidencia nueva conserva la incidencia previa en el historial. El retiro
del padrón bloquea el consumo de nuevo y conserva cada hecho anterior.

La recepción total T4 mantiene su propia evidencia y criterios. Un origen
con T4 conforme sigue siendo utilizable cuando su fecha de captura envejece.
INICIO crea un único débito y conserva sus requisitos operativos de ubicación,
unidad, saldo y evidencia. M3 continúa consumiendo el stock ya asignado en sus
propias transacciones. El guard de ledger aplica la habilitación también a
DESECHO autorizado.

El catálogo aportado el 9 de noviembre motivó dos ajustes en 097 antes de su
aplicación. La instalación retira los permisos de escritura y mantenimiento de
clientes sobre `recoleccion` y `recoleccion_movimiento`, incluidos los permisos
por columna. Comprueba la conservación de permisos efectivos del servicio y
aborta la transacción si persisten permisos heredados de escritura.

`CORRECCION` y `AJUSTE_MIGRACION` forman parte del enum legado del destino.
La ficha incluye sus deltas en la ecuación y en la marca de movimientos. Esos
tipos quedan sujetos a un procedimiento específico y producen incidencia en
este cotejo. Si aparecen después de una comprobación conforme, el origen vuelve
a pendiente y conserva el hecho anterior en su historial.

El cierre de 097 abarca la escritura en esas dos tablas. El catálogo aportado
también reporta lectura directa de clientes y RLS desactivado. El cierre general
de esa superficie legada conserva su revisión separada.
[Cotejo y hallazgos](evidencia/vivero-conciliacion-preflight-aportado-2026-11-09.json).

## API privada y PWA

Las rutas requieren Bearer verificado, cuenta activa y control de objeto.
Los IDs de origen, custodia, evidencia, eventos y asignaciones son cadenas
decimales. Los IDs de la respuesta legada de alta se conservan como números
hasta el entero seguro y como cadenas a partir de ese límite.
[OpenAPI reproducible](vivero-acceso-openapi.json).

| Ruta bajo `/api/v1/vivero` | Uso |
|---|---|
| `GET /origenes?vivero_id=…` | Lista de material habilitado. `incluir_pendientes=true` amplía la misma paginación con los pendientes y expone `estado_habilitacion` y `puede_consultar_conciliacion`. |
| `GET /origenes?vivero_id=…&incluir_pendientes=true&incluir_requisitos_inicio=true` | INICIO consulta `saldo_actual_exacto` como texto decimal y `motivo_no_inicio`, nulo si el origen cumple los requisitos previos. Requiere 099. |
| `GET /conciliaciones?vivero_id=…&antes_de_id=…&limite=20` | Padrón y candidatos históricos, solo ADMIN. El filtro de vivero es opcional. Seguir `siguiente_antes_de_id` hasta que sea nulo. |
| `GET /conciliaciones/:id` | Ficha y referencias por origen. ADMIN o M2 de la custodia para un origen con historial de padrón. |
| `POST /conciliaciones/:id/padron` | Solo ADMIN. `comando_id` UUID v4, `accion` `INCLUIR` o `RETIRAR`, `revision_esperada` de padrón y `motivo` de 10 a 500 caracteres. |
| `POST /conciliaciones/:id/evidencias` | Multipart `fotos` de la comprobación, 1 a 5 archivos, hasta 15 MB por archivo. Devuelve `evidencia_ids`. |
| `POST /conciliaciones/:id/confirmaciones` | Registra la comprobación física con la ficha y evidencias de la misma custodia. |
| `GET /conciliaciones/comandos/:comando_id` | Recupera el recibo propio mientras la cuenta siga activa, incluso si perdió el acceso al vivero. |

Para confirmar se envía la revisión de padrón en `revision_esperada`, la revisión
de captura en `revision_captura_esperada`, la `marca_movimientos` de la ficha y su
`saldo_actual` como `saldo_esperado`. Se añade la observación real como
`cantidad_observada` (cadena decimal, admite cero), `unidad_observada` (`G` o
`UNIDAD`), `fecha_comprobacion` (día real YYYY-MM-DD en America/La_Paz),
`evidencia_ids` y un `comando_id` UUID v4. `UNIDAD` requiere cantidad entera.
Si el inventario se pesa en kg, convertir con precisión decimal a gramos antes de
declarar `G`. El servidor coteja la unidad declarada con la del origen.

HTTP 200 con `CONFIRMADO` o `INCIDENCIA` conserva el evento y el recibo atómicamente.
`REVISION_OBSOLETA` o `RECUENTO_OBSOLETO` requieren volver a consultar y comprobar
el remanente antes de registrar otra intención. Ante respuesta perdida o 503,
recuperar el mismo UUID. HTTP 202 `SIN_RESULTADO` deja el resultado incierto.
Si se reenvía una intención, debe ser la misma carga con el mismo UUID.
`CONFLICTO_CLAVE` significa que ya existe otro contenido para esa clave.
La carga de Storage ocurre antes del comando. Una interrupción puede dejar una
carga pendiente sin vínculo.

La PWA distingue orígenes habilitados, pendientes, incidencia, saldo inexistente
y error de consulta. Los enlaces abren la ficha mínima M2 de T4 o de conciliación
según motivo y capacidad. El padrón y los comandos del piloto se operan por API.
La ficha muestra referencias de evidencias privadas, sin URLs de Storage.

La proyección de INICIO conserva los saldos con bloqueo documental en la lista
y muestra el motivo antes de pedir fotos. El alta vuelve a verificar el origen
bajo lock. La cantidad de INICIO viaja como texto decimal exacto, hasta seis
decimales para `G` y entera para `UNIDAD`. Recolección muestra por separado
`recepcion_conforme` de T4 y `m2_estado_habilitacion`. DESECHO conserva su
control de acceso por custodia y admite la habilitación por ambas vías.

Las pantallas legadas de detalle y eventos del lote en la PWA admiten IDs hasta
`MAX_SAFE_INTEGER` y rechazan los mayores para impedir alias. La consulta de
orígenes, la ficha de conciliación y el recibo del alta conservan BIGINT exactos.

## Procedimiento del piloto

1. Identificar la versión de API/PWA y la base de destino. Antes de aplicar 097
   en un entorno autorizado, ejecutar la [consulta de catálogo de solo lectura](../scripts/qa/vivero-conciliacion-preflight.sql)
   y conservar su JSON junto con el proyecto y entorno confirmados. Cotejar las
   funciones de 090/093/095/096, los triggers efectivos del ledger, fecha y
   autorización, y las diferencias de cuerpos o tipos que muestre el informe.
   La migración deja el padrón vacío. El corte requiere el Backend compatible con 097 y que
   PostgREST reconozca las funciones nuevas.
   Tras `Success`, ejecutar la [consulta posterior de solo lectura](../scripts/qa/vivero-conciliacion-postflight.sql)
   y cotejar sus controles y huellas con el archivo aplicado. Un error de la
   migración requiere revisar el mensaje y su transacción antes de continuar.
   Instalar después [098](../migrations/098_vivero_conciliacion_storage_privado.sql),
   que comprueba los antecedentes y añade políticas restrictivas dedicadas.
   Crear `r3foresta-conciliacion` por la API oficial de Storage como bucket
   privado, con límite de 15728640 bytes y los cinco MIME indicados arriba.
   Comprobar su presencia y todos los controles con la
   [consulta de estado de Storage](../scripts/qa/vivero-conciliacion-storage-estado.sql).
   Los metadatos se administran mediante la API, conforme a la
   [guía oficial de Supabase](https://supabase.com/docs/guides/storage/schema/design).
   En el proyecto identificado arriba, 098 y este aprovisionamiento ya están
   aplicados; conservar los SQL aplicados sin reescritura.
2. Con ADMIN, paginar el padrón por custodia y cruzar los candidatos con el
   diagnóstico de T4. El 6 de noviembre se observaron 29 orígenes con saldo y sin
   recepción en la base usada por la PWA local. De ellos, 27 se clasificaron como
   históricos en ese corte (VIV-001 16, VIV-002 1, VIV-003 1, VIV-004 9) y dos como
   candidatos a T4. Recontar antes de elegir un caso del piloto. Los candidatos
   ordinarios siguen la vía de recepción total si cumplen sus requisitos.
3. Seleccionar un origen y revisar su ficha con el vivero. Verificar ubicación,
   unidad, saldo esperado y referencias de cada movimiento, lote y asignación.
   Registrar por API la decisión individual de inclusión, con su motivo.
4. La persona M2 autorizada, distinta del recolector, consulta la ficha vigente
   y cuenta o pesa el remanente en la custodia real. Documenta la fecha efectiva,
   carga las fotos de esa comprobación y confirma con el saldo, marca y revisiones
   que cotejó. No usar fechas inferidas ni fotos de la captura original como
   prueba del remanente. Conservar UUID, recibo e IDs de las evidencias en el
   registro restringido del piloto. La revisión de los archivos corresponde al
   personal autorizado para el bucket privado.
5. Si hay diferencia, verificar la incidencia y que el origen permanezca
   pendiente en la PWA. Escalar al responsable de inventario para un nuevo cotejo.
   El procedimiento no compensa faltantes mediante DESECHO.
6. Si es conforme, verificar que el saldo y la fecha original sigan iguales y
   que el origen aparezca habilitado para su custodia. Cotejar el primer INICIO
   **operativo autorizado** con su único débito y sus vínculos. Si la evidencia
   se invalida o cambia la custodia física, ADMIN puede retirar el origen por
   API con motivo y revisión. El retiro afecta nuevas operaciones de M2 sobre
   ese remanente. Las asignaciones existentes continúan su ciclo en M3.
7. Registrar alcance, versión, recibos, incidencias y decisión de continuación
   del piloto. El inventario físico, la aplicación SQL, el corte y el despliegue
   se acreditan por separado.

[Verificación local y ejecución aislada](../test/README.md).

## Verificación local del 9 de noviembre

Backend `2174934` y PWA `8b9dae1` más los cambios locales de esta entrega.
Node 24.19.0 y npm 12.0.2. Build Backend aprobado con 89 suites y 1.271 pruebas.
Build y lint PWA aprobados con 93 archivos y 1.280 pruebas, 49 de Vivero.
El build conserva la advertencia de tamaño del chunk MapLibre. Los dos archivos
de Recolección modificados previamente se conservaron.

PostgreSQL 14.24 con PostGIS 3.2.10 aprobó 134 grupos SQL, 14 carreras observadas,
3 pruebas HTTP de conciliación y 7 de T4. Se verificaron autorización, remanente
con movimientos, diferencias, inconsistencias, retiro, replay, respuesta perdida,
marca obsoleta con saldo constante, envejecimiento de T4, un solo débito al crear
el lote y continuidad de M3. El clúster se detuvo y eliminó.
Los checks OpenAPI de M2 (42 rutas), T4 (6) y participación (41/86 schemas)
coinciden con los artefactos generados.

[Evidencia SQL/HTTP y huellas](evidencia/vivero-conciliacion-local-2026-11-09.json)
y [versiones, comprobaciones y límites](evidencia/vivero-conciliacion-validacion-2026-11-09.json).
Storage y PostgREST se simularon. La PWA se verificó en una copia aislada con
fuentes idénticas al árbol de trabajo, sin entorno privado. El recorrido con
navegador y Backend real conserva su verificación en el piloto.

## Ajuste verificado del 10 de noviembre

El [catálogo aportado](evidencia/vivero-conciliacion-preflight-aportado-2026-11-09.json)
confirmó los antecedentes y motivó el cierre acotado de escritura y la
invalidación ante movimientos de corrección. La versión actual de 097 tiene
SHA-256 `21eb5f5a52ed04e124891e764548e761483742545e2c1da83f074a0b90ea14c2`.

PostgreSQL 14.17 aislado aprobó 184 comprobaciones SQL, 14 carreras y las 10
pruebas HTTP. Se probó el enum ampliado, la incidencia por ambos signos de
`CORRECCION` y `AJUSTE_MIGRACION`, su aparición posterior a una conformidad,
el cierre de privilegios por tabla/columna y tres rollback ante herencia de
escritura o dependencia de PUBLIC del servicio. Preflight y postflight se
ejecutaron en solo lectura, incluyendo el padrón vacío tras instalar y los
conteos posteriores a las operaciones sintéticas. El clúster se eliminó.

[Regresión ampliada y huellas](evidencia/vivero-conciliacion-cotejo-local-2026-11-10.json)
y [resumen del ajuste y límites](evidencia/vivero-conciliacion-cotejo-validacion-2026-11-10.json).
La ampliación se ejecutó sin PostGIS. El ensayo del 9 conserva la prueba M3 con
PostGIS real sobre la versión anterior. Los archivos Backend/PWA de aplicación
coinciden con las huellas del build y las suites previas.

## Storage y aplicaciones locales del 10 de noviembre

La versión aplicada de 098 tiene SHA-256
`f2ef1e20451598b8c3b7aaea14d80ebbe123682be87ffd585067bec43a8f1eac`.
Sus 39 grupos SQL/RLS aprobaron en PostgreSQL 14.17 aislado, incluyendo
políticas permisivas previas, denegaciones de cliente, acceso del servicio,
conservación de otros buckets, repetición y abortos ante drift.
[Ensayo final y huellas](evidencia/vivero-conciliacion-storage-final-local-2026-11-10.json).
El ensayo anterior al ajuste de RLS de la tabla temporal conserva su informe
histórico por separado.

En el proyecto real, la consulta posterior confirma las dos políticas exactas,
RLS activo, roles cliente sin bypass, acceso del servicio, tres cuerpos críticos
de 097 y metadatos del bucket creado. No se cargaron archivos ni se escribieron
datos de conciliación o stock. El cierre cubre el bucket dedicado y conserva
fuera de su alcance SQL privilegiado, TRUNCATE y RPC ajenas que eviten RLS.

El Backend local respondió a health, contrato OpenAPI, rechazo privado sin
sesión y CORS de la PWA. Con M2, Chrome mostró 16 orígenes históricos pendientes
en VIV-001 y uno en VIV-002. VIV-002 también mostró un origen pendiente de
recepción física. Los 17 históricos solicitan revisión de Administración.
La consulta funcionó tras reiniciar los servidores locales y recargar Chrome.
En VIV-003, ADMIN abrió desde Material una ficha con saldo remanente y consumo
vinculado a un lote y a su evento INICIO. El cotejo de saldo fue consistente.
La ficha mostró `FUERA_PADRON`, revisión de conciliación `0`, historial y
evidencias vacíos.
Quedan pendientes la ficha M2 con historial de padrón, la carga real y el
piloto físico. El despliegue de aplicaciones conserva su propio corte.
[Evidencia del proyecto y comprobaciones HTTP](evidencia/vivero-conciliacion-storage-aplicado-2026-11-10.json).

La revisión posterior corrigió el selector de INICIO, el ingreso decimal y la
presentación de la ficha de Recolección. 099 añade la consulta optativa de
requisitos sin cambiar las dos firmas anteriores. La prueba local incluye un
origen con T4 conforme y código vacío, un débito exacto de 0,000001 G y la
separación de INICIO y DESECHO. El 10 de noviembre se cotejó 099 ya aplicada
en `vyrjlehkhabydkhjxagx`: cuerpos, firmas, configuración y permisos efectivos
coinciden; PostgREST reconoce la firma nueva. [Cotejo de destino y límites](evidencia/vivero-conciliacion-099-destino-2026-11-10.json).
El corte/despliegue de Backend/PWA queda pendiente. [Pruebas SQL y HTTP aisladas](evidencia/vivero-conciliacion-revision-099-local-2026-11-10.json).

El cierre local aprobó build y 1.281 unitarios del Backend. La PWA aprobó build,
lint y 1.289 pruebas en una copia con el código destinado al commit. Los dos
cambios previos de captura de Recolección se excluyen de esta entrega.
[Hallazgos corregidos, versiones y huellas](evidencia/vivero-conciliacion-revision-cierre-2026-11-10.json).
