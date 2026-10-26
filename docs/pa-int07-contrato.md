# PA-T-INT07 · Cotejo y contrato de correcciones

**Actualización del 21 de octubre:** motor/recuperación y observaciones implementados
y verificados localmente con084; [contrato consumible, evidencia y límites](pa-int07-motor-observaciones.md).
Las secciones de diseño conservan los demás casos como candidatos. El corte inicial
descrito a continuación documenta la preparación previa, sin sustituir su evidencia.

**Incremento del22:**085 implementa participantes históricos y sus lecturas
efectivas por audiencia. [Contrato consumible y verificación](pa-int07-participantes.md).
Observaciones y participantes tienen ejecución; cantidades, reversiones y los
demás casos de este documento conservan su estado candidato. La aplicación/cotejo085
en destino no se infiere del Success reportado para084.

**Corte:** 19 de octubre de 2026, America/La_Paz. **Base cotejada:** backend
`8dc8efcd2673142693e23e95a9b0f88723b074ba`, árbol inicialmente limpio, migraciones
001–081 al iniciar. **Estado:** BE01 con P01–P03 confirmadas por Pablo y contratos
técnicos T01/T02/T04 definidos; BE02 comienza por persistencia estructural parcial.
Pablo confirma que el alta de mortandad todavía no está implementada; su frontera
de ejecución/concurrencia permanece pendiente en BE06. En ese corte inicial no
había endpoints ni comandos de corrección implementados. Las rutas siguientes
son candidatas salvo los alcances de observaciones084 y participantes085, descritos en
la actualización superior.

Fuente de alcance: [encargo INT07](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int07.md),
[PA-S04](../../r3foresta-docs/specs/plantacion/participacion-aliada/04-correccion-excepcional/spec.md)
y [contrato D01–D12 §6–8](../../r3foresta-docs/specs/plantacion/participacion-aliada/contrato-identidad-permisos-backend-propuesta.md).
Se conservan los acuerdos humanos del 12 de octubre; no se someten otra vez a
elección las autoridades, ACTIVA, ausencia de cascada, conservación de originales
ni la separación entre consumo M3 y entrega/devolución M2.

**Confirmación humana del 19 de octubre:** retirar lectura propia por participación
corregida errónea salvo autoría u otra relación válida (P01); admitir participantes
históricos con cuenta inactiva sin reactivación/permisos (P02); ficha pública mínima
del revertido y enlace al vigente cuando sea duplicado, fotos privadas conservadas,
actor/motivo/historia detallada solo en lecturas privadas autorizadas (P03).
Esta aceptación no aprueba en bloque las implementaciones ni acredita SQL aplicado.

## 1. Resultado del cotejo

| Superficie | Definición vigente / evidencia | Trabajo que debe cubrir INT07 |
|---|---|---|
| Original inicial y reposición | [030](../migrations/030_m3_registro_plantacion.sql): cantidad positiva, responsable, fecha/GPS, detalle por asignación; reposición es otro registro con origen, no un evento de baja. | Conservar originales y cantidades positivas. Estado lógico y cantidad efectiva separados. |
| Revisión | [074](../migrations/074_pa_int03a_cargas.sql) añade `revision_registro`; [075](../migrations/075_pa_int03a_registro.sql) inserta `0`. Reposición077 no incrementa la revisión del origen. | Definir e incrementar revisiones de registro, evento y grupo cuando cambia su estado pertinente. |
| Personas | Coresponsables030 y snapshots074; UNIQUE registro/persona, sin vigencia de corrección. | Altas/retiros/restauraciones sin DELETE de originales o snapshots. |
| Baja | [031](../migrations/031_m3_evento_plantacion.sql): `MORTANDAD_REPORTADA`, delta positivo y registro requerido; no tiene revisión/estado lógico. | Compensación separada, nunca delta negativo en el original. |
| Consumo | Detalle030 y `cantidad_consumida` de asignación; no existe ledger de correcciones. [024](../migrations/024_vivero_asignacion_subcampania.sql) deriva saldo/estado de asignación. | Líneas de consumo y liberación por asignación trazables, incluida compensación parcial sucesiva. |
| Contadores | Grupo030 y subcampaña029 tienen saldos generados; inicial075 y reposición077 incrementan contadores explícitamente. Los comentarios sobre futuros triggers no acreditan su existencia. | Una única actualización del efectivo; cotejar triggers reales para impedir doble suma. El saldo generado del original deja de ser el saldo efectivo del grupo. |
| Motor común | [068](../migrations/068_pa_participacion_comando.sql), ejecución/recuperación072 y replay final075. [DTO](../src/participacion/dto/comandos.dto.ts), [canonicalizador](../src/participacion/comando-canonical.ts), [recibo](../src/participacion/comando-recibo.ts). | Ampliar CHECK de operación, asociación de objeto/resultado, recuperación y validadores juntos. El fallback actual a resultado ACCESO no admite nuevas operaciones. |
| Audiencias | Detalle propio final081 exige responsable/coresponsable; observaciones solo al autor. Selector075 exige cuenta activa y capacidad operativa. | Contexto administrativo y búsqueda histórica propios; ninguno se resuelve abriendo detalle ajeno o mediante casts del selector. |

### Escritores y redefiniciones que se deben conservar

| Operación | Secuencia SQL; última definición | Disciplina / límite verificado en código |
|---|---|---|
| Inicial v1 | `pa_registro_inicial_ejecutar`, 075 | Cuenta/organizaciones → subcampaña → comando → permisos → asignaciones. LIFO por timestamp/ID, locks por ID ASC. Consume PLANTACION_INICIAL; sin débito M2. |
| Registro interno/reposición | `fn_m3_registrar_plantacion`, 034 → 053 → 061 → 077 | Inicial legada rechazada; reposición real bloquea ámbito y origen, después asignaciones. Mantiene facultad interna y estados de mantenimiento propios, distintos de la corrección contextual ACTIVA. |
| Asignación física | 052 → 060 → 076 → 077 | Campaña → subcampaña → asignaciones → lote; entrega operativa DATE desde076. |
| Devolución física | 054 → 077 | Misma exclusión de ámbito; solo devuelve saldo físico disponible. |
| Revisión de plan | 062 → 077 | Especies protegidas por existencia histórica de registro/detalle y stock. |
| Cancelación individual | 047 → 054 → 057 → 077 | Actualmente comprueba `total_plantado_inicial`; debe conservar barrera por historia al introducir efectivo cero. |
| Desactivación masiva | 057 → 077 | Campaña/hijas/asignaciones/lotes ordenados globalmente; misma barrera histórica. |
| Cierre, equipo, edición/polígono | 078 | Cierre no se deriva del avance; no introducir reapertura ni ampliar autoridad. |
| Merma M2 | 055 | Merma física del lote; no es corrección del consumo asignado ni escritor de mortandad M3. |

