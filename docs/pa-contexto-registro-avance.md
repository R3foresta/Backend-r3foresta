# Avance previo por especie en registro inicial

**Corte local:** 26 de octubre de 2026. Contrato candidato para coordinar con la PWA; la migración 086, el backend y el OpenAPI quedan sujetos a cotejo y despliegue por entorno. No acredita aplicación SQL remota ni publicación.

`GET /api/v1/subcampanias/:id/contexto-registro` conserva su autorización, errores y envelope. Cada objeto de `data.especies` añade obligatoriamente `plantado_inicial` y `pendiente_meta`, ambos enteros no negativos. [Ejemplo reducido](pa-contexto-registro-avance-ejemplo.json) y [OpenAPI generado](pa-int02c-openapi.json).

- `plantado_inicial`: suma efectiva de plantaciones iniciales de la misma subcampaña y especie, de cualquier responsable. Excluye reposiciones. Parte de los detalles originales y aplica créditos adicionales y compensaciones INT07 por especie; no suma dos veces los originales revertidos ni deduce el avance del stock. No cuenta preparaciones o comandos rechazados.
- `pendiente_meta`: `max(0, cantidad_objetivo vigente - plantado_inicial)`. Es orientativo: puede ser cero con stock positivo y no limita la cantidad propuesta.
- Plan, saldo y acumulado se agregan en una sola lectura SQL tras la autorización de ámbito. La subcampaña se bloquea `FOR SHARE` en `pa_r_ambito_leer`; las RPC cooperativas de plan, registro y corrección bloquean ese ámbito antes de escribir. Se revalidan plan y stock al confirmar.

## Orden de publicación

1. Publicar primero una PWA cuyo validador de `data.especies[]` acepte los dos campos como opcionales. El validador actual en `src/modules/participacion/api/registro.contract.ts` rechaza campos desconocidos.
2. Desplegar este backend con `PARTICIPACION_CONTEXTO_AVANCE_REQUERIDO` ausente o `false`. Su validador admite la forma anterior o la ampliada completa; nunca admite un solo campo ni especies mezcladas.
3. Cotejar el catálogo destino, aplicar 086 después de 082–085 y verificar el GET real autorizado, stock cero y relectura tras un registro confirmado. Entonces configurar `PARTICIPACION_CONTEXTO_AVANCE_REQUERIDO=true` para exigir el contrato ampliado del OpenAPI.
4. Publicar la PWA que exige ambos campos y muestra avance previo más cantidad propuesta, rotulada como propuesta hasta confirmar.

El endpoint legado sigue retirado. No se exponen IDs de lotes/asignaciones ni datos de otras personas. Para INT07 cantidades/reversiones, que aún no tienen ejecutor completo en este corte, la lectura usa el ledger efectivo definido en [contrato INT07](pa-int07-contrato.md); se requiere prueba end-to-end de esas RPC cuando se implementen.

## Verificación local

`npm run build`, `npm run test:unit -- --runInBand` (72 suites, 1002 pruebas) y `node scripts/qa/pa-int02c-openapi.cjs --check` pasaron. `python3 scripts/qa/pa-contexto-registro-test.py --pg-bin /ruta/postgis/bin --evidence docs/evidencia/pa-contexto-registro-local.json` pasó con PostgreSQL 14.24 y PostGIS 3.2.10, en un clúster desechable sin TCP ni `.env`: dos especies sin registros/stock, confirmaciones sucesivas, meta cubierta/excedida, rechazo y preparación, reposición excluida, compensación y reversión total de lectura, stock cero, privacidad y espera real de lock antes de observar plan/saldo nuevos. [Evidencia aislada](evidencia/pa-contexto-registro-local.json). El runtime proviene del preparador del repositorio con SHA256 verificado. Las correcciones `CANTIDAD` y `REGISTRO_ERRONEO` son fixtures de proyección que habilitan esas operaciones solo dentro del clúster aislado; INT07 todavía no tiene esos ejecutores, por lo que no acredita sus transacciones reales. Tampoco acredita datos/catálogo del destino, push ni despliegue.
