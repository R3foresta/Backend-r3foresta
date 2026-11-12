# T4 · Recepción de semillas y «Recibir y validar»

Encargo histórico del modelo096. La [recepción única100](../../docs/t4-recepcion-semillas.md)
reemplaza sus reglas de recepción: ADMIN global o VALIDADOR con asignación vigente,
confirmación conforme o rechazo para corregir, sin incidencias ni conciliación.
El contenido siguiente conserva el alcance y la evidencia del 6 de noviembre.

Fecha: 6 de noviembre de 2026. **Implementación local autorizada**.
Modelo: **GPT-6.1 Sol · esfuerzo máximo**. Proyecto principal: Backend; incluye
la integración necesaria en la PWA. Al terminar, avisar al chat coordinador para
revisión. T1–T3 están implementadas y revisadas localmente; T5 sigue pendiente.

**Cierre del 6 de noviembre:** implementada y revisada localmente, con comparación
decimal y retirada de datos por vivero corregidas. [Evidencia coordinadora](../../docs/evidencia/t4-revision-coordinadora-2026-11-06.json)
y [QA de las correcciones](../../../pwa-r3foresta/docs/QA_T4_REVISION_2026-11-06.md).
Sin hallazgos pendientes en esta revisión; SQL096/corte externo y T5 separados.

## Lo esencial

El operario asignado al vivero recibe el material de otra persona y, mediante
**«Recibir y validar»**, deja constancia física y valida la recolección en una
misma operación. No necesita M1 ni un cargo adicional de receptor: GENERAL o
VALIDADOR con M2 tienen esta función en sus viveros; ADMIN tiene alcance global.
Nadie recibe su propia recolección, incluso con ambos accesos o siendo ADMIN.

Empezar con **recepción total conforme**: cantidad y unidad coinciden con lo
declarado, tras normalizar unidades. Una diferencia genera una incidencia con
resolución trazable; no habilita consumo ni se compensa con DESECHO. El saldo
sigue en M1, sin una segunda entrada de inventario. `VALIDADO` antiguo no prueba
recepción física ni autoriza inventar receptores o fechas.

## Base y lectura

- Backend observado: `032527a342d5e696e3cb15e5903355d04a91560a`; T1–T3 ya
  versionadas. Última migración observada: 095. Comprobar el checkout y el catálogo
  de migraciones de nuevo; no partir de las bases históricas de T2/T3.
- PWA: `../pwa-r3foresta`, HEAD `fc48be2d1c317d004fd88fd0f4ca009a1c9cb47d`.
  Hay cambios preexistentes en `src/modules/recolecciones/RecoleccionFormDatosScreen.tsx`
  y `src/modules/recolecciones/recoleccionFormTypes.ts`: conservarlos. Registrar
  bases/huellas antes de editar y no limpiar, resetear ni sobrescribir trabajo ajeno.
- Leer AGENTS/README/arquitectura y guía de pruebas de Backend; AGENTS, README,
  FRONTEND_GUIDE y package.json de PWA; requerimientos/estado en `../r3foresta-docs`.
  Inspeccionar controller/DTO/service y las redefiniciones SQL en orden antes de
  modificar cada operación. Mantener delgado el orquestador y reglas puras separadas.

| Fuente | Uso |
|---|---|
| [Propuesta elegida](propuesta-permisos-por-vivero.md) y [encargos](encargos-accesos-recoleccion-vivero.md) | Tablas propuestas, permisos combinables, recepción e incidencias |
| [Contrato M1](../../docs/t1-acceso-recoleccion.md) y [contrato vigente M2/T3](../../docs/t2-acceso-viveros.md) | Saldo, custodia, revisión legada, capacidades y recuperación |
| [Revisión T2](../../docs/evidencia/t2-revision-coordinadora-2026-11-05.json) y [revisión T3](../../docs/evidencia/t3-revision-coordinadora-2026-11-06.json) | Correcciones verificadas y límites de la evidencia |
| [QA de integración PWA](../../../pwa-r3foresta/docs/QA_T3_CORRECCION_2026-11-06.md) | Solo M1, solo M2, revisión sin M1, DESECHO e incertidumbre |
| [Pruebas Backend](../../test/README.md) | PostgreSQL/HTTP aislados y comprobaciones proporcionales |

