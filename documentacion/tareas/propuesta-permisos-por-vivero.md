# Propuesta de accesos de Recolección y Vivero

Antecedente de diseño. Las reglas de recepción de esta propuesta fueron reemplazadas
por la [recepción única100](../../docs/t4-recepcion-semillas.md): ADMIN global o
VALIDADOR con asignación vigente; GENERAL con M2 conserva operación de material
recibido. El contenido siguiente conserva las decisiones y la evidencia originales.

Creación: 4 de noviembre de 2026. Actualización: **6 de noviembre de 2026**.
**Modelo elegido por el usuario; T1–T4 implementadas, verificadas y revisadas localmente;
[cierre T4](../../docs/evidencia/t4-revision-coordinadora-2026-11-06.json); T5 pendiente.**
[Entrega M1, contrato y límites](../../docs/t1-acceso-recoleccion.md).
Base revisada: backend local `be62df0`, migraciones hasta 091 y modelo físico
aportado del 4 de noviembre. No se ejecutó SQL ni se comprobó el entorno desplegado.

## 1. La decisión elegida

**Accesos fijos combinables y asignación por vivero**: permite solo M1, solo M2
o ambos; conserva una cuenta y exige autorización por operación y objeto.

- Recolección permite registrar y mantener los orígenes propios según su estado.
- Vivero permite recibir y trabajar en uno o varios establecimientos asignados.
- Un único acceso de operario incluye recepción de semillas, operación de lotes y,
  cuando se implemente, recepción de plantas externas. Todos tienen las mismas
  facultades locales, sin encargado, receptor separado ni perfil de consulta.
- `ADMIN` gestiona accesos y conserva alcance global sujeto a las reglas del dominio.
  `VOLUNTARIO` y cuentas inactivas no obtienen acceso operativo M1/M2 por este diseño.
- Plantación conserva sus permisos contextuales. Sus permisos no conceden acceso M2.
- Quien recolectó no confirma su propia recolección: la recepción/validación
  corresponde a otra persona autorizada del vivero, incluso si el autor tiene ambos accesos.
- El acceso M1 y la autoría no autorizan `DESECHO` de semillas; esa operación
  corresponde al operario del vivero donde están almacenadas, o a `ADMIN`.

Las alternativas de cargos separados o varios roles globales dejan de ser la
opción de trabajo. Se desarrolla este modelo sin implementar un motor genérico
de permisos por acción.

## 2. Qué pasa con `VALIDADOR`

**No se elimina el rol global `VALIDADOR`, ni sus cuentas o historia.** La tabla
siguiente conserva el contraste con la inspección de referencia `be62df0`; T1 ya
habilita la captura por M1 explícito según su entrega enlazada. El cambio propuesto es cómo se autoriza
su función de revisión dentro de M1/M2 después del corte:

| Situación | Código de referencia `be62df0` | Diseño elegido |
|---|---|---|
| `VALIDADOR` sin asignación a un vivero | Puede revisar globalmente pendientes M1 | El rol por sí solo no permite recibir/validar en ningún vivero |
| `VALIDADOR` asignado a A | No existe esa asignación en el modelo actual | Recibe, valida y opera en A como cualquier otro operario |
| `GENERAL` asignado a A | Opera M2, pero no puede aprobar M1 | Puede recibir y validar el material de A con su acceso de Vivero |
| `VALIDADOR` con acceso de Recolección | El rol actual no permite crear recolecciones | Puede crearlas por el acceso M1 explícito, no por su rol global |

Se conserva un rol global por cuenta. `GENERAL` y `VALIDADOR` siguen siendo
cuentas internas compatibles; la autoridad operativa se obtiene de los accesos
explícitos. La función de validar la recepción pasa al operario del vivero de
destino y deja de depender exclusivamente de la etiqueta `VALIDADOR`.
Esto requiere cambiar los checks actuales, no solo los nombres en la interfaz.

## 3. Tablas: qué existe y qué se propone

Los nombres y campos nuevos siguientes son **diseño propuesto**, no tablas ya
creadas ni DDL aprobado. Se mantienen los IDs y relaciones del dominio existente.