**Frontera de baja:** Pablo confirma expresamente el 19 de octubre que el alta de
mortandad todavía no está implementada. La búsqueda en controllers/services y migraciones
001–081 no localiza escritor operativo de alta de mortandad ni trigger de sus
contadores, consistente con esa confirmación. [El e2e físico](../test/e2e/db/plantacion_fisica.e2e-spec.ts) hace un
UPDATE denominado «mortandad simulada»; [el fixture INT05](../test/db/pa-int05-fixture.sql)
siembra acumulados/eventos. Ninguno acredita ese flujo ni carreras contra él.
El cotejo ampliado tampoco encuentra ese alta en fuentes PWA, jobs/scripts o
SQL fuera de migraciones, incluidas copias de `r3foresta-docs`. La tabla de mortandad
del plan frontend M3 aún enumera sus endpoints como «a pedir». El escritor y
trigger de `pa-int07-catalogo-test.py` son sintéticos y tampoco acreditan ese flujo.
BE06 necesita definir y verificar la frontera acotada de ese escritor y cotejar el
catálogo destino antes de acreditar sus carreras. La confirmación de ausencia del
flujo no acredita el catálogo/triggers remotos ni protege un eventual SQL directo.
Su autoridad de alta es independiente de la de corrección: RN-PLA-27 exige ADMIN
global o OPERARIO/COORDINADOR del equipo, con sus reglas de evidencia/GPS propias.
La persistencia parcial BE02 no instala ni sustituye ese alta. No se crea
un módulo completo de mantenimiento ni se habilita alta de baja por ser corrector.

El [cotejo de catálogo](../scripts/qa/pa-int07-catalogo.sql) es de solo lectura y
no lee filas de negocio. Registra firmas/huellas, triggers, estructura y privilegios;
no demuestra por sí solo que todos los escritores externos sigan los locks.
No se ha consultado Supabase ni otro destino remoto en este corte.

Reproducir la comprobación de la utilidad sin servicios externos:

```sh
python3 scripts/qa/pa-int07-catalogo-test.py --pg-bin /ruta/postgresql/bin
```

El runner crea y elimina exclusivamente su clúster temporal, no carga `.env`,
no abre TCP y no requiere PostGIS. Para obtener el catálogo de un destino, ejecutar
el SQL con `psql -X -qAt -v ON_ERROR_STOP=1 --file scripts/qa/pa-int07-catalogo.sql`
únicamente desde una sesión privada cuyo destino ya se haya identificado.
El script no identifica proyecto/base; registrar esa procedencia por separado.

### Consumidores que deben cambiar juntos en BE07

| Consumidor | Evidencia actual | Contrato de integración |
|---|---|---|
| Público global/campaña/subcampaña, lista, mapa, especies/personas y seguimiento | [081, `pa_i_registro` y `pa_impacto_leer`](../migrations/081_pa_int05_consulta.sql) suman originales/detalles/acumulados raw. | Un único conjunto de hechos efectivos, agregado antes de unir personas/organizaciones. Reversión no es plantación negativa ni nueva contribución. |
| Mis registros/detalle propio | `pa_mis_registros_leer` / `pa_registro_detalle_propio_leer`, últimas en081 | Autoría conservada; participación según la decisión P01. No inferir permiso de corrección. |
| Aliases públicos y organizaciones | [ImpactService](../src/impact/impact.service.ts), `loadPlantings`, seguimiento y composición por especie | También leen tablas/contadores directamente; adaptar solo081 deja dos resultados incompatibles. |
| Bytes de fotos públicas nuevas/legadas | [079, `pa_foto_publica` / `pa_d_foto_legada_publica`](../migrations/079_pa_int02d_evidencias.sql) | Misma elegibilidad efectiva en listado y descarga. Nunca borrar cargas/evidencias originales. P03 define publicación del revertido. |
| Reposición y contexto interno | 077: pendiente = muerta − repuesta del origen | Leer acumulados efectivos y origen vigente; preservar estados/autoridad interna. |
| Plan, cancelación/desactivación y cierre | 077/078 | Mantener barreras históricas aunque total efectivo sea cero; no habilitar nuevas transiciones o retirada de especies por ocultación. |
| Actividad y métricas internas | [campanias-activity](../src/campanias/application/campanias-activity.service.ts), [campanias-metrics](../src/campanias/application/campanias-metrics.service.ts), [subcampanias-consultas](../src/subcampanias/application/subcampanias-consultas.service.ts) | Cantidades operativas efectivas. `eventos_count` mantiene significado de historia conservada; no renombrarlo implícitamente a hechos efectivos. |
| Stock M3 | [vivero-asignaciones](../src/lotes-vivero/application/vivero-asignaciones.service.ts), saldo de asignaciones | Mantener fórmula asignado − consumido − devuelto − mermado; sin editar entrega/devuelto/mermado o lote para compensar consumo. |

## 2. Matriz de casos y dependencias

Actor siempre de JWT/cuenta activa, con autoridad revalidada bajo lock. Todas las
escrituras PA-S04 exigen subcampaña ACTIVA, incluso ADMIN global. Lectura de
contexto no reserva revisión, autoridad ni saldo. Objetos ajenos/no visibles
responden uniformemente `RECURSO_NO_VISIBLE`.

| Caso / autoridad acordada | Objeto y condiciones | Efecto atómico propuesto |
|---|---|---|
| Observaciones / ADMIN global | Registro vigente; solo ese campo, motivo obligatorio. | Original inmutable; overlay de observaciones y antes/después, revisión, historial y recibo. Cero variación de cantidades/stock. |
| Participantes / ADMIN global o administrador de esa subcampaña | Registro vigente; personas registradas, incluso con cuenta inactiva, sin exigir permiso operativo actual. Responsable excluido del conjunto editable. Bajas/reposiciones no bloquean este caso. | Set completo antes/después y auditoría administrativa; retirar participación errónea retira lectura propia salvo autoría/otra relación válida. Restaurar la relación recupera lectura para cuenta activa. Cantidades, responsable, actividad de cuenta y permisos intactos. |
| Cantidades / las mismas autoridades | Solo inicial; especies idénticas y positivas. Ninguna baja/reposición histórica, incluidas las revertidas: no esconder dependencias para eludir el límite. | Solo diferencias por especie. Aumento consume saldo elegible; reducción exige confirmar error y disponibilidad física. Revisión de registro/grupo, efectivo y saldo juntos. |
| Duplicado / las mismas autoridades | Inicial vigente y referencia distinta vigente; revisiones de ambos. Compatibilidad definida abajo. Sin dependencias históricas incompatibles. | Revertir solo duplicado; compensar su consumo pendiente una vez; vínculo inmutable al registro que permanece. |
| Trabajo no ocurrido / las mismas autoridades | Inicial vigente; sin bajas/reposiciones históricas ni referencias entrantes que lo mantengan como registro válido de otro duplicado. | Reversión lógica, efectivo cero fuera del original positivo y compensación exacta pendiente. |
| Baja errónea / las mismas autoridades | Evento MORTANDAD_REPORTADA vigente, grupo inicial vigente, revisión del evento y del grupo. | Reducir solo mortalidad efectiva. Sin liberar stock de asignaciones. Rechazar si queda mortalidad menor que reposición efectiva, saldo vivo inválido o dependencia no conciliada. |
| Reposición errónea / las mismas autoridades | Registro de reposición vigente, origen/grupo vigente, revisiones de ambos y consumo conciliado REPOSICION. | Retirar aporte efectivo y compensar consumo de REPOSICION. Rechazar si deja saldo vivo negativo o hay dependencia incompatible; nunca trasladar consumo al propósito inicial. |

