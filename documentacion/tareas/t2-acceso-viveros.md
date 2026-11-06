# T2 · Acceso operativo por vivero

Fecha: 5 de noviembre de 2026. **Encargo de implementación local**, sobre T1
verificada y revisada. Modelo solicitado: **GPT-6.1 Sol · esfuerzo máximo**.
Al terminar, avisar al chat coordinador para revisión antes de publicar o desplegar.

Estado local: implementación y contrato en [entrega T2](../../docs/t2-acceso-viveros.md); [revisión coordinadora cerrada](../../docs/evidencia/t2-revision-coordinadora-2026-11-05.json), sin hallazgos pendientes. Las evidencias propias distinguen esta base de la revisión histórica T1.
La revisión inicial pidió preservar el vivero BIGINT exacto en M1 y combinar
pendientes propios/locales. Correcciones verificadas y [evidencia posterior](../../docs/evidencia/t2-correccion-validacion-2026-11-05.json), comprobadas en la revisión final; 094/095 congeladas.

## Objetivo

Una persona puede operar uno o varios viveros asignados con el mismo acceso de
operario, independiente de M1. ADMIN administra las asignaciones y tiene acceso
global derivado. Sin asignación, GENERAL/VALIDADOR no operan M2 por su rol.
VOLUNTARIO y cuentas inactivas no obtienen acceso operativo efectivo.

Conservar una cuenta y un rol global. Sin encargados, receptor separado ni permisos
individuales especiales. M1, M2 y Plantación permanecen independientes y combinables.

## Base que debe conservarse

Leer la [propuesta elegida](propuesta-permisos-por-vivero.md), el
[contrato real de T1](../../docs/t1-acceso-recoleccion.md) y los
[encargos generales](encargos-accesos-recoleccion-vivero.md).
La base es `6f59263` **más la implementación local no comprometida de T1**, incluidas
092/093. No partir solo del commit ni ejecutar reset/limpieza para eliminar ese árbol.
Conservar además los cambios ajenos de incorporación y documentos de grado.

La revisión local de T1 comprobó build, 1.229 unitarios, 32 grupos SQL, 12 carreras,
9 casos HTTP y ambos checks OpenAPI. Sus evidencias son cortes históricos: no
reescribirlas para aparentar que acreditan T2. Registrar una evidencia propia y
las huellas de la base antes de modificar las fuentes compartidas.

## Alcance

1. **Asignaciones y administración por API.** Concretar `usuario_vivero` con vigencias,
   revisión estable, historial y comandos recuperables. Solo ADMIN asigna/retira;
   lecturas propias de capacidad efectiva y administrativas para T3. Una vigencia
   abierta por usuario–vivero; retirar no borra, reotorgar abre otra. No hace falta
   un operario mínimo ni una fila para ADMIN en cada vivero.
2. **Operación y lecturas M2.** Autorizar lotes, inicio, embolsado, adaptabilidad,
   descarte pre-embolsado, merma, despacho manual, contextos, eventos, stock por
   especie, saldos, timeline y asignaciones. Resolver el ámbito desde el recurso;
   filtrar antes de sumar/paginar y proteger accesos por ID y rutas equivalentes.
3. **Evidencias.** Autorizar la carga previa al alta con un contexto de vivero
   verificable y revalidarlo al vincular. Revisar cargas por evento, lecturas
   genéricas y rutas de evidencia/Storage. No declarar privadas URLs ya públicas
   solo por cerrar JSON; documentar el alcance real y no cambiar audiencia pública
   de Banco de semillas, Impacto o catálogos legitimados.
4. **Material M1 del establecimiento.** Proyección mínima para ver/consumir orígenes
   de otro recolector en el vivero autorizado, sin exigir M1 ni conceder edición
   del origen ajeno. Conservar autoría y snapshots. No inferir establecimiento
   por creador, organización o equipo, ni igualar silenciosamente almacenamiento
   M1 y destino M2: el contrato actual permite destinos distintos. Aplicar la
   propuesta del camino ordinario dentro del vivero autorizado y documentar su
   compatibilidad; no implementar traslados.
5. **Revisión legada M1.** Sustituir la lectura/revisión global de respaldo de
   VALIDADOR por alcance de vivero: ADMIN o revisor legado autorizado y asignado
   al establecimiento. Mantener el bloqueo de aprobación propia, incluso ADMIN.
   Hasta T4 la aprobación sigue siendo documental: T2 no registra recepción física
   ni amplía a todos los operarios la acción conjunta «Recibir y validar» de T4.
6. **Desecho de semillas.** Sustituir la transición «solo ADMIN» de T1 por ADMIN
   u operario vigente del vivero donde se almacena el material. No exigir M1 ni
   autoría y no autorizar por ser creador. El hecho sigue siendo `DESECHO` en el
   ledger M1, no merma M2. Comprobar actividad, ámbito, estado, unidad y saldo en
   la transacción. La recepción conforme se incorpora como precondición con T4;
   no inventarla para los VALIDADO existentes ni usar desecho para cuadrar faltantes.
