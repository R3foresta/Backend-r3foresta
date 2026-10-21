# Informes y evidencia

Para comenzar o integrar, usar el [README](../README.md) y la
[guía de participación](../documentacion/modulos/participacion.md).
Esta carpeta conserva resultados fechados; no es otro backlog ni una receta de despliegue.

| Entrega | Informe | Alcance |
|---|---|---|
| Correcciones INT07 · BE02 parcial | [Contrato/cotejo](pa-int07-contrato.md), [persistencia local](evidencia/pa-int07-be02-persistencia-local.json), [decisiones anteriores](evidencia/pa-int07-be01-decisiones.json), [último cotejo de desarrollo](evidencia/pa-int07-recuperacion-075-078-cotejada-2026-10-20.json) | 082 privada local sin DML/ejecutores/backfill; desarrollo con 074/075/078 recuperadas y definiciones 077/079 cotejadas, 080–082 pendientes. Alta de mortandad aún no implementada; motor/API/BE03–BE08 pendientes |
| Recuperación de superficie 083 | [Problema, alcance y orden](pa-superficie-083-recuperacion.md), [cotejo territorial y ensayo vigente](evidencia/pa-superficie-083-ubicacion-cotejada-2026-10-20.json) | Cierre aditivo que sustituye 080 en desarrollo, conserva la lectura territorial y contempla MAINTAIN; requiere comprobar despliegue del backend y aplicación SQL por separado |
| Impacto público y Mis registros INT05 | [Entrega](pa-int05-entrega-local.md), [contrato](pa-int05-contrato.md) y [ejemplos](pa-int05-ejemplos.json) | BE01–BE06 locales, migración081, proyección pública y propia, entorno3305; remoto y frontend separados |
| Identidad y privacidad A | [Cierre](pa-int02a-continuacion-2026-10-14.md) y [entrega inicial](pa-int02a-entrega-local.md) | JWT, perfil, grants y QA de desarrollo |
| Persistencia B | [Entrega](pa-int02b-entrega-local.md) | Vigencias/revisiones, bootstrap sintético y cotejo compacto de desarrollo |
| Gestión C | [Entrega](pa-int02c-entrega-local.md) | 14 rutas, comandos/lecturas, carreras y entorno local frontend |
| Corte y concurrencia INT02-D | [Entrega](pa-int02d-entrega-local.md), [compatibilidad](pa-int02d-compatibilidad.md) y [preview](pa-int02d-preview.md) | BE01–BE08 locales: 787 unitarios, 33 grupos SQL/28 carreras/25 HTTP; 077–080 y preview INT04, cotejo remoto separado |
| Registro participante INT03-A | [Entrega](pa-int03a-entrega-local.md) | Diez rutas nuevas, cargas privadas, LIFO/snapshots, PostGIS/Storage de prueba y recuperación |

[OpenAPI](pa-int02c-openapi.json) y [ejemplos HTTP](pa-int02c-ejemplos.json) son
artefactos generados. `evidencia/` identifica entorno, fecha y resultados; una salida
local no se convierte en remota por llevar un project-ref. Conservar esa procedencia.
Los informes que dicen «sin commit» describen su corte original: B/C se publicaron
posteriormente en `main`, commit `e9777f8`, el 15 de octubre. Push no acredita despliegue.
INT02-D tiene commit local de entrega `75a57eb` en `main`, del 17 de octubre;
las pruebas conservan la base `a045d9d` más árbol D del 16. Push, SQL remoto y despliegue de D pendientes.

La [revisión de ramas](revision-ramas-2026-10-14.md) es una fotografía histórica.
Para avances y pendientes actuales consultar `r3foresta-docs/ESTADO.md`.