Fecha/GPS, especies/responsable, otros textos, reapertura y cascada siguen fuera
del mecanismo. La comunicación de un caso no soportado no cambia datos.

**Compatibilidad de duplicado, decisión técnica T02:** ambos son iniciales de la misma
subcampaña, fecha de trabajo y conjunto de especies, con cantidades efectivas
iguales por especie; el ejecutor declara en el motivo que representan el mismo
trabajo. No se deduce duplicidad por GPS/personas/contenido ni se exige su
igualdad. Cada registro conserva su responsable/evidencias. Sin cadenas: rechazar
referencia revertida, referencia que a su vez sea duplicado o reversión del registro
que ya sostiene referencias entrantes. El duplicado no tiene bajas/reposiciones
históricas; el registro que permanece puede conservarlas y sostener referencias de
otros duplicados ya revertidos. Esos hechos no se alteran y sus revisiones se validan.
Diferencias de fecha/cantidad/especie se
derivan al canal humano hasta acordar tratamiento; no se normalizan silenciosamente.
Es la delimitación conservadora para BE05, definida y revisada técnicamente; no
amplía a correcciones de fecha/especie ni equivale a aprobación humana de un
duplicado concreto. Tras A→B, corregir B mantiene el vínculo histórico; no exige
igualdad permanente con el original A. B no puede revertirse mientras sostenga A.

## 3. Representación y compensación propuestas

Reutilizar `revision_registro`; añadir versión estable de evento y de grupo, sin
derivarlas de `max(id)`. Toda mutación de cantidad, mortalidad o reposición del
grupo incrementa su revisión una vez; una corrección de participante/observación
solo incrementa la del registro. Reposición existente debe participar en la
versión del grupo. SIN_CAMBIOS no aumenta ninguna versión ni fabrica historial.

Persistencia candidata aditiva, sin modificar SQL aplicado:

- `registro_plantacion_correccion`: objeto exacto (registro o evento), caso,
  comando/actor, ámbito, motivo, antes/después, revisiones y referencia del
  duplicado. FK al comando y al objeto, UNIQUE del ID interno del comando e índice
  no único por objeto; permite correcciones sucesivas. Historial append-only y sin DELETE.
- Estado efectivo por registro/evento, único por original, con `VIGENTE` o
  `REVERTIDO`, revisión estable y referencia a última corrección. Original,
  snapshots y recibo original nunca se sobrescriben. Cantidad efectiva cero
  solo en la representación de reversión, nunca en el original con CHECK positivo.
- Líneas de efecto por asignación/especie/propósito: consumo positivo o liberación,
  enlazadas a corrección y a la línea de consumo de origen. Las líneas originales
  de detalle son la base; una liberación no puede superar su pendiente efectivo.
  Conciliar el pendiente del objeto por línea y `cantidad_consumida` contra la
  suma neta de TODOS los registros consumidores de cada asignación, antes y después.
- Participación efectiva separada de filas originales: transiciones por persona,
  con snapshot de incorporación y procedencia `ORIGINAL`, `ALTA_CORRECCION` o
  `RESTAURACION`. Restaurar reutiliza su snapshot histórico; una incorporación
  nueva no inventa afiliación de la fecha del hecho.
- Proyección común de grupo: inicial efectiva + reposiciones efectivas − bajas
  efectivas. Grupo original conserva su cantidad original; adaptar consumidores
  del saldo generado original, que ya no representa ese efectivo tras corrección.

**Aumento:** misma especie y propósito PLANTACION_INICIAL, misma subcampaña,
asignación habilitada y disponible, fecha de entrega operativa conciliada no
posterior a la plantación original. No exigir la ventana de diez días de un
registro nuevo a una corrección histórica ni alterar fecha/GPS. Reparto LIFO
`fecha_asignacion DESC,id DESC`; locks globales por ID ASC. Si algún candidato
carece de día conciliado o el consumo heredado no concilia, rechazar
`CONTEXTO_INCOMPLETO`, sin inventar trazabilidad. No redistribuir consumo anterior.

**Liberación parcial, decisión técnica T01:** por especie, liberar primero créditos
adicionales de correcciones por `revision_nueva DESC`, y dentro de cada una por
`asignacion_id ASC` y clave estable del crédito. Después liberar créditos originales
por `asignacion_id ASC`, con `detalle_id ASC` solo como desempate. De cada crédito
tomar `min(reduccion_pendiente,credito_pendiente)` y enlazar el débito con ese crédito
exacto. Es una prioridad nueva y determinista; los IDs no se interpretan como
cronología ni reconstruyen el reparto histórico. No hace falta inventar orden
pasado o fecha operativa para liberar consumo conocido y conciliado; la fecha
de entrega operativa se exige a consumos nuevos del aumento.

Solo liberar pendiente de la misma asignación. El esquema024 tiene ACTIVA,
AGOTADA y DEVUELTA; no hay estado administrativo de inactivación independiente.
Liberación admite ACTIVA/AGOTADA coherentes con sus contadores; DEVUELTA con
crédito pendiente es inconsistencia. El trigger024 puede devolver AGOTADA a
ACTIVA por el nuevo saldo. Si el destino tiene otros estados o inactivaciones,
cotejar su significado antes de admitirlos. Una devolución parcial real permanece
intacta y se revalida bajo lock. Reversión total compensa todas las líneas pendientes.

Conciliación obligatoria antes/después:

```text
pendiente_credito = cantidad_credito - SUM(liberaciones_al_credito) >= 0
efectivo_objeto_especie = SUM(pendientes_de_sus_creditos)
consumido_asignacion = SUM(detalles_originales_de_TODOS_los_registros)
                    + SUM(consumos_adicionales) - SUM(liberaciones)
```

