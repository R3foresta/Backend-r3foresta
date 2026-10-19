# Participación: integración y mantenimiento

**Corte documental: 19 de octubre de 2026. INT05 verificada en alcance técnico local.**
[Contrato/matriz](../../docs/pa-int05-contrato.md), [ejemplos](../../docs/pa-int05-ejemplos.json), [entorno/consolidación](../../docs/pa-int05-entrega-local.md) y [versiones de entrega](../../../r3foresta-docs/ESTADO.md). Push, aplicación SQL y despliegue de INT05 pendientes; el corte original de pruebas conserva la base `10e5dc5`.
Base original de las pruebas: `a045d9d` más árbol INT02-D del 16 de octubre. Push, SQL remoto y despliegue de D pendientes.
Gestión y registro participante implementados; D aporta corte/locks/superficie y entrega el entorno sintético para INT04. No acredita aplicación remota ni despliegue.

## Contrato que debe usar el cliente

[OpenAPI generado](../../docs/pa-int02c-openapi.json): **30 rutas / 65 schemas**.
[Ejemplos HTTP](../../docs/pa-int02c-ejemplos.json): resultados de Nest con PostgreSQL
sintético, sin tokens. Swagger completo en `/api/docs`; JSON en `/api/docs-json`.

| Grupo | Rutas bajo `/api/v1` |
|---|---|
| Capacidades / miembros | `GET /participacion/capacidades`, `GET /subcampanias/:id/miembros-participacion` |
| Selección de personas / revisión | `POST /participacion/personas/buscar`, `POST /participacion/accesos/revisar` |
| C04–C09 | `POST /participacion/accesos/{otorgar-plantador,retirar-plantador,designar-administrador,administrador-a-plantador,retirar-administrador,reemplazar-administrador}` |
| Autoridad global | `GET /usuarios/:id/autoridad`, `POST /usuarios/:id/roles`, `POST /usuarios/:id/inactivaciones` |
| Recuperación propia | `GET /participacion/comandos/:comando_id?operacion=...` |

Las rutas privadas requieren Bearer de WebAuthn; Impacto público no lo exige. BIGINT y revisiones son cadenas; actor/rol vienen
del servidor. Afiliación y logística no conceden permisos. ADMIN global tiene
acceso derivado; administrador contextual incluye plantar, sin dos vigencias simultáneas.
Gestión de administradores/roles/bajas requiere ADMIN global. Comprobar acción,
ámbito, estado, actividad y revisión; una selección de varios ámbitos es todo-o-nada.

Conservar **actor + operación + UUID + intención** mientras no haya resultado
concluyente. Replay terminal devuelve lo confirmado entonces, incluso tras retiro;
no representa autoridad actual. Otra intención con la misma clave da conflicto.
`SIN_CAMBIOS` también valida autoridad/revisión. GET terminal da 200; PREPARADO da
202/SIN_RESULTADO con Retry-After; ausencia propia da 404 inconcluso. Timeout o error
de infraestructura no habilita clave nueva. Reconsultar capacidades después del terminal.

## Integración local sin servicios externos

```sh
npm ci
npm run preview:participacion
```

Requiere binarios PostgreSQL locales y locale UTF-8 con case folding Unicode.
Arranca DB sin TCP y API en `http://127.0.0.1:3302`, sin leer `.env` ni conectar
Supabase. Reiniciar resetea datos y renueva el secreto. No asumir que una instancia
anterior siga activa. Consultar `/__fixture` para perfiles/tokens sintéticos actuales;
OpenAPI de fixture en `/__fixture/openapi.json`. Nunca guardar esos tokens en Git.
Para la PWA: `VITE_API_URL=http://127.0.0.1:3302` sin agregar `/api`.

Ofrece admin/admin2, gestora, plantador, voluntario, inactivo, gestor-ajeno y logística;
los ámbitos cubren ACTIVA propia/ajena, COMPLETADA, BORRADOR, CANCELADA y PAUSADA.
Revisiones y permisos cambian al usarlo; obtener el estado actual antes de confirmar.
No incluye login WebAuthn, perfil, Impacto, fotos, plantación o stock.
`__fixture` existe sólo en este launcher, fuera de AppModule.

```sh
npm run preview:participacion -- --check --evidence /tmp/pa-preview.json
```

Ese modo verifica HTTP y limpia el entorno al terminar. [Pruebas](../../test/README.md).

## Dónde cambiar código

| Pieza | Fuente |
|---|---|
| Controllers/services, DTO, canonicalización y recibos | `src/participacion/` |
| Identidad, actividad y audiencia interna | `src/auth/verified-actor.guard.ts`, `internal-actor.guard.ts` |
| Persistencia B / comandos y lecturas C | `migrations/068`–`073` (archivos completos en migrations) |
| Contrato consumible y Swagger generado | [Generador](../../scripts/qa/pa-int02c-openapi.cjs) |
| Evidencia DB/HTTP y carreras | [Runner C](../../scripts/qa/pa-int02c-db-test.py) |

Después de cambiar el contrato: `npm run docs:participacion` y
`node scripts/qa/pa-int02c-openapi.cjs --check`. Los ejemplos ejecutados los regenera
el runner DB/HTTP. Revisar los cambios de evidencias antes de incluirlos en Git.