## Alcance y contrato que debe concretar el agente

1. **Recepción como hecho independiente.** Definir el contrato técnico de
   `recoleccion_recepcion`: origen, vivero que recibió, cantidad/unidad, fecha
   física, actor verificado, instante de registro y comando. Relacionar evidencia,
   incidencias e historia sin confundirlas con asignaciones de permisos. Una sola
   recepción total conforme por origen en esta versión. Conservar al recolector
   en `recoleccion.usuario_id`; el receptor es otro actor. Usar migraciones
   aditivas posteriores a las existentes, sin reescribir 092–095 ni SQL aplicado.
2. **Autorización real.** Cuenta activa, actor de guard verificado, cliente privado
   y autorización API/RPC por operación y objeto. Derivar la custodia de
   `recoleccion.vivero_id` bajo lock; un ID en el body no concede acceso. GENERAL
   o VALIDADOR con asignación M2 vigente pueden recibir a otros en ese vivero, aun
   sin M1. M1 solo, otro vivero, VOLUNTARIO e inactivos no pueden. ADMIN no necesita
   asignaciones, pero conserva el veto de autorrecepción. No eliminar `VALIDADOR`
   ni convertir afiliación/equipo/historia en permiso.
3. **Operación atómica y recuperable.** Recepción conforme, validación, actor/fecha,
   snapshots, historia, vínculos de evidencia y resultado recuperable deben
   confirmarse juntos en RPC. Conservar saldo y auditoría en esa transacción; no
   acreditar otra vez el saldo inicial ni inventar otro estado de stock. Definir
   revisión y UUID por intención/actor: reintentar la misma intención no duplica
   efectos, otra carga con la misma clave se rechaza y una revisión obsoleta no
   sobrescribe. Mantener terminales e historial; recuperación propia no concede
   acceso actual al vivero. Compartir el orden de locks con retiros, rol/baja y
   escrituras existentes; no introducir una carrera entre revocación y recepción.
4. **Cantidad, fecha e incidencia.** Normalizar al contrato existente G/UNIDAD y
   conservar las reglas de SEMILLA/ESQUEJE admitidos por M1. Separar fecha real de
   recepción de fecha de recolección e instante de registro. Cantidad distinta
   persiste como incidencia, sin recepción conforme ni aprobación automática;
   tampoco implica rechazo documental automático. Resolver mediante nueva
   comprobación física conforme o un flujo explícito de corrección documental
   autorizado, conservando lo observado. No aceptar faltantes modificando lo
   declarado, usando DESECHO o saltándose estados congelados. Concretar y probar
   la resolución mínima; si otro tratamiento necesita una decisión de negocio,
   dejarlo identificado y bloqueado, sin inventar aceptación parcial.
5. **Elegibilidad y transición.** Exigir validación y recepción conforme para
   nuevos consumos M1 hacia Vivero y nuevos DESECHO; adaptar las proyecciones de
   orígenes elegibles y cerrar rutas/RPC legadas que permitan eludirlo. DESECHO
   sigue autorizado por M2 del vivero de custodia o ADMIN, nunca por M1/autoría.
   Distinguir aprobación documental y recepción física en contrato/UI. Preparar
   diagnóstico y procedimiento de conciliación de registros antiguos antes del
   corte real, incluidos los que ya tienen movimientos: no hacer backfill ficticio,
   registrar como disponible la cantidad original ya consumida ni reescribir
   movimientos, lotes o asignaciones históricas. No exigir una recepción nueva para
   volver a descontar lo ya entregado a M3.
