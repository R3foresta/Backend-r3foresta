# T3 · Proyecciones exactas para la PWA

Complemento local del **5 de noviembre de 2026**, revisado el 6 de noviembre. Base `6f59263` más el árbol T1/T2 revisado. [Cierre coordinador](evidencia/t3-revision-coordinadora-2026-11-06.json), [correcciones frontend y límites](../../pwa-r3foresta/docs/QA_T3_CORRECCION_2026-11-06.md).

El cotejo para T3 encontró tres lecturas legadas que redondeaban IDs usados por el cliente. Se corrige sólo la proyección:

| Ruta | Proyección vigente |
|---|---|
| `GET /api/viveros` | `id::text`; catálogo público con ID decimal exacto. No concede permisos. |
| `GET /api/lotes-vivero` y `/:id` | `vivero_id::text`, `vivero.id::text`; el mapper conserva `vivero_id` exacto para capacidades por establecimiento. |
| `GET /api/subcampanias/:id/equipo` | `usuario_id::text`; mapper exacto para comprobar COORDINADOR sin redondear actores vecinos. |

No se agregan endpoints, roles ni capacidades M3; no cambian guards, RPCs o transacciones. El cliente conserva un adaptador explícito del editor de equipo legado para IDs numéricos seguros, separado de la lectura logística exacta. Las cuentas grandes no se convierten a Number para comprobar autoridad.

Cuatro regresiones nuevas comprueban catálogo/viveros/actor BIGINT vecinos. Verificación: `npm run build`, `npm run test:unit -- --runInBand` (88 suites/1.256 pruebas) y checks OpenAPI T2/T1/Participación aprobados. No se acredita lint global backend ni una nueva ejecución SQL/HTTP/PostGIS. La PWA usa un servicio HTTP sintético separado para su QA de navegador; no es una comprobación de autorización desplegada.

092–095 y las evidencias históricas se conservan, incluidas 094/095 congeladas. No hay SQL remoto, commit de entrega, push ni despliegue. T4/T5 no se inician.