## Estado y límites

INT03-A extiende el contrato con contexto/participantes, preparación/cargas,
registro inicial LIFO y detalle propio: [guía de entrega a INT04](../../docs/pa-int03a-entrega-local.md).
INT03-A añadió diez rutas a C (24 en ese corte); D incorpora imagen binaria pública, para 25 rutas actuales. Las cargas usan exclusivamente
multipart, bucket privado, lease/generación y derivados sanitizados; el GET
común recupera PREPARADO/terminal tras retiro. Registrar no vuelve a descontar
Vivero. [Conciliación del día de entregas](../../docs/pa-int03a-conciliacion-entregas.md).

B: 068–071 confirmadas aplicadas en desarrollo; estado SQL compacto y REST cotejados.
C: 072/073 confirmadas aplicadas; REST comprobó superficie y validación temprana.
Cotejo completo de cuerpos/catálogo remoto C y despliegue externo pendientes.
[Informe B](../../docs/pa-int02b-entrega-local.md) y [C](../../docs/pa-int02c-entrega-local.md)
conservan entorno, pruebas y límites; [estado canónico](../../../r3foresta-docs/ESTADO.md).

Los ensayos B/C usan antecedente mínimo post-067, no replay completo ni PostGIS/Storage.
El ensayo INT03-A añade PostGIS real y Storage privado de archivos sintéticos;
no acredita las políticas del Storage remoto ni el corte de INT02-D.
`service_role` sigue privilegiado: continuidad probada entre RPC cooperativas,
no ante SQL/importaciones que omiten sus locks. Mantener cuentas → ámbitos.

Pendientes: manifest real revisado y transición B; cotejo remoto/conciliación
de entregas INT03-A; aplicación/cotejo remotos y corte real INT02-D; QA integrado y piloto.
D verificó BE01–BE08 localmente: 787 unitarios, 33 grupos SQL, 28 carreras y 25 HTTP.
La gestión C anticipó el motor común sin fotos y no completa esos recorridos.
Instalar 071 no asigna permisos. No ejecutar fixtures en Supabase ni reaplicar SQL
por la mera falta de evidencia; cotejar primero el entorno y las versiones.

## INT05: consulta pública y Mis registros

`GET /api/v1/impact/global`, `/campanias/:id`, `/subcampanias/:id` y `/registros/:id`
son públicos incluso con sesión vencida. No consultan perfil/capacidades.
`GET /api/v1/plantaciones/mis-registros` exige JWT y cuenta activa: unión paginada
por autoría/participación histórica, incluso tras retiro operativo.
Los IDs nuevos son cadenas, los filtros estrictos y el JSON usa `no-store`;
las respuestas privadas conservan `private, no-store` y `Vary: Authorization`.

Usar `npm run preview:impacto -- --pg-bin /ruta/runtime-postgis/bin` en `127.0.0.1:3305`.
Conserva los flujos sintéticos INT04 y añade 30 + 20 = 50 iniciales, 125%,
ámbitos ocultos y snapshots/fotos/autor retirado. La migración081 es aditiva de
lectura, con RPC privadas; no aplicarla al remoto sin cotejar destino074–080.
Consultar [contrato](../../docs/pa-int05-contrato.md) para paginación/filtros,
indicadores y campos por audiencia; [entrega](../../docs/pa-int05-entrega-local.md) para reproducir.

## INT02-D: corte y entorno integrado

[Informe D](../../docs/pa-int02d-entrega-local.md), [compatibilidad](../../docs/pa-int02d-compatibilidad.md)
y [preview INT04](../../docs/pa-int02d-preview.md). Usar
`npm run preview:participacion-d -- --pg-bin /ruta/postgis/bin`; reúne registro,
plan/lifecycle, reposición y fotos privadas/públicas con DB real aislada.
Inicial/GET contexto legados dan409; upload/descarte internos requieren ámbito y
`es_reposicion:true`. La reposición conserva rol interno/equipo y exige origen propio.

`PARTICIPACION_INICIAL_ESCRITURA_HABILITADA=false` por omisión pausa nuevos POST sin
rechazo durable:503 RESULTADO_NO_DETERMINADO/MISMA_CLAVE. GET/cargas y replay terminal
siguen disponibles; habilitar expresamente solo tras pausa/drenaje/cotejo del destino.
Nuevos derivados e imágenes antiguas elegibles se sirven anónimamente como JPEG
sanitizado en `/api/v1/impact/imagenes/:id`; nunca original ni pendiente.

077 toma campaña antes de subcampaña en entrega/devolución/cancelación individual;
seis carreras adicionales con FKs reales verifican ambos órdenes frente a desactivación masiva.

080 no habilita RLS ni concede DML al servicio: revoca solo diez tablas/una vista y
DML de cuatro catálogos del alcance autorizado. Preflight verifica fuera de alcance
`subcampania_meta_especie`, campaña/organizaciones, DML de `campania_estado`, otras
vistas/definers y membresías; aborta ante exposición sin modificar esos objetos.
`statement_timeout=30s` debe existir antes de la sentencia (067/hoisting PostgREST);
`SET` interno por sí solo no demuestra cancelación. La evidencia D mide30s/5s en
conexión limpia con configuración previa; versión/configuración REST remota se cotejan aparte.
