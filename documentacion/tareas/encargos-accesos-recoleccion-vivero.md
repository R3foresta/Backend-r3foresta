# Encargos de implementación: accesos de Recolección y Vivero

Fecha: 5 de noviembre de 2026. Estado: **tareas preparadas; no implementadas**.
Fuente de diseño: [propuesta elegida](propuesta-permisos-por-vivero.md).
Este archivo divide la ejecución; no crea otro modelo de permisos.
Inspección de referencia: backend `be62df0`. Cada agente debe comprobar el estado
de su checkout y las instrucciones de cada repositorio antes de modificarlo.

## Qué administración ya existe

| Pieza actual | Qué hace | Cómo se reutiliza |
|---|---|---|
| PWA `/app/usuarios`, «Usuarios y permisos» | Selecciona cuentas y cambia su rol global | Extender esta gestión para acceso M1 y viveros, conservando el cambio de rol separado |
| API de usuarios y motor de autoridad | Lista cuentas para ADMIN, lee autoridad y cambia rol/baja con revisión, historial y recuperación | Reutilizar identidad, selección y patrones de comandos; añadir operaciones explícitas de acceso |
| PWA `/app/participacion/accesos` | Gestiona permisos por persona y subcampaña | Conservarla; sus permisos y su DTO de capacidades no son un catálogo general M1/M2 |