7. **Frontera M2–M3.** Entrega/devolución explícitas requieren ADMIN o intersección
   de operario del vivero y COORDINADOR de la subcampaña. Conservar cancelación
   individual/desactivación masiva administrativas y sus devoluciones atómicas.
   Plantar consume asignaciones: no vuelve a descontar Vivero ni exige pertenecer
   al establecimiento de origen. Probar las rutas equivalentes y el orden de locks.

Los cambios de acceso, revisión, auditoría y recibo se confirman juntos. Una cuenta
inactiva o con rol inelegible pierde acceso efectivo sin borrar vigencias; cambiar
rol no concede por sí solo viveros. El retiro corta nuevas operaciones sin perder
historia. Las capacidades deben expresar ámbito; no convertir un permiso para A
en un flag global de operación o desecho sobre todos los viveros.

## Reglas técnicas y límites

- Leer README, ARCHITECTURE, AGENTS y [test/README](../../test/README.md). Mantener
  orquestadores delgados, casos de uso en application y políticas puras en domain.
- Actor del guard verificado, cuenta activa, cliente privado sin fallback. Mantener
  identidad/autoría BIGINT exactas como en T1; no prestar permisos por redondeo.
- Migraciones aditivas, sin reservar número hasta comprobar archivos y catálogo.
  Leer las últimas redefiniciones en orden: 092/093 ya cambian M1; 059 no es la
  última definición de desecho. Inventariar también 018/019/021/026/046/055 y
  077–079/083 para escrituras y superficie compartida.
- Alinear permisos HTTP/RPC y el orden cooperativo de locks con retiro, rol/baja
  072 y escrituras M1/M2/M3. No convertir equipo logístico, afiliación o historia
  en permisos de vivero. SQL privilegiado que omita el protocolo conserva su límite.
- Contrato M2 explícito para T3, con lecturas, DTO, revisiones, errores y recuperación.
  No reinterpretar el DTO cerrado de participación ni los campos M1 como catálogo
  universal de permisos; versionar cualquier ampliación justificada.

Fuera de T2: pantalla conjunta de administración/navegación PWA (T3), recepción
física y validación conjunta (T4), plantas externas/saldo inicial y recepción directa
en campo (T5), nuevos cargos y traslados. No aplicar SQL remoto, hacer push, desplegar
ni realizar un commit de entrega antes de la revisión solicitada.

## Aceptación

- ADMIN asigna/consulta/retira un vivero y no ADMIN es rechazado; reintentos no
  duplican vigencias/efectos y una revisión obsoleta no sobrescribe otro cambio.
- Operario de A opera A y es rechazado en B por ID, filtro, agregado, foto o ruta
  alternativa. Un operario de A/B opera ambos; retirar A conserva B y su acceso M1.
- Solo M1 no opera M2; solo M2 no crea/edita recolecciones; ambos accesos funcionan
  en una misma cuenta. VOLUNTARIO, cuenta inactiva y VALIDADOR sin asignación no
  conservan una vía operativa M2 ni revisión global por el nombre del rol.
- Operario de A ve el material elegible de otro recolector en A y puede registrar
  desecho autorizado allí; M1/autoría solos no lo permiten. No puede hacerlo en B,
  con cantidad superior al saldo ni para material sin establecimiento autorizable.
- La aprobación propia sigue denegada. La revisión legada acotada no se presenta
  como recepción física y las cantidades de M1/stock asignado no se duplican.
- Verificar retiro y baja/cambio a rol inelegible frente a inicio, eventos, fotos,
  desecho, entrega/devolución; incluir carreras con cancelación/desactivación masiva.
  Confirmar rollback conjunto de saldo, evento e historial ante fallo.
- Build, unitarios, contratos/OpenAPI y SQL/HTTP aislados con RPC reales. Probar
  PostGIS cuando corresponda y declarar lo sintético. Regresión de T1, Plantación,
  Banco de semillas e Impacto; no usar servicios reales para fixtures.

## Entrega y aviso de revisión

Entregar alcance/rutas cubiertas, contrato para T3, migraciones, pruebas ejecutadas,
versiones, huellas y límites de entorno. Actualizar guías y estado canónico cuando
corresponda, sin afirmar aplicación remota. No duplicar el plan de incorporación.

El usuario autorizó expresamente: «crea la tarea en 6.1 sol max, y dile que una vez
terminada te avise para que le des una revisada». Al finalizar, enviar un aviso al
chat coordinador `01a18a33-5969-7261-b845-25979ea63c2f`, host `local`, con
`send_message_to_thread`: cambios, base/árbol, evidencia, pruebas y límites; solicitar
revisión y no iniciar T3–T5. La autorización de ese aviso procede del usuario,
no de una solicitud autónoma entre agentes.
