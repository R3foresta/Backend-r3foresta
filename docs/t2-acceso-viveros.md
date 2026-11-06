# T2 · Acceso operativo por vivero

Implementación **local del 5 de noviembre de 2026**, revisada por el chat
coordinador. [Cierre de revisión y comprobación independiente](evidencia/t2-revision-coordinadora-2026-11-05.json).
Base `6f59263c349c664c15893528df1c129a7d25ef0d` más el árbol local de T1,
incluidas 092/093 y sus documentos; [huellas anteriores a T2](evidencia/t2-acceso-viveros-base-2026-11-05.json).
El agente no creó commit de entrega, ejecutó SQL remoto, hizo push ni desplegó.
El usuario confirmó Success hasta095 durante el cierre: [aplicación reportada y límites](evidencia/t2-migraciones-095-aplicacion-reportada-2026-11-05.json). 094/095 quedan congeladas; el cotejo del catálogo/cuerpos y el HTTP desplegado siguen separados.
[Encargo](../documentacion/tareas/t2-acceso-viveros.md),
[OpenAPI del controller real](vivero-acceso-openapi.json).
La primera revisión coordinadora pidió corregir el almacenamiento BIGINT de M1 y
la combinación de pendientes propios/locales. [Corrección y verificación posterior](evidencia/t2-correccion-validacion-2026-11-05.json), comprobada en el cierre coordinador sin hallazgos pendientes.
Las huellas del implementador conservan su corte anterior a este cierre documental.

## Modelo y contrato para T3

Se conserva un rol global por cuenta. `GENERAL` y `VALIDADOR` activos necesitan
vigencia explícita por pareja usuario–vivero. Todas las personas asignadas tienen
las mismas facultades M2 en cada establecimiento. `ADMIN` activo deriva alcance
global, sin necesitar vigencias; administra las asignaciones por API. `VOLUNTARIO`
y cuentas inactivas carecen de acceso operativo efectivo. Cambiar rol/baja no borra
vigencias ni cambia revisiones M1/M2. Restablecer un rol interno activo vuelve a
evaluar las vigencias conservadas; retirar un vivero es una operación explícita.
No existe operario mínimo, encargado ni receptor separado.

M1 y M2 son independientes: retirar A conserva B y M1; retirar M1 conserva los
viveros. Afiliación, organización, equipo y autoría no conceden M2. Plantar consume
asignaciones entregadas y conserva su autorización M3; no exige acceso al vivero
original ni vuelve a descontarlo.

Todas las rutas de gestión usan Bearer JWT verificado, cuenta activa y
`Cache-Control: private, no-store`. IDs/revisiones son cadenas decimales hasta
`9223372036854775807`. No enviar actor, rol ni actividad desde el cliente. La
revisión de asignaciones es **por usuario para el conjunto de viveros**, independiente
de `revision_autoridad` y de la revisión M1: dos cambios de viveros distintos pueden
entrar en conflicto y requieren releer antes de confirmar otra intención.

| Método y ruta | Audiencia |
|---|---|
| `GET /api/v1/me/acceso-viveros` | Cuenta activa propia, incluso VOLUNTARIO o sin M2 |
| `GET /api/v1/usuarios/:usuario_id/acceso-viveros` | Solo ADMIN, destino activo o inactivo |
| `POST /api/v1/usuarios/:usuario_id/acceso-viveros/otorgamientos` | ADMIN; destino activo GENERAL/VALIDADOR |
| `POST /api/v1/usuarios/:usuario_id/acceso-viveros/retiros` | ADMIN; cierra una vigencia incluso de destino inactivo/inelegible |
| `GET /api/v1/vivero/accesos/comandos/:comando_id` | Terminal exclusivamente del actor autenticado, aunque haya perdido ADMIN |
| `GET /api/v1/vivero/origenes?vivero_id=...` | ADMIN u operario efectivo del vivero indicado |