Fuentes: [contrato de usuarios](../frontend/modulos/usuarios.md#administración-de-roles-globales),
[pantalla de usuarios](../../../pwa-r3foresta/src/modules/usuarios/pages/GestionUsuariosScreen.tsx),
[listado administrativo](../../src/users/usuarios-administracion.controller.ts),
[comandos existentes](../../src/participacion/participacion-comandos.controller.ts) y
[gestión contextual](../../../pwa-r3foresta/src/modules/participacion/pages/GestionAccesosScreen.tsx).
**Hoy no existe administración de los nuevos accesos M1/M2.** Se amplía la gestión
existente; no se crea un constructor genérico de permisos.

## Reglas de negocio confirmadas

El recolector no confirma su propia recolección, incluso si tiene ambos accesos;
otro operador autorizado del vivero debe hacerlo. El acceso M1 y la autoría no
permiten `DESECHO`: lo realiza el operador del vivero de custodia, o ADMIN, según
estado y saldo. No crear una excepción de autoría ni confundirlo con merma de plantas.

## Secuencia y límites de entrega

| Encargo | Objetivo | Dependencia |
|---|---|---|
| **T1** | Acceso explícito de Recolección y API para administrarlo | Propuesta elegida |
| **T2** | Operación por vivero y API para asignar/retirar establecimientos | Contratos compartidos de T1 |
| **T3** | Administración conjunta en «Usuarios y permisos» y navegación por capacidades | APIs de T1/T2 |
| T4, posterior | Recepción de semillas y validación conjunta | T2 y reglas de negocio confirmadas |
| T5, posterior | Incorporación de plantas externas en vivero | T2 y contrato del plan de incorporación |

Cada encargo incluye su contrato y pruebas. Las APIs administrativas nacen en T1
y T2; T3 añade su experiencia visual, no inventa la autorización.
T1 por sí solo no demuestra «solo M1»: el acceso legado a M2 se cierra con T2.
Hasta T4, validar una ficha no debe presentarse como prueba de recepción física.
Estos incrementos locales no autorizan un corte real parcial ni su despliegue.

## Condiciones comunes para los agentes

- Leer README, arquitectura, AGENTS y [propuesta](propuesta-permisos-por-vivero.md).
  Registrar alcance de rutas y última RPC antes de modificar; conservar cambios
  preexistentes ajenos. Los nombres de tablas propuestos aún requieren contrato técnico.
- Mantener un rol global; no eliminar `VALIDADOR`, crear receptor/encargado ni
  conceder M1/M2 a `VOLUNTARIO`. `ADMIN` tiene acceso derivado; no necesita filas por vivero.
- Actor verificado y cuenta activa; cliente privado. Autorización por objeto en
  API/RPC, no solo en navegación ni desde headers del cliente. Conservar público
  Banco de semillas e Impacto y no convertir afiliación/equipo en permiso.
- Operaciones administrativas solo ADMIN, con revisión, auditoría y resultado
  recuperable; cambio y recibo atómicos. Reutilizar infraestructura compatible,
  sin ampliar silenciosamente DTO cerrados ni reinterpretar la revisión de rol.
- Separar contrato de capacidades operativas M1/M2 del DTO de participación, o
  versionar explícitamente su ampliación. Ausencia de un campo de participación
  no equivale a revocación de una facultad de otro módulo.
- Retirar conserva historia; cuenta inactiva o rol inelegible pierde acceso
  efectivo. Coordinar los locks de retiro, baja y escritura para evitar carreras.
- Verificar localmente según [test/README](../../test/README.md), incluidos build,
  unitarios y PostgreSQL/HTTP aislados proporcionales. No ejecutar fixtures ni
  migraciones en servicios reales. Al cambiar OpenAPI de participación actualizar
  el generador y comprobar `node scripts/qa/pa-int02c-openapi.cjs --check`.
- Entregar archivos/contrato, pruebas ejecutadas y límites, versiones y pendientes
  de SQL/corte/despliegue. No declarar una operación implementada por tener su tabla.

## T1. Acceso M1

La [ficha T1 para revisión del usuario](t1-acceso-recoleccion.md) concentra alcance,
reglas y aceptación. Configuración solicitada: GPT-6.1 Sol, esfuerzo máximo.
**No iniciar investigación ni implementación hasta autorización del usuario.**
T2–T5 no quedan incluidos en esa autorización futura.

## T2. Acceso M2 por vivero

**Encargo para pasar al agente:** implementar el acceso por establecimiento y
su gestión por API, sobre los contratos de T1; no incorporar plantas externas ni
crear todavía la recepción física de semillas.

Alcance:

1. Concretar `usuario_vivero` con vigencias por persona/establecimiento. Lecturas
   propias y administrativas, y comandos ADMIN de asignación/retiro por vivero.
   Varios viveros por usuario y varios operarios con las mismas facultades.
2. Proteger lotes, inicio, contextos, saldos, agregados, eventos, despacho, evidencias
   y accesos directos por ID. Filtrar antes de agregar/paginar; una selección de
   vivero del cliente no demuestra autoridad. Las cargas previas al alta también
   necesitan un ámbito autorizado que se revalida al vincularse.
3. Añadir la lectura mínima de material M1 del vivero para orígenes de otros
   recolectores, sin exigir M1 ni dar edición/revisión global del origen.
4. Delimitar la revisión legada M1 por vivero: ADMIN o revisor legado autorizado
   y asignado al establecimiento. No dejar a `VALIDADOR` como vía global de respaldo.
   Impedir la aprobación propia, también para una cuenta con ambos accesos.
   Esta transición no acredita recepción; la capacidad común de «Recibir y validar»
   de GENERAL/VALIDADOR y sus datos físicos se completa en T4.
5. Autorizar `DESECHO` de semillas por asignación al vivero de almacenamiento,
   sin exigir autoría ni M1; eliminar la vía anterior «creador o ADMIN». Conservar
   el movimiento de saldo en M1 y verificar actor, actividad, ámbito y saldo dentro
   de la RPC, no solo en el service. La recepción conforme se exige con el corte T4.
6. Entrega/devolución explícitas: ADMIN o intersección de operario del vivero y
   COORDINADOR de la subcampaña. Revisar todas las rutas equivalentes y las últimas
   RPC, incluida la compatibilidad con cancelación/devoluciones administrativas.
   Plantar conserva su autorización y no vuelve a descontar Vivero.

**Salida verificable:** operario de A opera A y es rechazado en B, incluso por ID;
una persona asignada a A/B opera ambos; retirar A conserva B y M1; un usuario solo
M1 no opera M2, y uno solo M2 no captura recolecciones. Retiro/baja concurrentes,
evidencias, agregados y frontera M2–M3 quedan verificados. No presentar este cierre
como recepción física ni como incorporación externa implementadas.
Probar además que ser creador no autoriza desecho, que el operario de A puede
desechar semillas de otro recolector en A y que la misma acción se rechaza en B.

Fuentes de inicio: [M2](../../src/lotes-vivero/application/vivero-auth.service.ts),
[controller](../../src/lotes-vivero/api/lotes-vivero.controller.ts),
[inicio 018](../../migrations/018_fix_vivero_inicio_lote_rpc_trazabilidad_evidencia.sql),
[desecho 059](../../migrations/059_recoleccion_desecho_rpc.sql),
[operaciones compartidas 077](../../migrations/077_pa_int02d_operaciones_compartidas.sql)
y [evidencias 079](../../migrations/079_pa_int02d_evidencias.sql).

## T3. Administración e integración visual

**Encargo para pasar al agente:** ampliar el módulo existente «Usuarios y permisos»
con las APIs verificadas de T1/T2; no crear otra aplicación de administración.

Alcance:

1. Reutilizar el selector administrativo de cuentas. Mostrar por separado rol
   global, acceso de Recolección y viveros asignados; cambiar uno no cambia los otros.
2. Permitir a ADMIN otorgar/retirar M1 y agregar/retirar un vivero por operación.
   Mostrar revisión y resultado real; no guardar una colección de cambios en el
   endpoint de rol ni asignar un rol global por marcar un acceso.
3. Conservar confirmación/recuperación de comandos y aislamiento entre cuentas;
   tras un retiro refrescar capacidades. Una sesión que pierde ADMIN puede recuperar
   su resultado propio, sin seguir administrando a otros.
4. Navegación de M1/M2 basada en capacidades del servidor. Verificar solo M1,
   solo M2, ambos y ninguno; abrir una URL directa no elude autorización backend.
5. Conservar la gestión de Plantación en su ámbito. No usar el buscador contextual
   de participantes como directorio administrativo ni presentar la afiliación
   como un acceso. No exponer una recepción física o externa aún no implementada.

**Salida verificable:** ADMIN administra M1 y viveros sin alterar el rol ni los
permisos de subcampaña; no ADMIN es rechazado también por API; la cuenta combinada
ve ambos módulos; timeout conserva intención y clave, y cambio de cuenta no filtra
datos/pendientes. Probar también la regresión del cambio de rol existente.

Fuentes de inicio: [módulo de usuarios PWA](../../../pwa-r3foresta/src/modules/usuarios/README.md),
[pantalla actual](../../../pwa-r3foresta/src/modules/usuarios/pages/GestionUsuariosScreen.tsx),
[cliente administrativo](../../../pwa-r3foresta/src/modules/usuarios/api/usuarios.api.ts)
y [contrato de usuarios](../frontend/modulos/usuarios.md#administración-de-roles-globales).

## T4 y T5: siguientes encargos, fuera de los tres primeros

**T4, recepción de semillas:** constancia `recoleccion_recepcion`, acción común
«Recibir y validar», cantidad/unidad/actor/fecha/evidencia, atomicidad, reintentos
y elegibilidad de consumo. Aplicar las reglas confirmadas: sin autorrecepción y
desecho por el operario del vivero. Cantidades distintas requieren incidencia y
resolución trazable; `VALIDADO` antiguo no se transforma en recepción acreditada.

**T5, plantas externas:** el mismo operario incorpora en su vivero compra, donación
o saldo inicial sin exigir acceso M1 ni inventar Recolección/EMBOLSADO. Ejecutar el
[plan de incorporación existente](plan-incorporacion-plantas-procedencia.md), con
continuidad de stock, evidencias, historia y entregas. La recepción directa en
campo conserva su incremento posterior y sus decisiones sobre remanentes.

El corte real requiere integrar y verificar el alcance que se vaya a habilitar,
revisar las correspondencias de acceso y cotejar el catálogo destino. Las reglas
transitorias no sustituyen el modelo final ni permiten declarar terminado T4/T5.