La suma de originales incluye revertidos: filtrarlos y restar también sus
compensaciones descontaría dos veces. Inconsistencia de origen/especie/propósito
o contadores → `CONTEXTO_INCOMPLETO`, sin efectos. No modificar asignado, devuelto,
mermado ni lote. Esta política fue revisada técnicamente para INT07; no se atribuye
a la aceptación previa de D07. No se mezclan en un mismo comando aumentos
y reducciones sin calcular/validar todos los deltas por especie previamente.
Si hay cualquier reducción, ambas confirmaciones deben ser verdaderas.

Ejemplo por asignación: A entrega10, B entrega10; inicial12 consume B10+A2.
Aumento a15 consume A3 (pendientes B10+A5). Reducción a11 libera primero A3,
después A1 del original (B10+A1). Reversión posterior libera exactamente B10+A1,
no las12 originales ni las15 máximas. Disponible final20; ninguna devolución M2.
Debe probarse también con devolución/inactivación concurrente y con registro
legado de reparto distinto.

## 4. Contratos candidatos de lectura y ejecución

Solo `getAdminClient()` y guard verificado para privados. Respuestas privadas
`Cache-Control: private, no-store`, `Vary: Authorization`; público `no-store` sin
exigir cuenta. IDs/revisiones BIGINT son cadenas canónicas; UUID v4 minúscula.
DTO cerrado: campos extra →422, cantidades INT positivas, conjuntos únicos
ordenados numéricamente, textos NFC/trim. Motivo 3–1000 caracteres; observaciones
null o máximo2000. La longitud de motivo es una decisión técnica propuesta.

| Método / ruta propuesta | Entrada / contenido mínimo |
|---|---|
| GET `/api/v1/plantaciones/:id/contexto-correccion` | Objeto exacto, tipo real, ámbito/estado, revisiones, original/efectivo, dependencias y capacidades por caso. Solo ADMIN global/administrador de ese ámbito; observaciones solo al ADMIN global. Sin perfiles/contactos/credenciales ni fotos privadas ajenas. |
| GET `/api/v1/eventos-plantacion/:id/contexto-correccion` | Contexto específico de baja con revisión de evento/grupo; no aceptar tipo del cliente. |
| GET `/api/v1/plantaciones/:id/historial-correcciones` y equivalente de evento | Auditoría de ejecutor autorizado: actor snapshot mínimo, fecha, caso, motivo y antes/después acotados al caso. Observaciones quedan restringidas a ADMIN global. Paginación firmada, limite por defecto20/máximo50. |
| GET `/api/v1/plantaciones/:id/participantes-historicos-seleccionables` | `q` requerido: ID decimal canónico exacto desde1 carácter, o nombre NFC/trim3–100 caracteres (comparación sin distinguir mayúsculas); `limite`20/máximo50 y cursor firmado por actor/registro/modo/consulta normalizada. Sin búsqueda por contacto ni directorio sin filtro. Devuelve solo ID, nombre actual rotulado como tal, actividad y relación histórica mínima. Incluye inactivas conforme a P02; no exige permiso operativo ni muestra afiliación actual como pasada. |
| POST `/api/v1/plantaciones/:id/correcciones/observaciones` | `comando_id, revision_esperada, motivo, observaciones`. Operación `CORREGIR_OBSERVACIONES_PLANTACION`. |
| POST `/api/v1/plantaciones/:id/correcciones/participantes` | `comando_id, revision_esperada, motivo, coresponsable_ids` (set completo0–100, responsable excluido). Operación `CORREGIR_PARTICIPANTES_PLANTACION`. |
| POST `/api/v1/plantaciones/:id/correcciones/cantidad` | `comando_id, revision_esperada, revision_grupo_esperada, motivo, especies, confirmacion_error_registro, confirmacion_disponibilidad_fisica`. Operación `CORREGIR_CANTIDAD_PLANTACION`. Especies1–100, mismo conjunto; ambas confirmaciones booleanas requeridas y true si reduce. |
| POST `/api/v1/plantaciones/:id/reversiones` | Unión cerrada de `causa: REGISTRO_ERRONEO` y `causa: DUPLICADO`, más `comando_id, revision_esperada, revision_grupo_esperada, motivo`. Duplicado exige `registro_vigente_id, revision_vigente_esperada, revision_grupo_vigente_esperada`; reposición exige `revision_origen_esperada` y no admite causa DUPLICADO. |
| POST `/api/v1/eventos-plantacion/:id/reversiones` | `comando_id, revision_esperada, revision_grupo_esperada, motivo`. Operación `REVERTIR_BAJA_PLANTACION`; servidor exige MORTANDAD_REPORTADA. |
| GET `/api/v1/participacion/comandos/:comando_id?operacion=...` | Recuperación existente ampliada con las operaciones nuevas. Solo actor original activo; no recibos ajenos por autoridad administrativa. |

La reversión de registros usa una operación común
`REVERTIR_REGISTRO_PLANTACION`; el tipo real inicial/reposición y las revisiones
requeridas se derivan del objeto en servidor. La ruta no recibe operación ni RPC.
La unión se valida primero como forma estricta y después contra el tipo real;
campos válidos para otro tipo producen rechazo durable `CASO_NO_SOPORTADO`.
Orden obligatorio: parsear forma → canonicalizar sin consulta de dominio → replay
terminal → validar tipo real/objeto/autoridad/revisiones para nueva ejecución.
No se requiere un contexto actual para reconstruir una intención antigua.
La referencia a origen es derivada, no enviada por cliente. Ningún endpoint de
corrección recibe asignaciones, actor, rol, estado efectivo o saldo como autoridad.

La intención canónica incluye ID del objeto de la ruta, todas las revisiones,
campos normalizados específicos, motivo y confirmaciones. ID de comando no forma
parte del payload; tipo real/ámbito/origen derivados tampoco forman parte de sus
bytes. Mantener `PA-COMANDO/1`, bytes anteriores intactos y operación
fija por ruta. SQL vuelve a validar el contenido/huella; no basta el parser TS.

### Resultado mínimo y recuperación

Resultado candidato de registro, todos required:
`{tipo:"CORRECCION_PLANTACION",correccion_id:Id|null,registro_plantacion_id:Id,
subcampania_id:Id,caso,revision_anterior,revision_nueva,revision_grupo_anterior,
revision_grupo_nueva,cambio:"CAMBIO_APLICADO"|"SIN_CAMBIOS",estado_logico,
registro_vigente_id:Id|null}`. Baja usa `tipo:"CORRECCION_BAJA_PLANTACION"`,
`evento_plantacion_id` y `registro_plantacion_id` de grupo; no referencia de duplicado.
Las revisiones de grupo no cambian para observaciones/participantes.
SIN_CAMBIOS lleva `correccion_id:null`, versiones iguales y ningún historial nuevo;
solo después de autoridad, ACTIVA, revisión y reglas vigentes. Nueva reversión
de un objeto revertido rechaza; replay de la original devuelve su éxito.

