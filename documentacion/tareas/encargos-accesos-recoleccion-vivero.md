# Encargos de implementación: accesos de Recolección y Vivero

Actualización: 6 de noviembre de 2026. Estado: **T1–T3 revisadas localmente; T4/T5 pendientes**.
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
**T1 aporta la API administrativa M1; T2 añade localmente [la API M2](../../docs/t2-acceso-viveros.md), revisada. La UI conjunta T3 ya está revisada localmente.** Se amplía la gestión
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

La [ficha T1 autorizada por el usuario](t1-acceso-recoleccion.md) conserva alcance,
reglas y aceptación. [Implementación, contrato y evidencia local](../../docs/t1-acceso-recoleccion.md).
Configuración solicitada: GPT-6.1 Sol, esfuerzo máximo. Revisión local realizada;
SQL/corte remoto pendientes. T2–T5 no quedan incluidos en la autorización de T1.

## T2. Acceso M2 por vivero

La [ficha T2](t2-acceso-viveros.md) concentra el encargo autorizado sobre T1 revisada:
asignaciones por vivero, administración por API, operación M2, desecho de semillas
y revisión legada M1 acotados al establecimiento. GPT-6.1 Sol, esfuerzo máximo.
Al terminar debe avisar al chat coordinador para revisión, antes de publicar.
Recepción física, pantalla conjunta y plantas externas no se implementan en T2.

## T3. Administración e integración visual

La [ficha T3](t3-administracion-accesos.md) concentra el encargo autorizado en
GPT-6.1 Sol, esfuerzo máximo, dentro del proyecto PWA. Amplía «Usuarios y permisos»
para administrar M1 y viveros M2 con las APIs revisadas, conservar el rol separado,
recuperar comandos y adaptar navegación/compatibilidad mínima de los flujos afectados.
Aviso recibido y [revisión coordinadora cerrada el 6 de noviembre](../../docs/evidencia/t3-revision-coordinadora-2026-11-06.json), sin hallazgos pendientes. T4/T5 quedan fuera.

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
