# Informes y evidencia

Para comenzar o integrar, usar el [README](../README.md) y la
[guía de participación](../documentacion/modulos/participacion.md).
Esta carpeta conserva resultados fechados; no es otro backlog ni una receta de despliegue.

| Entrega | Informe | Alcance |
|---|---|---|
| Registro inicial · avance previo por especie | [Contrato y orden de publicación](pa-contexto-registro-avance.md), [evidencia aislada](evidencia/pa-contexto-registro-local.json), [ejemplo](pa-contexto-registro-avance-ejemplo.json) | 086 local: acumulado inicial efectivo y pendiente orientativo; PWA tolerante y cotejo SQL de destino previos a activar contrato estricto. Sin despliegue. |
| Correcciones INT07 · motor/observaciones local | [Entrega y contrato consumible](pa-int07-motor-observaciones.md), [pruebas](evidencia/pa-int07-motor-local.json), [contrato completo](pa-int07-contrato.md), [cotejo084 aportado el22](evidencia/pa-int07-084-cotejo-2026-10-22.json) | 084: observaciones, contexto/historial privados y recuperación verificados localmente; Success reportado y catálogo aportado cotejado. Diferencias del antecedente030 frente al fixture documentadas; backend publicado/HTTP remoto pendientes. BE02/03 parciales; demás casos y frontend pendientes |
| Correcciones INT07 · participantes y lecturas | [Contrato y verificación](pa-int07-participantes.md), [evidencia aislada](evidencia/pa-int07-participantes-local.json) | 085: conjunto efectivo, alta/retiro/restauración histórica y audiencias propias/públicas. Aplicación/cotejo085 en destino, push, despliegue y HTTP remoto separados; no cierra todo INT07 |
| Recuperación de superficie 083 | [Problema, alcance y orden](pa-superficie-083-recuperacion.md), [cotejo completo del 21](evidencia/pa-int07-cotejo-desarrollo-completo-2026-10-21.json) | Success083/081/082 y Render/local reportados por Pablo; estructura/funciones/ACL cotejadas, incluidas 28 comprobaciones MAINTAIN y límites exactos de secuencias082. INT07 sigue parcial |
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