No guardar motivo, observaciones, perfiles, participantes, fotos, asignaciones o
saldos en el recibo. El recibo original inicial sigue mostrando lo confirmado
entonces, aunque otra operación cambie el efectivo después. Terminal propio
se recupera antes de exigir autoridad de nueva escritura; retirarla no altera
el recibo ni concede acceso al contexto/historial. Cuenta inactiva sigue sin login.

POST confirmado200 y replay idéntico; rechazo usa HTTP terminal almacenado;
GET terminal200. PREPARADO202 con `SIN_RESULTADO` y `Retry-After:2`; 404 propio
`COMANDO_NO_CONFIRMADO` inconcluso conserva misma clave/contenido. Correcciones
sin fotos no necesitan crear preparaciones ni un segundo motor. Timeout503 y
error inesperado permanecen inconclusos, nunca rechazo durable inventado.

| HTTP / error | Semántica candidata |
|---|---|
| 403 `CAPACIDAD_INSUFICIENTE` | Nueva ejecución visible sin facultad; terminal durable si llegó al wrapper válido. |
| 404 `RECURSO_NO_VISIBLE` | Inexistente/ajeno uniforme, sin filtrar información de otro ámbito. |
| 409 `REVISION_OBSOLETA`, `SUBCAMPANIA_NO_OPERATIVA`, `STOCK_INSUFICIENTE` | Rechazo durable reutilizando contrato existente. |
| 409 `DEPENDENCIAS_INCOMPATIBLES`, `OBJETO_YA_REVERTIDO`, `REFERENCIA_DUPLICADO_INCOMPATIBLE`, `CONSUMO_NO_REVERSIBLE` | Rechazo durable sin efectos parciales; nueva confirmación tras revisar contexto. |
| 422 `CASO_NO_SOPORTADO`, `CONTEXTO_INCOMPLETO` | Regla de negocio con DTO válido: durable. Campo desconocido/malformado conserva422 temprano inconcluso `CAMPO_NO_PERMITIDO`/`ENTRADA_INVALIDA`. |
| 409 `COMANDO_REUTILIZADO` | Misma identidad y contenido diferente: fuera del recibo existente; no sobrescribirlo. |
| 503 `RESULTADO_NO_DETERMINADO` | Red/lock/deadlock/commit desconocido; `MISMA_CLAVE`, consultar. |

Mantener envelope `{error:{codigo,mensaje,campos,ambitos,reintento},comando_id,
resultado_concluyente:false}` para errores externos; `RECHAZADO` durable usa el
envelope de recibo con `resultado:null`. No convertir cualquier excepción SQL
en rechazo de negocio. Los [ejemplos candidatos](pa-int07-ejemplos-candidatos.json)
son ilustraciones de diseño; no fixtures HTTP ni evidencia de endpoints reales.

## 5. Audiencias, snapshots y compatibilidad

| Audiencia | Original / efectivo | Historial y privacidad propuestos |
|---|---|---|
| Público | Agregados/mapa/listas solo efectivos; sin duplicar original/corrección. | Ficha mínima del revertido y referencia pública vigente del duplicado. Sin entradas de historia, actor, motivo, fecha de corrección, fotos del revertido, observaciones, contactos, saldos o asignaciones. |
| Autor / participante con lectura propia | Cantidades original/efectiva y referencia original; recibo propio histórico intacto. | Historia reducida de caso/fecha/actor snapshot mínimo; la auditoría detallada queda para el ejecutor. Observaciones actuales solo autor. P01 retira todas estas lecturas cuando ya no conserva relación válida. |
| Ejecutor vigente del caso | Contexto exacto original/efectivo y dependencias/revisiones necesarias. | Motivo/antes-después/actor/fecha y compensaciones acotadas; sin ampliar a perfiles, evidencia privada ajena ni recibos ajenos. Observaciones antes/después solo ADMIN global. |
| Actor recuperando comando | Solo el recibo histórico de su intención. | No se recalcula con el estado actual ni abre contexto privado tras retiro. |

Participante añadido: congelar nombre de la cuenta al corregir, con procedencia
`ALTA_CORRECCION` y fecha de captura; no afirmar que se conocía en el registro
original. Afiliación `HISTORICA_NO_DISPONIBLE` si no existe snapshot de ese hecho;
no copiar perfil actual ni solicitar afiliación obligatoria. Restauración conserva
snapshot histórico existente. El historial conserva cada lista anterior/nueva.
P02 admite cuentas históricas inactivas en esa selección: no reactivarlas, no
conceder permiso ni relajar el guard de cuenta activa para acceder a lecturas.

INT05 interpreta sus nombres como snapshots del hecho. Cuando una persona nueva
carece de fuente histórica, v1 conserva `nombre:null`; la nueva proyección debe
expresar nombre capturado al corregir, fecha y procedencia, sin presentarlo como
nombre documentado el día de la plantación. No basta omitir la procedencia para
conservar la forma estricta de v1.

INT05 usa validadores de objetos exactos en backend y PWA. No se agregan campos
de estado/revisión/historia a sus respuestas v1 sin contrato coordinado. T04 conserva
conservar formas actuales con valores efectivos para vigentes y excluir revertidos
de listas/mapa/detalle v1; añadir lectura específica de estado/historia para la PWA
nueva, incluida ficha pública mínima conforme a P03. Rutas/schemas en §5.1.
No devolver cantidad efectiva cero donde el schema exige positiva
ni responder con el original como si siguiera vigente. Aliases numéricos conservan
adaptadores de rango explícitos; BIGINT fuera de rango no se convierte a number.

DTO, `comando-recibo`, catálogos CHECK/recuperación, generador
`scripts/qa/pa-int02c-openapi.cjs`, artefactos generados y validadores PWA se
amplían juntos al implementar, nunca con un cast para omitir campos. Este corte
mantiene el OpenAPI real sin rutas candidatas.

### 5.1. Lecturas separadas de estado e historial, decisión técnica T04

Las rutas existentes de detalle público/propio devuelven404 uniforme para un
revertido; su estado se resuelve en las lecturas nuevas siguientes. INT05 conserva
su forma y valores efectivos para vigentes, excluye revertidos de listas/mapa y
eventos revertidos del seguimiento. La lista de estados propia permite localizar
revertidos sin presentarlos como plantaciones efectivas. Todas las descargas y
aliases públicos de fotos de revertidos devuelven404, sin borrar evidencia ni
conceder acceso a sus originales privados por ser administrador.

