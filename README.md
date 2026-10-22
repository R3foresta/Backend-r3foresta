# Backend R3Foresta

API NestJS/Supabase para trazabilidad: **Recolección → Vivero → entrega física → Plantación**.
Estado documental al **19 de octubre de 2026**: INT05 BE01–BE06 implementadas y verificadas localmente; el corte original de pruebas conserva la base `10e5dc5`.
[Contrato, entorno y consolidación](docs/pa-int05-entrega-local.md), [versiones de entrega y pendientes](../r3foresta-docs/ESTADO.md). SQL remoto, push, despliegue y piloto pendientes.

## Empezar

```sh
npm ci
cp .env.example .env
# Completar la configuración privada antes de arrancar.
npm run start:dev
```

Node/npm compatibles con el lockfile; la última verificación usó Node 24.19.0.
`package.json` todavía no fija `engines`. Para el backend completo se requieren
Supabase, JWT, Pinata y blockchain: estos módulos se inicializan al arrancar.
`JWT_SECRET` es obligatorio, sin fallback. `SUPABASE_SERVICE_ROLE_KEY` es
necesaria para identidad, operaciones privadas y RPC; nunca va a la PWA.
Las variables y opcionales `HOST`, `PORT`, `CORS_ORIGINS` y `UBICACION_VIEW_NAME`
están en [.env.example](.env.example).

| Servicio local | URL |
|---|---|
| API general / participación | `http://localhost:3000/api` / `/api/v1` |
| Swagger / contrato JSON | `http://localhost:3000/api/docs` / `/api/docs-json` |
| Salud del proceso, sin dependencias externas | `http://localhost:3000/health` |

Para integrar gestión de acceso **sin credenciales ni Supabase**, ejecutar
`npm run preview:participacion`. Entrega una API sintética en `127.0.0.1:3302`;
ver [guía de participación](documentacion/modulos/participacion.md).
Para integrar INT04 con registro, reposición interna y fotos/PostGIS reales,
usar `npm run preview:participacion-d -- --pg-bin /ruta/runtime-postgis/bin`
en `127.0.0.1:3303`; [fixture y verificación](docs/pa-int02d-preview.md).
Para Impacto global/campaña/subcampaña/registro y «Mis registros», usar
`npm run preview:impacto -- --pg-bin /ruta/runtime-postgis/bin` en `127.0.0.1:3305`;
[contrato INT05 y fixture](docs/pa-int05-entrega-local.md).
La escritura inicial del backend normal requiere
`PARTICIPACION_INICIAL_ESCRITURA_HABILITADA=true` explícito tras el corte;
por omisión se pausa y conserva recuperación/terminales.


## Verificar un cambio

```sh
npm run build
npm run test:unit -- --runInBand
```

[Pruebas](test/README.md) distingue unitarios, PostgreSQL aislado y suites con
escrituras externas. `npm run lint` y `npm run format` modifican archivos.

## Documentación esencial

| Necesidad | Entrada |
|---|---|
| Trabajar en el repositorio | [AGENTS.md](AGENTS.md) |
| Entender límites, seguridad y datos | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Integrar permisos, roles y recuperación | [Participación](documentacion/modulos/participacion.md) |
| Consultar módulos y recetas | [Índice técnico](documentacion/README.md) |
| Revisar migraciones y pruebas de una entrega | [Informes y evidencias](docs/README.md) |
| Reglas de producto y avance entre equipos | [r3foresta-docs](https://github.com/R3foresta/r3foresta-docs) |

## Qué está listo y qué falta

B/C implementan permisos contextuales y gestión; INT03-A publicó registro v1,
cargas privadas, consumo LIFO y snapshots. INT02-D completó BE01–BE08 localmente: migraciones 077–080,
orden compartido con plan/físicas/lifecycle, corte inicial legado409, reposición
con origen propio y evidencias privadas, foto pública sanitizada y cierre de
superficie reducido autorizado. [Informe, evidencia y límites](docs/pa-int02d-entrega-local.md).
SQL aplicado, cotejo remoto, publicación y despliegue son hechos distintos.

INT05 añade proyecciones públicas sin sesión, snapshots y seguimiento por grupo,
lista propia histórica paginada y migración de lectura 081. Los aliases de Impacto
comparten elegibilidad y fotos sanitizadas; [contrato](docs/pa-int05-contrato.md).

INT07 añade localmente motor/recuperación y corrección de observaciones con084,
contexto/historial privados y lectura propia efectiva. [Entrega y pruebas](docs/pa-int07-motor-observaciones.md).
Participantes, cantidades y reversiones siguen pendientes. Pablo reporta084 con
Success y catálogo aportado cotejado el22; publicación/despliegue del backend y HTTP remoto pendientes.

Las rutas privadas cubiertas usan **Bearer JWT verificado**, cuenta activa y
políticas de servidor; `x-auth-id` no autentica. Impacto conserva su audiencia
pública. Permanecen superficies legadas y deuda de despliegue/migraciones
identificadas en [arquitectura](ARCHITECTURE.md#pendientes-materiales).
