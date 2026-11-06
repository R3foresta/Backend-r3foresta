# T3 · Usuarios y permisos: accesos M1 y M2

Fecha: 5 de noviembre de 2026. **Implementación local autorizada** en la PWA.
Modelo: **GPT-6.1 Sol · esfuerzo máximo**. Al terminar, avisar al chat coordinador
para revisión antes de publicar. T1 y T2 ya están revisadas localmente.

**Cierre del 6 de noviembre:** implementada y revisada localmente, sin hallazgos
pendientes en esta revisión. [Comprobación coordinadora](../../docs/evidencia/t3-revision-coordinadora-2026-11-06.json)
y [correcciones y QA de la PWA](../../../pwa-r3foresta/docs/QA_T3_CORRECCION_2026-11-06.md).
T4/T5 y el corte externo siguen pendientes.

## Lo esencial

Ampliar `/app/usuarios`, «Usuarios y permisos», reutilizando su selector de cuentas.
Para la persona elegida, mostrar tres secciones sencillas: **rol global**,
**acceso de Recolección (M1)** y **viveros asignados (M2)**. ADMIN puede otorgar o
retirar M1 y agregar o retirar un vivero por operación. Una cuenta admite solo M1,
solo M2, ambos o ninguno; el acceso M2 se concede por vivero, sin otro permiso global
independiente. Conservar el cambio de rol y los permisos de Plantación separados.

## Base y fuentes

- Proyecto principal: `../pwa-r3foresta`, checkout local observado `dbcedc5`, limpio
  al preparar el encargo. Comprobar nuevamente su estado antes de editar.
- Backend: `6f59263` **más T1/T2 y sus correcciones locales sin commit de entrega**.
  No partir solo de HEAD, limpiar el árbol ni perder los cambios ajenos. 092–095 y
  las evidencias históricas se conservan; 094/095 no se reescriben.
- Leer AGENTS, README, FRONTEND_GUIDE, package.json y los patrones del proyecto PWA.
  Registrar base/huellas propias. El estado canónico está en `../r3foresta-docs/ESTADO.md`.