| Tabla existente | Función que conserva |
|---|---|
| `usuario` | Una cuenta, `rol` global único, actividad e identidad verificada |
| `vivero` | Identidad del establecimiento |
| `recoleccion` | Origen, recolector en `usuario_id`, cantidad declarada, saldo y estado |
| `recoleccion_historial` / `recoleccion_movimiento` | Historia del origen / efectos sobre su saldo |
| `lote_vivero` / `evento_lote_vivero` | Lotes físicos, saldo vivo y eventos de manejo |
| `evidencias_trazabilidad` | Evidencias vinculadas a sus hechos, con la audiencia correspondiente |

### A. Dos tablas nuevas de acceso

| Tabla propuesta | Campos específicos | Regla |
|---|---|---|
| `usuario_acceso_recoleccion` | `id`, `usuario_id` | Una vigencia de acceso M1 por usuario |
| `usuario_vivero` | `id`, `usuario_id`, `vivero_id` | Una vigencia por pareja usuario–vivero; permite varios viveros por persona |

Ambas guardan además `otorgado_en`, `otorgado_por`, `revocado_en` y `revocado_por`.
Los IDs referencian a `usuario`/`vivero`; los actores de otorgamiento/retiro también
referencian a `usuario`. Las fechas nuevas de auditoría registran el momento real.
Una vigencia es efectiva si no está revocada y la cuenta está activa y es interna.

Solo puede existir una vigencia abierta por usuario en M1 y por usuario–vivero en
M2. Al retirar se cierra la vigencia; al volver a conceder se abre otra. No se borran
filas históricas ni se necesita un campo de cargo o un rol de receptor.
`ADMIN` tiene acceso derivado: no necesita una fila en cada vivero.

### B. Constancia de recepción de material M1

T4 implementa y revisa localmente este incremento con 096; el
[contrato técnico y la conciliación pendiente](../../docs/t4-recepcion-semillas.md)
concretan las tablas y reglas propuestas a continuación. No acredita aplicación remota.

Se propone `recoleccion_recepcion`, independiente de las tablas de permisos:

| Campo propuesto | Significado |
|---|---|
| `id` | Identificador de la recepción |
| `recoleccion_id` | Origen M1; una sola recepción conforme por origen en esta primera versión |
| `vivero_id` | Establecimiento donde efectivamente se recibió |
| `cantidad_recibida`, `unidad_recibida` | Cantidad física confirmada, normalizada a `G` o `UNIDAD` según el material |
| `fecha_recepcion` | Día real de recepción, distinto de la fecha de recolección |
| `recibido_por` | Usuario autenticado que confirma el hecho |
| `registrado_en` | Momento de persistencia; no inventa precisión de hechos históricos |
| `comando_id` | Identidad de operación para recuperar la confirmación sin duplicarla; su contrato se concretará antes de implementar |

Los IDs de origen, vivero y receptor son referencias a las tablas existentes.
Las evidencias e incidencias se vinculan al hecho y a su historial; la ubicación
física de esos vínculos y las revisiones se definirán en el contrato técnico.
Esta es una lista de campos de negocio, no una garantía de esquema completo.

Se recomienda una recepción total con cantidad/unidad coincidentes. Si se declaran
10 kg y llegan 8 kg, se registra la incidencia en el historial y no se crea una
recepción conforme ni se habilita consumo hasta resolverla de forma trazable.
No se sobrescribe lo declarado, ni se usa `DESECHO` para cuadrar, ni se interpreta
el faltante automáticamente como rechazo de la ficha.

«Recibir y validar» confirmaría recepción, estado `VALIDADO`, actor/fecha de
validación, snapshots e historial juntos. `recoleccion.usuario_id` conserva al
recolector; `recibido_por` identifica al receptor, aunque sean personas distintas.
El receptor debe ser distinto del recolector; tener ambos accesos o alcance
administrativo no convierte la autorrecepción en válida.
El saldo sigue en M1: el nuevo camino requiere validación y recepción conforme
para consumirlo. No se añade otro inventario ni un estado `RECIBIDO` por defecto.
Los `VALIDADO` antiguos no prueban recepción y necesitan conciliación antes del corte.

### C. Plantas externas: ampliar el lote y sus eventos

La recepción de plantas vivas usa el mismo acceso de Vivero, pero no es una
recepción de semillas ni necesita una recolección ficticia.