| Ruta nueva bajo `/api/v1` | Audiencia / contenido |
|---|---|
| GET `/impact/registros/:id/estado` | Pública sin capacidades/sesión: `Lectura<EstadoRegistroPublico>`. Ámbito no público/inexistente →404 uniforme. |
| GET `/plantaciones/mis-registros/estado` | Cuenta activa: `Pagina<EstadoRegistroPropio>` de vigentes/revertidos con autoría o participación efectiva. |
| GET `/plantaciones/:id/estado-propio` | Misma relación efectiva: `Lectura<EstadoRegistroPropio>`. P01 también aplica al revertido. |
| GET `/plantaciones/:id/historial-propio` | Misma relación: `Pagina<HistoriaPropia>` reducida, sin antes/después detallado. |
| GET `/eventos-plantacion/:id/estado-propio` | Relación efectiva con el grupo inicial: `Lectura<EstadoBajaPropia>`. |
| GET `/eventos-plantacion/:id/historial-propio` | Misma relación con grupo: `Pagina<HistoriaPropia>` del evento exacto. |
| GET `/plantaciones/:id/historial-correcciones` | Ejecutor vigente: `Pagina<HistoriaEjecutorRegistro>`. No se confunde con historial propio. |
| GET `/eventos-plantacion/:id/historial-correcciones` | Ejecutor vigente en el ámbito del grupo: `Pagina<HistoriaEjecutorBaja>`. |

Contrato técnico para implementar, aún sin publicación en el OpenAPI runtime:
todos los objetos cerrados, todos los campos required salvo la query opcional.
`Id`/`Revision` son cadenas canónicas D01; `Instant` es timestamp UTC.

```ts
type Lectura<T> = { data: T; observado_en: Instant };
type Pagina<T> = { data: T[]; observado_en: Instant; siguiente_cursor: string | null };
type EspecieCantidad = { planta_id: Id; cantidad: number };
type EstadoRegistroPublico = {
  registro_plantacion_id: Id;
  estado_logico: 'VIGENTE' | 'REVERTIDO';
  tiene_correcciones: boolean;
  url_detalle_efectivo: string | null;
  registro_vigente: { registro_plantacion_id: Id; url_publica: string } | null;
};
type EstadoRegistroPropio = {
  registro_plantacion_id: Id; codigo_trazabilidad: string; subcampania_id: Id;
  es_reposicion: boolean; registro_plantacion_origen_id: Id | null;
  estado_logico: 'VIGENTE' | 'REVERTIDO'; tiene_correcciones: boolean;
  revision_registro: Revision; revision_grupo: Revision;
  relaciones: ('AUTOR' | 'PARTICIPANTE')[];
  cantidad_original: number; cantidad_efectiva: number;
  especies_originales: EspecieCantidad[]; especies_efectivas: EspecieCantidad[];
  participantes: ParticipanteSnapshotCorreccion[];
  registro_vigente_id: Id | null; url_detalle_efectivo: string | null;
};
type ParticipanteSnapshotCorreccion = ParticipanteSnapshot & {
  procedencia: 'ORIGINAL' | 'ALTA_CORRECCION' | 'RESTAURACION';
  capturado_en: Instant | null;
  nombre_capturado_correccion: string | null;
};
type EstadoBajaPropia = {
  evento_plantacion_id: Id; registro_plantacion_id: Id; subcampania_id: Id;
  estado_logico: 'VIGENTE' | 'REVERTIDO';
  revision_evento: Revision; revision_grupo: Revision;
  cantidad_muerta_original: number; cantidad_muerta_efectiva: number;
};
type CasoCorreccion = 'OBSERVACIONES' | 'PARTICIPANTES' | 'CANTIDAD' |
  'DUPLICADO' | 'REGISTRO_ERRONEO' | 'REPOSICION_ERRONEA' | 'BAJA_ERRONEA';
type HistoriaPropia = {
  correccion_id: Id; caso: CasoCorreccion;
  actor: { usuario_id: Id; nombre_snapshot: string | null }; fecha: Instant;
  revision_anterior: Revision; revision_nueva: Revision;
};
type EfectoConsumo = {
  asignacion_id: Id; planta_id: Id;
  proposito: 'PLANTACION_INICIAL' | 'REPOSICION'; delta_consumo: number;
};
type ValoresRegistro =
  | { caso: 'OBSERVACIONES'; observaciones_visibles: boolean;
      antes: { observaciones: string | null }; despues: { observaciones: string | null } }
  | { caso: 'PARTICIPANTES';
      antes: { participantes: ParticipanteSnapshotCorreccion[] };
      despues: { participantes: ParticipanteSnapshotCorreccion[] } }
  | { caso: 'CANTIDAD';
      antes: { especies: EspecieCantidad[] }; despues: { especies: EspecieCantidad[] } }
  | { caso: 'DUPLICADO' | 'REGISTRO_ERRONEO' | 'REPOSICION_ERRONEA';
      antes: { estado_logico: 'VIGENTE'; especies: EspecieCantidad[] };
      despues: { estado_logico: 'REVERTIDO'; especies: EspecieCantidad[];
        registro_vigente_id: Id | null } };
type HistoriaEjecutorBase = {
  correccion_id: Id; actor: { usuario_id: Id; nombre_snapshot: string | null };
  fecha: Instant; revision_anterior: Revision; revision_nueva: Revision;
  revision_grupo_anterior: Revision; revision_grupo_nueva: Revision;
  motivo: string | null;
};
type HistoriaEjecutorRegistro = HistoriaEjecutorBase & ValoresRegistro & {
  efectos_consumo: EfectoConsumo[];
};
type HistoriaEjecutorBaja = HistoriaEjecutorBase & {
  caso: 'BAJA_ERRONEA';
  antes: { estado_logico: 'VIGENTE'; cantidad_muerta_efectiva: number };
  despues: { estado_logico: 'REVERTIDO'; cantidad_muerta_efectiva: 0 };
};
```

`url_detalle_efectivo` solo existe para VIGENTE y conserva el enlace público o
privado de su audiencia; para REVERTIDO es null. En público `registro_vigente`
solo se entrega para DUPLICADO si la referencia sigue públicamente elegible; de
lo contrario null, sin filtrar ID de ámbito oculto. No hay causa/actor/motivo,
fechas/revisiones de corrección, cantidades anteriores o fotos en esa ficha.

Originales INT positivos; efectivos positivos en VIGENTE y cero en REVERTIDO.
Las especies efectivas conservan el conjunto con cantidades cero al revertir;
su suma coincide con cantidad efectiva. `relaciones` es única y no vacía;
orden AUTOR, PARTICIPANTE. En baja solo caso BAJA_ERRONEA en su historia; historia
de registro excluye ese caso. `delta_consumo` es INT no cero; nunca se publica.