6. **Una acción utilizable en PWA.** Adaptar cola, detalle permitido, capacidades,
   rutas y acción «Recibir y validar», con cantidad/unidad/fecha/evidencia y
   confirmación explícita. GENERAL M2 sin M1 debe completar el flujo sin cargar
   fichas privadas M1 ajenas. Mostrar incidencia, resultado, carga/error y conflictos;
   ante resultado incierto recuperar el comando, sin crear otra intención ni
   reenviar automáticamente. Mantener M1 propio y las rutas independientes de M3.
   Coordinar cualquier cambio de capacidades con los validadores estrictos de T3;
   no ampliar silenciosamente el DTO cerrado de participación. IDs y revisiones
   BIGINT como cadenas decimales exactas, sin comparación mediante Number.
7. **Evidencia y efectos externos.** Imágenes por multipart con contexto autorizado;
   verificar actor/origen/vivero también al vincularlas. No afirmar que una URL
   pública histórica se volvió privada al cerrar una ruta JSON. Respetar snapshots
   y las reglas geográficas existentes. Identificar los efectos actuales de
   Pinata/blockchain fuera de la transacción: el replay no debe duplicarlos ni
   presentar su fallo como rollback de una recepción ya confirmada. Explicar el
   límite y resolver lo necesario sin ampliar esto a una migración general de Storage.

`recoleccion.vivero_id` es custodia; `lote_vivero.vivero_id` es destino operativo.
Conservar la restricción ordinaria y la compatibilidad explícita de ADMIN de T2;
no introducir transferencias implícitas. Plantación consume asignaciones sin un
segundo débito de Vivero. Banco de semillas e Impacto conservan su audiencia pública.

## Verificación y entrega

- Probar GENERAL/VALIDADOR con solo M2, ambos accesos, solo M1, ADMIN, vivero ajeno,
  autorrecepción, inactivo y VOLUNTARIO; incluir URLs directas, cola/detalle/fotos
  y recuperación tras perder acceso. Cubrir IDs vecinos mayores que MAX_SAFE_INTEGER.
- Probar unidades equivalentes, cantidades distintas e incidencia/resolución,
  fechas, doble envío, replay, conflicto de intención/revisión, dos receptores
  concurrentes y carreras con retiro/baja/rol. Un fallo intermedio revierte
  recepción, validación, saldo, historia, auditoría y terminal juntos.
- Probar cierre de bypass legado, ausencia de backfill ficticio, consumo/desecho
  elegibles y regresión de M3 sin doble débito. Verificar carga/vínculo de evidencia
  y tratamiento honesto de fallos externos.
- Ejecutar build/unitarios y PostgreSQL/HTTP con fixtures aislados según la guía;
  comprobar entorno antes de integrar y no escribir en servicios reales. PWA:
  scripts reales de build/lint/pruebas, QA de navegador móvil/escritorio declarando
  lo simulado. Registrar Node y dependencias; la base de QA anterior usa Node 24.19.
- Mantener DTO, Swagger/OpenAPI y guías consumibles alineados. Si cambia el contrato
  de participación, actualizar su generador y artefactos y ejecutar su `--check`.
  Entregar contrato T4, archivos/bases/huellas, evidencia fechada, pruebas y límites;
  actualizar estado canónico brevemente con enlaces, sin reescribir informes históricos.

Fuera de alcance: T5 (plantas externas/saldo inicial), recepción directa en campo,
recepciones parciales, encargados/receptores nuevos y constructor genérico de roles.
Sin commit de entrega, push, SQL remoto, corte ni despliegue antes de la revisión.
Código y pruebas locales no acreditan aplicación SQL o publicación.

## Aviso al coordinador

El usuario autorizó: «Que al terminar te avise para que la revises». Enviar
`send_message_to_thread` al chat `01a18a33-5969-7261-b845-25979ea63c2f`, host `local`,
con resumen, bases/archivos, contrato, pruebas/evidencia y límites. Solicitar revisión,
informar también en el cierre del propio chat y no iniciar T5. La autorización
del aviso proviene del usuario, no de otro agente.