| Tabla existente por ampliar | Cambio de diseño propuesto |
|---|---|
| `lote_vivero` | Modalidad de ingreso y procedencia separadas; datos históricos del proveedor/donante y evidencia disponible |
| `lote_vivero.recoleccion_id` | Obligatorio en el camino M1; nulo para incorporación de plantas o saldo inicial |
| Campos de material en proceso del lote | Admitir explícitamente el ingreso de plantas vivas, sin rellenarlos con ceros o semillas inventadas |
| `plantas_vivas_iniciales` / `saldo_vivo_actual` | Conservar la base y el saldo vivo; incorporación real como alternativa al embolsado |
| `evento_lote_vivero` | Incorporación identificada con cantidad, fecha y responsable; no un `EMBOLSADO` simulado |

Modalidad distingue origen M1, recepción de plantas y saldo inicial; procedencia
conserva producción propia, compra, donación o desconocida justificada. Una única
base de plantas vivas por lote evita sumar incorporación y embolsado dos veces.
No se propone por ahora otra tabla de receptor o proveedores.

Esta ampliación aún no existe. Su detalle, aptitud de entrega y recepción directa
en campo permanecen en el [plan de incorporación](plan-incorporacion-plantas-procedencia.md).
La recepción directa no se elimina ni se representa como paso ficticio por vivero.

## 4. Permisos principales con el diseño elegido

Todos los «sí» requieren cuenta activa, estado válido y autorización por objeto.
«Propias» se refiere a autoría del registro, no a pertenencia al vivero.

| Acción | Solo Recolección | Solo Vivero A | Ambos, con Vivero A | `ADMIN` |
|---|---|---|---|---|
| Crear recolección | Sí | No | Sí | Sí |
| Editar, enviar o reenviar recolecciones propias | Según estado | No | Según estado | Según estado y autoridad global |
| Revisar pendientes y recibir/validar material de A | No | Sí, sin autoconfirmación | Sí, sin autoconfirmación | Cualquier vivero, sin autoconfirmación |
| Consultar semillas de otro recolector para recepción/consumo | No por ese acceso | Proyección necesaria de A | Proyección necesaria de A | Alcance global |
| Consumir semillas al iniciar lote | No | A, con origen elegible y recibido | Igual | Según reglas del origen/destino |
| `DESECHO` de semillas almacenadas en A | No, aunque las haya recolectado | Sí, por su acceso a A | Sí, por su acceso M2 a A | Alcance global, con saldo/estado válidos |
| Consultar lotes, evidencias privadas y saldos M2 | No | Solo A | Solo A | Alcance global |
| Embolsado, adaptabilidad, descarte, merma y despacho manual | No | Solo A | Solo A | Según reglas del dominio |
| Incorporar plantas externas, cuando se implemente | No | Solo A | Solo A | Cualquier vivero |
| Entrega/devolución explícitas a subcampaña | No | Además requiere coordinación de esa subcampaña | Igual | Según reglas M3 |
| Asignar o retirar accesos de usuarios | No | No | No | Sí |

El rol `VALIDADOR` no añade facultades a esta matriz por sí solo. Un acceso M1
no concede validación global; uno M2 no concede edición o borrado del origen ajeno.
Rechazar por datos incorrectos y registrar una diferencia física no son el mismo hecho.
El `DESECHO` de semillas se conserva como movimiento de saldo M1, aunque lo autorice
el acceso M2 al vivero; no se confunde con la merma de plantas del lote. Ser autor
del origen no concede esa operación ni hace falta ser su autor para ejercerla
como operario del establecimiento. En el nuevo camino requiere recepción conforme,
estado y saldo elegibles; no sirve para cuadrar una discrepancia de recepción.

Para el operario se propone consumir en el mismo vivero donde se recibió el origen.
Esto restringe un contrato que hoy admite otro destino operativo y debe acordarse
antes del corte. Los traslados quedan fuera de esta primera versión.
Entrega/devolución requieren operario del vivero y `COORDINADOR` de la subcampaña,
o `ADMIN`; el coordinador no asignado necesita revisión expresa en la transición.
Cancelación y desactivación masiva administrativas mantienen sus devoluciones
atómicas. Plantar consume asignaciones, sin descontar de nuevo Vivero.
Las consultas públicas de Banco de semillas e Impacto conservan su audiencia.

## 5. Ejemplo: una persona con ambos accesos

Datos sintéticos: usuario `42`, con rol global `VALIDADOR` y cuenta activa.

| Tabla | Datos relevantes |
|---|---|
| `usuario` | `id=42`, `rol=VALIDADOR`, `activo=true` |
| `usuario_acceso_recoleccion` | Acceso vigente para `usuario_id=42` |
| `usuario_vivero` | Vigencia para `usuario_id=42`, `vivero_id=7` |
| `usuario_vivero` | Otra vigencia para `usuario_id=42`, `vivero_id=9` |