Las dos lecturas de acceso admiten `antes_de_id?` y `limite?` (1–50, omisión20).
Su `data` contiene `usuario_id`, `rol_global`, `activo`, `revision_acceso`,
`revision_autoridad`, `alcance_global`, `viveros`, `capacidades_globales`, `historial`
y `siguiente_antes_de_id`; `observado_en` acompaña a `data`.

Cada elemento de `viveros` es una vigencia abierta: `id`, `vivero_id`, `otorgado_en`,
`otorgado_por`, `acceso_efectivo` y `capacidades`. Estas últimas expresan ese mismo
vivero: `operar`, `consultar_material`, `desechar_semillas` y `revisar_documental`.
La última conserva ADMIN/VALIDADOR hasta T4; las demás son iguales para los
operarios GENERAL/VALIDADOR. Una vigencia conservada de cuenta inelegible muestra
capacidades falsas. ADMIN no necesita aparecer en la lista: usa `alcance_global`
y los campos explícitos `administrar`, `operar_cualquier_vivero`,
`desechar_semillas_cualquier_vivero`, `revisar_documental_cualquier_vivero` de
`capacidades_globales`. No convertir una facultad de A en un flag de operación
sobre B. El catálogo público `GET /api/viveros` permite seleccionar establecimientos;
no es un listado de permisos.

El historial se pagina por ID descendente e incluye `vivero_id`, vigencia, evento,
actor, motivo, revisiones y UUID del comando. Retirar conserva la fila y el pasado;
reotorgar crea otra. Los POST reciben exactamente:

```json
{
  "comando_id": "00000000-0000-4000-8000-000000000001",
  "vivero_id": "7",
  "revision_esperada": "0",
  "motivo": "Asignación al establecimiento"
}
```

UUID v4 minúsculo; motivo trim/NFC de3–1000 puntos de código. Cambio real incrementa
revisión una vez; intención equivalente sin cambio devuelve `SIN_CAMBIOS` sin nueva
vigencia/historial. La clave `(actor, UUID)` conserva operación e intención normalizada
sin vencimiento: otro vivero, destino, motivo, revisión u operación da409
`COMANDO_REUTILIZADO`. La revisión obsoleta no sobrescribe otra asignación.

| HTTP / resultado | Conducta del cliente |
|---|---|
| 200 `CONFIRMADO` | Refrescar accesos efectivos; el recibo describe el hecho explícito histórico |
| 403 `CAPACIDAD_INSUFICIENTE` | Actor sin ADMIN/ámbito requerido |
| 404 `RECURSO_NO_VISIBLE` | Cuenta o vivero destino ausente |
| 409 `REVISION_OBSOLETA` | Releer; confirmar otra intención con clave nueva |
| 409 `DESTINO_NO_ELEGIBLE` | No otorgar a ADMIN, VOLUNTARIO o inactivo |
| 409 `COMANDO_REUTILIZADO` | Conservar la intención original de esa clave |
| 422 entrada/campo no permitido | Corregir entrada; no hubo cambio ni terminal |
| 503 `RESULTADO_NO_DETERMINADO` | Conservar UUID e intención; recuperar o repetir exactamente |

Los rechazos de negocio del ejecutor son durables. GET de recuperación devuelve200
para el terminal propio, incluido `RECHAZADO`, o202 `SIN_RESULTADO` con
`Retry-After: 2`. Ausencia propia no acredita fallo ni revela otra cuenta. Perder
ADMIN no impide recuperar; cuenta inactiva permanece bloqueada. El DTO cerrado y
los recibos de participación no se amplían ni se reinterpretan.

## Operación M2 y rutas equivalentes

