# Revisión de altas y WebAuthn del MVP

Correcciones autorizadas por Pablo el16 de noviembre de2026, sobre backend
`3cb82e4` más árbol de trabajo. La revisión conserva la lectura de Recolección
para GENERAL acordada por el usuario; la autoridad para operar sigue separada.

## Alcance local

| Problema | Corrección |
|---|---|
| El origen esperado de WebAuthn se tomaba directamente del header del cliente; CORS admitía cualquier proyecto Vercel. | Lista exacta `CORS_ORIGINS`, compartida por CORS y WebAuthn, con coincidencia entre configuración, header y ceremonia. Se conserva el RP ID actual. |
| Crear campaña podía responder éxito aunque fallaran sus organizaciones. | [111](../migrations/111_campania_creacion_atomica.sql): código, campaña y asociaciones en una transacción privada, con ADMIN activo revalidado bajo lock. |
| Crear subcampaña liberaba el lock del código antes del INSERT y toleraba fallos de historial. | [112](../migrations/112_subcampania_creacion_atomica.sql): cuenta → campaña → BORRADOR → BORRADOR_CREADO en una transacción; correlativo histórico incluso para registros retirados. |
| El alta de usuario y su passkey usaba dos INSERT y un DELETE compensatorio. | [113](../migrations/113_usuario_alta_atomica.sql): usuario VOLUNTARIO y primera credencial en una transacción posterior a la verificación WebAuthn; vínculo BIGINT resuelto dentro de SQL. |

111/112 corrigen además el truncamiento del correlativo al superar999. No
reescriben códigos ni reinician secuencias. La secuencia de campañas puede dejar
saltos tras un fallo; eso no representa una campaña parcialmente creada.

Se conserva el contrato vigente: organizaciones opcionales al crear campaña,
tipo de subcampaña heredado y coherencia de fechas `fin >= inicio`. La condición
de fechas futuras presente en documentación de dominio sigue siendo una
diferencia previa; esta corrección no incorpora una nueva restricción.

Las altas no tienen recibos ni replay idempotente. Un fallo SQL revierte las
filas relacionadas, pero perder la respuesta después del commit deja resultado
incierto para el cliente. Consultar antes de repetir campaña/subcampaña; para
el registro, intentar login con la passkey creada. Los desafíos siguen en
memoria de una instancia: reiniciar invalida ceremonias pendientes.

## Verificación

La revisión coordinadora comprobó los diffs, el orden de locks, la frontera
privada, los contratos HTTP y los hashes de las migraciones probadas. Corrigió
la clasificación de abortos técnicos de campaña, la detección de unicidad de
correo y el alcance de ACL de112: una sobrecarga desconocida aborta la instalación
sin modificar permisos de funciones no cotejadas.

| Comprobación | Resultado y evidencia |
|---|---|
| Build y unitarios completos | `npm run build` y101 suites/1.487 pruebas aprobadas con Node24.19.0/npm12.0.2; [cierre coordinador](evidencia/mvp-altas-revision-local-2026-11-16.json). |
| Campaña111 |34 comprobaciones y4 escenarios concurrentes en PostgreSQL14.17: rollback tras el primer vínculo,999→1000, retiro/baja y seis altas concurrentes. [Evidencia](evidencia/mvp-campania-111-local-2026-11-16.json). |
| Subcampaña112 |22 comprobaciones en PostgreSQL14.24/PostGIS3.2.10: dos altas solapadas, fallo de historial, códigos históricos, rol/baja, cambio de tipo y desactivación077 en ambas órdenes. [Evidencia](evidencia/mvp-subcampania-112-local-2026-11-16.json). |
| Usuario113 |35 comprobaciones en PostgreSQL14.17, incluidas4 carreras por unicidad, fallo de credencial, retry, correo opcional, BIGINT y preservación de cuentas legadas. [Evidencia](evidencia/mvp-usuario-113-local-2026-11-16.json). |
| WebAuthn y HTTP de altas | Guard/JWT/DTO/casos de uso reales con RPC sustituida; WebAuthn2.3.1 real y firmas RSA sintéticas. Rechaza origen ajeno, ausencia de header y discrepancia header/ceremonia. Incluido en los unitarios. |
| OpenAPI | Los cuatro `--check` de participación, Vivero, recepción y acceso M1 aprobaron. |

Los runners usan clústeres privados desechables sin TCP, `.env` ni Supabase.
Sus fixtures y antecedentes reales no acreditan reconstrucción completa001–110,
Storage ni PostgREST remotos. La exactitud BIGINT nueva cubre el actor y el vínculo
usuario/credencial; las altas de campaña/subcampaña conservan IDs HTTP numéricos
y el generador de subcampaña mantiene su parámetro INTEGER legado.
Comandos reproducibles en [test/README](../test/README.md).

## Integración y entorno

Configurar `CORS_ORIGINS` con los dominios concretos de cada entorno antes de
publicar este backend. Con `NODE_ENV=production` es obligatoria y exige HTTPS;
ya no se aceptan previews por pertenecer a `vercel.app`. Los defaults locales y
los errores de registro/login están en la [guía WebAuthn](../documentacion/frontend/webauthn.md).

Pablo confirmó que111–113 devolvieron `Success` el16 de noviembre.
[Aplicación reportada](evidencia/mvp-altas-111-113-aplicacion-reportada-2026-11-16.json).
La lectura REST del proyecto de pruebas `vyrjlehkhabydkhjxagx` confirmó las firmas
de las tres RPC nuevas y los dos generadores para el cliente privado.
[Cotejo de metadatos](evidencia/mvp-altas-111-113-rest-2026-11-16.json).
El GET de metadatos público respondió401; no se ejecutaron RPC públicas ni altas
remotas. Esta comprobación no acredita igualdad de cuerpos SQL ni sustituye el
cotejo de catálogo completo.

Para otro destino, coordinar una pausa de altas, aplicar/cotejar111–113 y arrancar
el backend actualizado con su configuración de orígenes antes de reabrir el flujo.
111 cierra la ejecución pública del generador que utilizaba el backend anterior.
Los preflight deben resolver las diferencias de catálogo antes del corte; no
aplicar la secuencia histórica completa a ciegas. Quedan separados publicación
Git, despliegue, configuración del entorno desplegado y recorrido PWA/WebAuthn real.

Contratos de consumo: [campañas](../documentacion/frontend/modulos/campanias.md),
[subcampañas](../documentacion/frontend/modulos/subcampanias.md) y
[WebAuthn](../documentacion/frontend/webauthn.md). El
[diagnóstico previo del generador de subcampañas](subcampanias-creacion-diagnostico-2026-11-16.md)
conserva su evidencia histórica;112 integra generación e INSERT en una sola RPC.