| Fuente | Uso |
|---|---|
| [Usuarios PWA](../../../pwa-r3foresta/src/modules/usuarios/README.md) y [pantalla actual](../../../pwa-r3foresta/src/modules/usuarios/pages/GestionUsuariosScreen.tsx) | Selector, cambio de rol, confirmación, recuperación y foco |
| [Contrato M1](../../docs/t1-acceso-recoleccion.md) | Gestión y capacidades propias de Recolección; su corte histórico se complementa con T2 |
| [Contrato vigente M2/T3](../../docs/t2-acceso-viveros.md) y [revisión cerrada](../../docs/evidencia/t2-revision-coordinadora-2026-11-05.json) | Asignaciones por vivero, revisión documental, desecho y compatibilidad operativa |
| [Usuarios backend](../frontend/modulos/usuarios.md#administración-de-roles-globales) | Directorio exclusivo ADMIN y cambio de rol existente |
| [Encargos](encargos-accesos-recoleccion-vivero.md) y [propuesta elegida](propuesta-permisos-por-vivero.md) | Decisiones y límites T3–T5 |

## Alcance

1. **Administración en la pantalla existente.** Reutilizar búsqueda, selección y
   paginación de cuentas. Leer M1/M2 del usuario elegido y el catálogo de viveros.
   Mostrar acceso explícito y efectivo, autoridad global derivada de ADMIN,
   asignaciones vigentes e historia paginada. GENERAL/VALIDADOR activos son destinos
   elegibles; no otorgar a ADMIN, VOLUNTARIO o inactivo. Permitir retirar vigencias
   conservadas de cuentas inelegibles según contrato, sin borrar su historia.
2. **Comandos separados.** Consumir las rutas reales `acceso-recoleccion` y
   `acceso-viveros`, con motivo y confirmación del usuario/operación/vivero. Cada
   acción usa su UUID y revisión: M1, conjunto M2 por usuario y autoridad global
   tienen contadores distintos. No guardar accesos con el endpoint del rol ni
   ejecutar un conjunto de cambios como si fuera una transacción única.
3. **Recuperación e identidad.** Reutilizar transporte, ciclo y bloqueo existentes
   cuando sean compatibles, conservando contratos propios. Aislar intención,
   pendiente y recibo por actor y dominio. Ante timeout/503 conservar UUID e
   intención; 202 no prueba fallo. Ante 409 releer y confirmar una nueva intención
   con otra clave. Refrescar capacidades tras el resultado. Una cuenta que perdió
   ADMIN puede recuperar lo propio sin seguir leyendo el directorio ni gestionar
   a otros. Cambio de cuenta/logout no filtra datos, resultados o consultas tardías.
4. **Capacidades y rutas.** Navegación, accesos directos y acciones M1/M2 usan las
   capacidades efectivas del servidor, con estados de carga/error/sesión expirada.
   No derivar autoridad de rol interno, afiliación o equipo. M1 permite lo propio;
   VALIDADOR con M2 puede revisar su ámbito aun sin M1. DESECHO depende de la
   capacidad del vivero, no de autoría ni del flag M1 global. Preservar Plantación
   con sus permisos independientes, Banco de semillas e Impacto públicos.
5. **Compatibilidad mínima con T1/T2.** Los flujos alcanzados deben seguir siendo
   utilizables con solo M1 o solo M2. Adaptar el selector de material de Vivero a
   `GET /api/v1/vivero/origenes` y la carga previa a INICIO al contexto `vivero_id`
   exigido por T2, sin pedir ficha M1 ajena ni conceder M1 para salvar un 403.
   Integrar las acciones existentes autorizadas por vivero, incluido DESECHO,
   mediante la proyección permitida y un acceso adecuado para el operario M2.
   Los eventos usan el contexto derivado de su lote. Respetar la intersección
   M2/COORDINADOR en entrega/devolución y el consumo M3 ya entregado.
6. **UI y contrato.** Componentes pequeños, español, móvil/escritorio, patrones de
   diseño y confirmación existentes. Mantener IDs/revisiones como cadenas decimales
   exactas; no usar Number para comparar autoridad ni seleccionar viveros BIGINT.
   Mostrar estado real, conflictos y motivos con lenguaje comprensible. No ampliar
   silenciosamente el DTO de capacidades de participación ni usar sus campos
   ausentes como revocación de facultades M1/M2.

ADMIN deriva acceso global sin filas por vivero. Cambiar rol/actividad suspende o
reactiva la efectividad de vigencias conservadas; no concede, retira ni borra por
sí solo accesos explícitos. Mantener el veto de aprobación propia incluso ADMIN.
Hasta T4, revisar/validar no demuestra recepción física y GENERAL con M2 no adquiere
la acción conjunta futura de recepción/validación.

## Verificación y entrega

- Probar ADMIN otorgando/retirando M1 y viveros A/B, sin cambiar rol ni M3. Verificar
  solo M1, solo M2, ambos, ninguno, ADMIN derivado, VALIDADOR revisor sin M1,
  VOLUNTARIO e inactivos; incluyendo URLs directas y acciones sobre un vivero ajeno.
- Verificar retiros independientes, revisión obsoleta, rechazos, timeout/recuperación,
  doble envío, pérdida de ADMIN, cambio de cuenta y respuestas tardías. No convertir
  un recibo histórico en prueba de acceso efectivo actual.
- Cubrir IDs vecinos `9007199254740992`/`9007199254740993`, carga de fotos con contexto,
  selección de orígenes sin M1 y regresión del cambio de rol/último ADMIN y de M3.
- Ejecutar los scripts reales de PWA: build, lint y pruebas proporcionales; no hay
  script typecheck separado. Hacer QA de navegador móvil/escritorio con backend
  sintético local y declarar qué está simulado. No usar cuentas/servicios reales
  para fixtures ni escribir accesos de personas reales.
- Entregar archivos, contrato consumido, evidencia fechada con bases/huellas,
  pruebas/entorno/límites y guía actualizada. Conservar evidencias históricas y
  actualizar estado canónico cuando corresponda. Si aparece una brecha backend,
  describirla con ruta y caso reproducible; corregir solo lo necesario para T3,
  sin reinventar T1/T2 ni reescribir SQL aplicado.

Fuera de alcance: recepción física/«Recibir y validar» (T4), plantas externas o
saldo inicial (T5), nuevos cargos, matriz genérica de roles y migración de Storage.
Sin SQL remoto, commit de entrega, push ni despliegue antes de la revisión.

## Aviso al coordinador

El usuario autorizó expresamente: «Que al terminar te avise para que la revises».
Enviar `send_message_to_thread` al chat `01a18a33-5969-7261-b845-25979ea63c2f`, host
`local`, con cambios, bases, pruebas/evidencia y límites; solicitar revisión y no
iniciar T4/T5. La autorización del aviso proviene del usuario, no de otro agente.