`ParticipanteSnapshot` mantiene intacto el schema actual de INT05, incluidos sus
IDs y snapshots históricos. El nuevo `ParticipanteSnapshotCorreccion` solo aparece
en las nuevas proyecciones de estado propio/contexto/auditoría. Así la persona
añadida y los demás lectores propios autorizados pueden ver el nombre capturado
al corregir, su fecha y procedencia, sin confundirlo con el del día del hecho.
`nombre_snapshot` histórico permanece null si se desconoce; el nombre capturado
ahora va en `nombre_capturado_correccion`, nunca como backfill histórico de v1.
La lista propia contiene solo participantes efectivos y al responsable conservado;
las listas anteriores completas quedan en la auditoría administrativa. No copiar
afiliación actual. Actor privado incluye ID estable para identificar al corrector
aunque su nombre histórico sea null, sin abrir su perfil o contactos.
En auditoría de OBSERVACIONES el administrador contextual recibe
`observaciones_visibles:false`, ambos textos null y motivo null: el motivo libre
también podría repetir ese texto restringido. ADMIN global los ve conforme al
caso; otros casos de auditoría tienen motivo string. La historia propia solo
resume caso/actor/fecha/revisión y no abre la auditoría detallada.

Queries de historia/estado propio paginado: `{cursor?,limite?}` cerrada, default20,
máximo50. Historia ordenada por corrección ID DESC, lista de estados por registro
ID DESC; cursor firmado por actor/auth, audiencia, objeto/filtros y última clave
entregada, sin snapshot de autoridad. Revalidar relación efectiva en cada página.
Contexto/historial del ejecutor puede leerse tras cierre con autoridad vigente;
las capacidades de escribir siguen falsas fuera de ACTIVA. SIN_CAMBIOS no crea
entradas de historia. Ninguna de estas lecturas recupera recibos de otro actor.

## 6. Transacción, catálogo y comprobaciones pendientes

Replay terminal propio rápido → cuentas/organizaciones implicadas ordenadas →
campaña solo si se usa → subcampañas ordenadas → comando → permisos/revisiones →
registros/eventos/grupos por ID → asignaciones por ID → efectos/historial/terminal.
Resolver ámbitos/origen/referencia en servidor y releer tras lock. Para localizar
cuentas necesarias antes de ámbito se permite lectura previa, revalidada después;
no descubrir otra cuenta y bloquearla al final. No tocar lotes M2 por corregir consumo.
Validación y todos los efectos viven en la misma RPC; negocio conocido revierte
subtransacción antes de fijar rechazo, infraestructura revierte todo.

El primer número libre al iniciar fue082; se incorporó
[082, persistencia parcial](../migrations/082_pa_int07_persistencia.sql), ensayada
solo en PostgreSQL aislado. Antes de las siguientes migraciones, volver a cotejar
numeración y catálogo. Siguen pendientes operaciones/recuperación del motor,
escritores/versiones y lecturas/consumidores; se conservan001–081. Enum adicional, si fuera necesario,
debe confirmar antes de usarlo. Tablas nuevas con RLS sin políticas públicas;
funciones/overloads/helpers privados, grants mínimos de servicio. Verificar
permisos efectivos de PUBLIC/anon/authenticated y columnas/vistas/secuencias;
un REVOKE directo no excluye membresías heredadas. No cerrar superficies ajenas
como reparación implícita de un drift.

Matriz de comprobación al implementar: CA01–18/participantes y PA-Q08–11; saldos
por asignación antes/después; repetición y correcciones sucesivas; especie/revisión
inválida y rechazo sin efectos; ambos órdenes contra retiro/rol/inactivación,
cierre, devolución, plan, nueva reposición y escritor real de baja. Agregar carrera
duplicado/referencia revertida y guardas históricas cuando el efectivo llega a cero.
Verificar privacidad de payload y bytes de foto, todas las consultas/aliases,
conservación del recibo original y rollback ante fallo parcial. SQL/PostGIS aislado,
no un UPDATE fixture como sustituto del escritor real. BE08 concentra evidencia
integrada; un caso aislado o este inventario no cierran BE02–BE08.

## 7. Decisiones y salida de BE01

| ID | Tipo / estado | Propuesta concreta y trabajo dependiente |
|---|---|---|
| P01 | Producto, confirmada por Pablo el19 | Retirar acceso propio por participación corregida errónea, conservando autoría/otra participación válida y auditoría administrativa. Aplicar en todas las páginas/detalles/historias propias. |
| P02 | Producto, confirmada por Pablo el19 | Permitir cuentas registradas hoy inactivas como participantes históricos, sin reactivación ni permisos; el lector/ejecutor sigue requiriendo cuenta activa. |
| P03 | Producto, confirmada por Pablo el19 | Enlace público revertido con ficha mínima y referencia vigente para duplicado; fotos dejan de publicarse y se conservan privadas. Actor/motivo/historia detallada solo en lecturas privadas autorizadas. |
| T01 | Técnica definida y revisada | Prioridad explícita de liberación por crédito/asignación (§3), sin reconstruir orden histórico; conciliación de todos los registros y créditos pendientes. Implementar/probar en BE04. |
| T02 | Delimitación técnica definida y revisada | Duplicado compatible estricto (§2), sin cadenas; conservar dependencias reales del registro vigente y el vínculo tras correcciones posteriores. Implementar/probar en BE05. |
| T03 | Ausencia de alta confirmada por Pablo; ejecución/concurrencia pendientes | Alta de mortandad todavía no implementada. Definir/verificar frontera acotada del escritor y catálogo destino antes de acreditar BE06 o sus carreras; un fixture no la sustituye. |
| T04 | Contrato técnico definido | Lecturas v1 efectivas con formas conservadas y rutas/schemas nuevos separados (§5.1); implementar/coordinar OpenAPI/backend/PWA en BE07. |

La aceptación humana P01–P03 se distingue de las decisiones técnicas T01/T02/T04.
BE01 conserva el faltante técnico T03 visible para el alcance de mortandad; avanza BE02
en persistencia/motor/lecturas de registro y búsqueda histórica, sin acreditar
reversión de baja o carreras frente a un alta todavía no implementada. BE02 tiene
alcance estructural parcial; motor/lecturas/operaciones y BE03–BE08/FE01–FE08
siguen sin implementación acreditada. El cotejo local ampliado y
estos contratos no sustituyen revisión/aplicación del catálogo destino.