Con el diseño futuro puede crear recolecciones por su acceso M1 y recibir material,
operar lotes e incorporar plantas externas en los viveros 7 y 9 por sus asignaciones.
No necesita otra cuenta, otro rol global ni permiso de receptor. No opera el vivero 12.
Si recibe material registrado por el usuario `53`, este sigue siendo recolector y
el `42` queda como receptor en `recoleccion_recepcion`.
Las recolecciones del propio `42` necesitan otro receptor autorizado. Puede ejercer
`DESECHO` en 7/9 por su acceso M2, no por tener M1 o ser autor del origen.

Retirar solo M1 conserva su operación en 7/9; retirar solo el acceso al vivero 7
conserva M1 y el vivero 9. Ningún retiro altera hechos ya confirmados.
Esto no describe lo que el código permite actualmente con solo el rol `VALIDADOR`.

## 6. Reglas confirmadas y orden de trabajo

Las dos decisiones anteriores quedan resueltas por el usuario: **sin
autoconfirmación del recolector y desecho a cargo de Vivero**. En la inspección de referencia M1 permitía desecho al creador o ADMIN; T1 cierra
esa vía y la aprobación propia en service/RPC. El acceso de Vivero y la interfaz
conjunta conservan las entregas posteriores. La combinación de accesos no evita comprobar
actor, establecimiento y estado ni permite modificar cantidades libremente.

La ejecución se divide en [encargos para agentes](encargos-accesos-recoleccion-vivero.md):
**T1 acceso M1 → T2 acceso M2 por vivero → T3 administración visual → T4 recepción
y validación de semillas → T5 incorporación externa**. T1/T2 incluyen sus APIs
administrativas; T3 reutiliza «Usuarios y permisos». El aislamiento final requiere
T1 y T2, y la recepción física requiere T4: ningún incremento parcial acredita
las capacidades posteriores. El corte de API, RPC y cliente debe coordinarse.

Confirmar autorización, saldo e historia en una transacción; preservar el orden
compartido de locks y verificar retiro/baja concurrentes. Probar independencia y
combinación M1/M2, rechazo de acceso ajeno por ID, semillas de otro recolector,
diferencias de cantidad, reintentos sin doble recepción y continuidad de lotes externos.
Las migraciones futuras serán aditivas y deberán comprobar el catálogo destino.

El diseño original no modificó código ni permisos reales. T1 añade ahora código,
SQL y OpenAPI locales según su entrega enlazada, sin modificar cuentas o permisos reales. Tampoco
se añade una jerarquía de encargados, recepción parcial o un motor RBAC por acción.

## Fuentes para concretar el contrato

- [Modelo físico vigente](../../../r3foresta-docs/database/00_database_schema.md) y [exportación aportada](../../../r3foresta-docs/database/fuentes/supabase-estructura-2026-11-04.md).
- [Autorización M1](../../src/recolecciones/application/recoleccion-auth.service.ts), [validación actual](../../src/recolecciones/application/recoleccion-validacion.service.ts) y [autorización M2](../../src/lotes-vivero/application/vivero-auth.service.ts).
- [Reglas M1](../../../r3foresta-docs/01-recoleccion-module/01_reglas_de_negocio_recoleccion.md), [reglas M2](../../../r3foresta-docs/02-vivero-module/01_reglas_de_negocio_vivero_core.md), [contrato M1→M2](../../../r3foresta-docs/90-contratos-integracion/01_contrato_recoleccion_a_vivero.md), [inicio 018](../../migrations/018_fix_vivero_inicio_lote_rpc_trazabilidad_evidencia.sql), [contrato M2→M3](../../../r3foresta-docs/90-contratos-integracion/02_contrato_vivero_a_plantacion.md) y [última redefinición compartida 077](../../migrations/077_pa_int02d_operaciones_compartidas.sql).
- [Incorporación y procedencia](plan-incorporacion-plantas-procedencia.md), [participación](../modulos/participacion.md), [pruebas](../../test/README.md) y [estado canónico](../../../r3foresta-docs/ESTADO.md).

El modelo de accesos está elegido; los nombres y campos son diseño para revisión.
Código, pruebas, SQL aplicado y despliegue se acreditarán por separado cuando existan.