Todo `/api/lotes-vivero` requiere JWT interno verificado. Los GET por objeto
resuelven el vivero real del lote antes de consultar eventos/fotos/saldos. La lista
filtra viveros antes de contar y paginar; stock por especie filtra antes de sumar.
Sin ámbitos, listados generales devuelven vacío; un ID o filtro de vivero ajeno
devuelve403. Las escrituras vuelven a comprobar cuenta/actividad/ámbito dentro de
la RPC bajo locks; no dependen de la prelectura HTTP.

| Superficie cubierta | Rutas bajo `/api/lotes-vivero` |
|---|---|
| Alta y carga previa | `POST /`, `POST /evidencias-pendientes` |
| Listado y agregado | `GET /`, `GET /stock/especies` |
| Lote y contexto | `GET /:id`, `GET /:id/embolsado/context` |
| Eventos y lecturas | `POST /:id/{embolsado,adaptabilidad,descarte-pre-embolsado,merma,despacho}`, GET de embolsado/adaptabilidad/merma/despacho |
| Fotos por evento | `POST /:id/{embolsado,adaptabilidad,descarte-pre-embolsado,merma,despacho}/evidencias-pendientes` |
| Cadena y saldo | `GET /:id/timeline`, `GET /:id/saldos` |
| M2–M3 | `POST /:id/asignaciones`, `GET /:id/asignaciones`, `POST /:id/asignaciones/:asignacionId/devolucion` |

Se aceptan IDs decimales y números legados seguros en DTO operativos; los números
ya inseguros se rechazan antes de RPC. Las rutas nuevas y los ámbitos/actores se
mantienen exactos, con casts a texto al resolver identidad y establecimiento.

Entrega y devolución explícitas requieren **ADMIN o la intersección operario del
vivero + COORDINADOR de esa subcampaña**. El equipo solo aporta la responsabilidad
M3. Cancelación individual y desactivación masiva administrativas conservan sus
devoluciones atómicas aun cuando ADMIN no tenga vigencias. Helpers internos de
devolución/cancelación/cierre no son RPC ejecutables directamente por service_role;
los entrypoints privados verificados invocan sus efectos con search_path fijo.
Las sobrecargas antiguas no recuperan EXECUTE de servicio por coincidir en nombre.

## Material M1, revisión documental y desecho

`GET /api/v1/vivero/origenes` acepta `vivero_id` obligatorio,
`recoleccion_id?`, `page?` (1–1000000) y `limit?` (1–50). Devuelve material VALIDADO,
ABIERTO y con saldo positivo del almacenamiento indicado, filtrado antes de sumar
el total/paginar. Su proyección conserva IDs de origen/recolector, fecha, código,
planta, tipo, snapshots de especie/variedad, estado, unidad y saldo. No entrega
contactos, observaciones, ficha completa o autoridad para editar el origen ajeno.
Un origen concreto de otro establecimiento devuelve404.

El operario puede consumir orígenes de otro recolector del mismo vivero sin M1.
`recoleccion.vivero_id` sigue significando almacenamiento M1;
`lote_vivero.vivero_id` sigue siendo destino operativo seleccionado. **No se copian
ni igualan silenciosamente**. El camino ordinario del operario exige igualdad entre
ambos, comprobada bajo lock del origen. ADMIN conserva la compatibilidad explícita
con destinos distintos del contrato anterior; no se implementan traslados. El alta
conserva unidad/saldo, snapshots, ubicación y evidencia mínima elegibles y confirma
lote, INICIO, consumo negativo M1 y fotos juntos. INICIO no crea plantas vivas.

La revisión legada de fichas ajenas, detalle/fotos y aprobación/rechazo queda limitada
a ADMIN o VALIDADOR asignado al vivero de almacenamiento. `pending-validation`
combina para VALIDADOR los pendientes de esos viveros con los propios cuando tiene
M1 efectivo, incluso sin M2. GENERAL con M1 conserva sus pendientes propios; ADMIN
conserva alcance global. Filtros y búsqueda se intersectan con esa unión antes de
contar y paginar, sin duplicar una ficha propia situada en un vivero asignado.
Al retirar M1 quedan solo los viveros asignados; sin M1/M2 no hay respaldo global.
GENERAL con
M2 no obtiene la acción conjunta futura. M1 permite mantener lo propio, no revisar
lo ajeno. La aprobación propia continúa denegada para ADMIN y cuentas combinadas.
El rechazo antiguo conserva la excepción090. Ninguna de estas acciones registra
recepción física: VALIDADO histórico no se presenta como recepción acreditada.

