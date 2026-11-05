# T1 · Acceso explícito de Recolección

Fecha: 5 de noviembre de 2026. **BORRADOR PARA REVISIÓN DEL USUARIO.**
Configuración solicitada: **GPT-6.1 Sol · esfuerzo máximo**.
**No iniciar investigación, herramientas ni implementación hasta que el usuario
revise esta ficha y autorice expresamente continuar.** Crear o asignar esta tarea
no constituye autorización para ejecutarla.

## Objetivo de la futura implementación

Permitir a ADMIN conceder o retirar el acceso de Recolección sin cambiar el rol
global de la cuenta. Una cuenta interna con M1 registra y mantiene sus recolecciones
según autoría y estado; sin M1 no obtiene esa facultad solo por ser GENERAL/VALIDADOR.
Conservar una cuenta y un rol global, combinables después con acceso a Vivero.

Fuente de diseño: [propuesta elegida](propuesta-permisos-por-vivero.md).
Dependencias y tareas posteriores: [encargos generales](encargos-accesos-recoleccion-vivero.md).

## Reglas ya decididas

- `VALIDADOR` permanece como rol global compatible; no se elimina ni se duplica la cuenta.
- ADMIN tiene autoridad global derivada y administra los accesos; no ADMIN no los concede.
- VOLUNTARIO y cuentas inactivas no obtienen acceso operativo por esta tarea.
- El recolector no confirma su propia recolección, tampoco por combinar M1/M2.
  La confirmación corresponde a otra persona autorizada del vivero.
- El recolector no obtiene `DESECHO` por ser autor. Esa facultad corresponde a
  Vivero según el establecimiento y el saldo, o a ADMIN. El movimiento sigue en M1.

## Alcance, solo después de la autorización

1. Definir el contrato técnico de `usuario_acceso_recoleccion`: vigencia, revisión,
   auditoría y otorgamiento/retiro, con migración aditiva tras leer antecedentes.
   Conservar historial y no abrir dos vigencias simultáneas.
2. Lectura propia de acceso efectivo, lectura administrativa de la cuenta y API
   exclusiva ADMIN para otorgar/retirar M1. Contrato explícito de intención,
   revisión, errores y recuperación; cambio, auditoría y recibo atómicos.
3. Autorizar por acceso M1 la captura y mantenimiento propios: crear, editar,
   enviar/reenviar y eliminar borradores cuando su estado lo permita; revisar
   también lecturas, fotos y rutas equivalentes. ADMIN conserva su autoridad.
4. Sustituir la autorización implícita del rol para esas acciones: GENERAL sin M1
   no captura; VALIDADOR con M1 sí puede hacerlo. No permitir operar registros ajenos.
5. Bloquear la confirmación propia en la aprobación actual por ID, incluso para
   una cuenta con ambos accesos o ADMIN. Es una restricción de negocio, no el
   nuevo flujo físico de recepción ni una nueva facultad de validación global.
6. Cerrar la autorización de `DESECHO` basada solo en autoría. La habilitación de
   operarios por vivero pertenece a T2; mientras no exista ese soporte, no dejar
   una vía de respaldo por ser creador. La autoridad ADMIN permanece. Esa fase
   intermedia no es un corte final listo para producción.
7. Entregar capacidades consumibles por T2/T3 sin tratar el DTO de participación
   como catálogo general. Alinear DTO, Swagger, guía y generador OpenAPI si se toca
   su superficie; registrar archivos, pruebas, versión y límites de la entrega.

## Fuera de T1

Asignación a viveros, operación M2, pantalla conjunta de administración, recepción
física/validación conjunta, plantas externas y cambios de autorización en Plantación.
No ejecutar T2–T5 ni atribuir recepción a los `VALIDADO` históricos.
El aislamiento completo «solo M1» requiere T2; no se acredita por cerrar esta ficha.

## Aceptación para cuando se implemente

- ADMIN concede, consulta y retira M1; otro usuario es rechazado por API/RPC.
- Cuenta interna sin M1 no captura; habilitada mantiene solo lo propio y según estado.
- VALIDADOR con M1 puede registrar; VOLUNTARIO/inactiva son rechazados.
- Tener M1 o ser autor no habilita confirmación propia ni desecho de semillas.
- Reintentos no duplican vigencias; retirar conserva historia y tiene un resultado
  coherente frente a escritura/baja concurrentes. Recibos no conceden autoridad vigente.
- Regresión de roles globales, Plantación y consultas públicas sin cambios indebidos.

Después de autorizar: build, unitarios y pruebas SQL/HTTP aisladas proporcionales,
según [test/README](../../test/README.md). No aplicar SQL en Supabase, desplegar,
hacer push ni modificar permisos reales como parte de esta tarea local.

## Fuentes para leer después de autorizar

- README, ARCHITECTURE y AGENTS del checkout; conservar cambios locales preexistentes.
- [Autorización M1](../../src/recolecciones/application/recoleccion-auth.service.ts),
  [validación](../../src/recolecciones/application/recoleccion-validacion.service.ts),
  [desecho](../../src/recolecciones/application/recoleccion-desecho.service.ts) y
  [RPC059](../../migrations/059_recoleccion_desecho_rpc.sql).
- [Administración actual](../frontend/modulos/usuarios.md#administración-de-roles-globales),
  [lectura091](../../migrations/091_usuarios_administracion_lectura.sql),
  [eliminación089](../../migrations/089_recoleccion_eliminar_borrador.sql) y
  [rechazo090](../../migrations/090_recoleccion_rechazo_sin_limite_fecha.sql).

La ficha prepara una implementación futura. Por ahora el agente debe limitarse
a confirmar que recibió el encargo y esperar al usuario, sin usar herramientas.