Evidencia inicial, con sus pendientes y huellas de aquel corte:
[cotejo y verificación local](evidencia/pa-int07-be01-local.json).
Continuación: [decisiones confirmadas y contrato técnico](evidencia/pa-int07-be01-decisiones.json).
Ninguna acredita correcciones ejecutables, SQL remoto aplicado, push, despliegue o piloto.

## 8. BE02 · persistencia parcial local

[082](../migrations/082_pa_int07_persistencia.sql) añade siete tablas privadas:
revisión estable de grupo, historial de corrección, estados efectivos de registro
y evento, participantes efectivos, créditos de consumo y compensaciones. No
altera tablas/funciones de negocio existentes, sus contadores o recibos, y no
crea filas de backfill: sin overlay se conserva el original. La materialización
futura exige cuentas/ámbito/hechos/asignaciones bloqueados por su ejecutor.

El historial y líneas son append-only; el vínculo comando/actor/operación exige
terminal CONFIRMADO al commit mediante FK/trigger diferidos. 068 continúa
rechazando operaciones de corrección: no hay forma válida de confirmar una
corrección nueva en este corte. Solo SELECT para `service_role`, sin DML,
secuencias o EXECUTE de helpers; PUBLIC/anon/authenticated sin acceso.
Los futuros ejecutores deben habilitar juntos motor, recuperación, catálogos,
DTO/validadores y grants mínimos; no activar un string/RPC aislado.

Las guardas estructurales no equivalen a autorización de caso, conciliación
global de consumo o concurrencia del motor. En particular, el lock de crédito
de la compensación necesitará sus privilegios acotados y pruebas dentro del
ejecutor real. Ninguna prueba estructural de la baja sembrada es alta operativa
ni carrera frente a mortandad. BE02 sigue parcial y BE03–BE08 pendientes.

Reproducir:

```sh
python3 scripts/qa/pa-int07-persistencia-test.py --pg-bin /ruta/postgresql/bin
```

El fixture carga024/030/031/068 reales y columnas074 focales, con datos sintéticos.
No ejecuta075–081, PostGIS, Storage o servicios externos ni acredita replay
completo/catálogo destino. Verifica instalación/repetición, drift, ACL/RLS,
materialización fiel y rechazo de cambios sin historia; conserva originales,
snapshots, saldos, versiones y recibos del antecedente. [Evidencia de este corte](evidencia/pa-int07-be02-persistencia-local.json).

## 9. Cotejo aportado de desarrollo · 20 de octubre de 2026

El catálogo aportado tras la recuperación acotada de 074, en desarrollo
`vyrjlehkhabydkhjxagx` confirmado por Pablo, muestra sus 47 columnas nuevas,
ambas tablas de cargas privadas y las 36 columnas requeridas por 082 con los tipos
esperados. Las tres huellas de 079 se conservan y las nueve definiciones de 077
coinciden con las fuentes actuales, incluidas sus opciones de ejecución.
[Evidencia y límites del cotejo](evidencia/pa-int07-recuperacion-074-079-cotejada-2026-10-20.json).

El siguiente catálogo aportado confirma la recuperación conjunta de 075 y 078:
sus 16 definiciones coinciden con las fuentes y son ejecutables solo por el
servicio entre las audiencias cotejadas. Las demás huellas previas se conservan.
[Evidencia de esta continuación](evidencia/pa-int07-recuperacion-075-078-cotejada-2026-10-20.json).

080 conserva 62 privilegios efectivos incompatibles con su preflight en cinco
objetos fuera del inventario original. El diagnóstico ampliado los atribuye a
grants directos de `postgres` hacia `anon`/`authenticated`, sin membresías ni ACL
por columna. También revela MAINTAIN de PG17 y la precondición incorrecta de
`public.comunidad`: el modelo real usa `division_administrativa`. La reparación
[083](pa-superficie-083-recuperacion.md) conserva 080 como fuente histórica y
ofrece un cierre aditivo compatible con ese catálogo. Crear, editar y
asociar campañas pasa a usar el cliente privado en el backend local, conservando
la autorización ADMIN, antes de conciliar esos permisos. Build, 66 suites/827
unitarios y OpenAPI aprobados. Pablo confirma dos consumidores: backend local
de pruebas y Render de desarrollo, desplegado al hacer push a `main`; publicar
y comprobar ese cambio en Render sigue pendiente.

El [diagnóstico ampliado de 080](../scripts/sql/pa-int07-diagnostico-080.sql),
verificado con 25 comprobaciones PostgreSQL aisladas, reúne origen de grants,
membresías y condiciones de preflight sin revocar permisos ni modificar datos.
[Resultado aportado y límites](evidencia/pa-superficie-083-diagnostico-2026-10-20.json).
081 y 082 siguen ausentes en desarrollo; la persistencia focal de 082 también
pasó 159 comprobaciones en [PostgreSQL 17 aislado](evidencia/pa-int07-be02-persistencia-pg17-local.json).
Estos cortes registran un entorno concreto, sin cambiar las evidencias locales
históricas ni acreditar Storage/CDN, ejecución de RPC, despliegue o correcciones
operativas.

## 10. Desarrollo · 21 de octubre de 2026

El backend `fbf2529` se publicó en `main`, incluidos los commits previos de D e
INT05. Pablo confirmó Render Live y la instancia local actualizada antes de
ejecutar 083 definitiva, 081 y 082 con Success. Los dos catálogos aportados
después permiten cotejar cinco funciones081, las siete tablas082 con sus cuatro
helpers y las ACL enumeradas. La 083 no muestra bloqueos ni grants pendientes;
la vista territorial conserva definición, SELECT y permisos de servicio.
[Cotejo completo, huellas y límites](evidencia/pa-int07-cotejo-desarrollo-completo-2026-10-21.json).

La estructura082 coincide en 63 columnas, 67 restricciones, 23 índices y triggers
propios/RI (estos últimos normalizados por OID). El complemento READ ONLY cerró
las dos salvedades del exportador: 28 comprobaciones MAINTAIN sin privilegios
inesperados y tres secuencias BIGINT con máximo exacto `9223372036854775807`.
Las siete tablas están presentes, sin faltantes. La
[consulta complementaria](../scripts/sql/pa-int07-cotejo-082-complemento.sql),
validada en [PG17 aislado](evidencia/pa-int07-082-complemento-pg17-local.json),
exporta los límites como texto para conservar precisión. El
[cotejo previo](evidencia/pa-int07-cotejo-desarrollo-2026-10-21.json) conserva su
estado histórico antes de recibir este complemento. El cotejo de instalación
queda completo dentro de su alcance; no requiere repetir migraciones.
Aplicación reportada, cotejo de catálogo y ejecución de negocio siguen
siendo hechos distintos: BE02 continúa parcial, sin comandos/API de corrección.