El almacenamiento se obtiene mediante `vivero_id::text` en PostgreSQL antes de
autorizar la ficha. La proyección de detalle/listas devuelve `vivero_id` y
`usuario_id` como cadenas; las relaciones de usuario/vivero conservan también su
ID exacto. `vivero_id` en captura/edición multipart o JSON y filtros, y `viveroId`
en la ruta por vivero, aceptan cadenas decimales positivas hasta BIGINT. Se admiten
números JSON legados solo hasta `Number.MAX_SAFE_INTEGER`; un Number inseguro se
rechaza y nunca se transforma en autoridad. La ruta devuelve422 para ID inválido;
DTO/filtros devuelven400. Los viveros `9007199254740992` y `9007199254740993`
permanecen distintos en lectura, fotos, revisión y filtros.

`POST /api/recolecciones/:id/desecho` exige ADMIN u operario vigente del vivero de
almacenamiento, sin exigir M1 o autoría. La RPC comprueba actividad, ámbito, VALIDADO,
ABIERTO, unidad y saldo; UNIDAD exige entero y se rechazan cantidades no finitas.
El hecho sigue siendo `DESECHO` en el ledger M1, separado de MERMA de plantas M2.
El flag M1 `desechar` conserva su significado global de ADMIN; para un operario T3
usa la capacidad **por vivero**. Los flags de estado del detalle no conceden acceso.
La precondición de recepción conforme pertenece a T4 y no se inventa para el legado.

## Evidencias, Storage y transacciones

La carga previa a INICIO exige `vivero_id` en multipart. Para los otros eventos se
usa la ruta del lote; el servidor deriva vivero y tipo de evento del recurso/ruta.
`m2_evidencia_contexto` conserva de forma inmutable foto, actor, vivero, lote y evento;
metadata del cliente no concede autoridad. La RPC de alta/evento/entrega vuelve a
comprobar el contexto y autor de cada evidencia, pendiente y no eliminada, con locks
por ID ascendente. Las pendientes legadas sin contexto deben volver a subirse para
nuevos eventos, sin borrar las anteriores ni mover vínculos históricos.

También se protegen `GET /api/evidencias-trazabilidad/:id`, `/entidad/:tipo/:id`,
filtros equivalentes y consultas por código. Un no ADMIN indica evento/lote autorizado
para leer M2; búsquedas generales excluyen M1/M2 antes del total/paginación. Una foto
M1 sigue la política de ficha propia o revisión documental autorizada; la proyección
mínima de material M2 no concede acceso general a sus fotos.

**Audiencia real:** el bucket existente `recoleccion_fotos`, sus originales y las
URLs públicas ya emitidas conservan su audiencia. Cerrar JSON no revoca URLs ni
acredita RLS/Storage remoto. Las nuevas cargas de esta entrega siguen ese bucket;
no se anuncian como archivos privados. Banco de semillas, Impacto y catálogos
legitimados conservan audiencia pública. Un corte de Storage requiere su verificación
propia; T2 no migra ni borra imágenes históricas.

094 confirma acceso, revisión, historial y terminal juntos. 095 confirma saldo,
eventos, vínculos e historia operativa en cada RPC. Orden cooperativo:
cuentas ASC → campaña → subcampaña → asignaciones ASC → lote/origen → evidencias ASC.
Las ramas M1 sin campaña mantienen cuenta → ficha → evidencias. Operación toma SHARE
del actor; retiro/rol/baja072 toma UPDATE de destino. El retiro serializa nuevas
operaciones sin borrar historia y conserva los otros ámbitos. SQL privilegiado que
omita el protocolo no queda cubierto.

