# Informes y evidencia

Para comenzar o integrar, usar el [README](../README.md) y la
[guía de participación](../documentacion/modulos/participacion.md).
Esta carpeta conserva resultados fechados; no es otro backlog ni una receta de despliegue.

| Entrega | Informe | Alcance |
|---|---|---|
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

La [revisión de ramas](revision-ramas-2026-10-14.md) es una fotografía histórica.
Para avances y pendientes actuales consultar `r3foresta-docs/ESTADO.md`.