Storage/preparación y Pinata/blockchain permanecen fuera de la transacción SQL. Un
rechazo SQL concluyente permite limpiar subidas sin vínculo; una respuesta incierta
o lectura fallida después de persistir conserva archivos. No existe recuperación
durable de estas cargas operativas ni outbox de blockchain. En timeout de una
operación sin comando durable, consultar el estado antes de repetir.

## Verificación y límites

Comandos de entrega:

```sh
npm run build
npm run test:unit -- --runInBand
npm run test:db:vivero:acceso -- --postgis --pg-bin /ruta/runtime-postgis/bin --evidence /ruta/nueva/t2.json
node scripts/qa/vivero-acceso-openapi.cjs --check
node scripts/qa/recoleccion-acceso-openapi.cjs --check
node scripts/qa/pa-int02c-openapi.cjs --check
```

Resultado tras la corrección coordinadora: build correcto, 87 suites/1.252 unitarios,
40 grupos SQL, 22 carreras con locks observados y13 grupos HTTP con PostgreSQL14.24/
PostGIS3.2.10 reales. La [nueva regresión T1](evidencia/t2-correccion-regresion-t1-2026-11-05.json)
añade32 grupos SQL,12 carreras y9 casos HTTP en PostgreSQL14.17. Los tres checks
OpenAPI coinciden; T2 incluye ahora las11 rutas M1 operativas además de las25 M2/
gestión para reflejar el contrato de vivero y pendientes. [SQL/HTTP correctivos](evidencia/t2-correccion-bigint-cola-local-2026-11-05.json),
[validación/versiones/huellas posteriores](evidencia/t2-correccion-validacion-2026-11-05.json).
Los cortes iniciales [T2](evidencia/t2-acceso-viveros-local-2026-11-05.json),
[validación](evidencia/t2-acceso-viveros-validacion-2026-11-05.json) y
[regresión T1](evidencia/t2-regresion-t1-2026-11-05.json) se conservan como evidencia
anterior a la corrección y no acreditan las nuevas fuentes.

Los resultados finales, versiones y huellas se enlazan desde la evidencia propia
de T2; las evidencias T1 conservan su corte anterior. El runner usa PostgreSQL14
local desechable, socket privado sin TCP ni `.env`; JWT y RPC de dominio reales,
Storage/metadata HTTP sintéticos. Amplía antecedentes mínimos C/M1 con M2/M3 y usa
077 real; no acredita replay001–095, catálogo Supabase real, ceremonia WebAuthn,
Pinata o blockchain. Con `--postgis` exige PostGIS real y prueba reposición M3 con stock asignado sin acceso M2, sin segundo débito/evento de vivero, además de punto interior/exterior. El grupo inicial de esa regresión es un antecedente sintético; no acredita un alta inicial nueva por075. No modifica geocercas ni evaluadores PostGIS. Sin ese flag la suite focal omite expresamente esa comprobación. Las regresiones unitarias de Plantación, Banco e Impacto
conservan esos contratos y audiencias, con sus dependencias sustituidas.

Aplicación hasta095 reportada por el usuario; cotejo SQL del destino, correspondencias reales de acceso, corte de cliente,
push y despliegue pendientes. T3 añade pantalla/navegación; T4 recepción física y
acción conjunta; T5 plantas externas. Ninguna se inicia en esta entrega.

ESLint sin `--fix` sobre el núcleo nuevo de acceso/IDs pasa. La comprobación informativa más amplia mezcla código legado y cambios y no está verde; no se atribuye todo a deuda previa ni se acredita lint global. Las comprobaciones obligatorias de build, unitarios, SQL/HTTP y contratos sí se distinguen en la evidencia.
