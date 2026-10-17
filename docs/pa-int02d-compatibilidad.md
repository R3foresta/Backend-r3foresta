# PA-T-INT02-D — Compatibilidad de plantación y evidencias

Verificación técnica local: 16 de octubre de 2026, base `a045d9d` más árbol INT02-D. Entrega Git posterior: commit local `75a57eb` en `main`, del 17 de octubre; push pendiente. Esta guía describe el contrato que recibe INT04; no acredita aplicación/cotejo remoto de 077–080, despliegue ni habilitación de participantes reales.

## Matriz final BE01–BE02

Revisión estática del árbol local recibido el 16 de octubre. Contrasta el
[inventario fechado del 13](../../r3foresta-docs/specs/plantacion/participacion-aliada/inventario-endpoints-y-regresion-participacion.md)
con los controllers/consumidores actuales; no reescribe sus 121 filas históricas.
Las filas agrupan entradas con la misma frontera. Todas las rutas llevan `/api`
salvo `/health`; `v1` se indica expresamente. «Interno» significa JWT verificado,
cuenta activa y rol ADMIN/GENERAL/VALIDADOR, más la política de cada acción.
El guard nunca convierte permiso contextual, afiliación o historia en ese rol.
«Admin» en cliente significa `getAdminClient()` privado del servidor, sin fallback.

| Rutas actuales o retiradas | Objeto / audiencia | Autoridad por objeto y compatibilidad | Función o consulta efectiva / cliente servidor |
|---|---|---|---|
| `GET /v1/participacion/capacidades` | Capacidades propias; privado | Cuenta activa; ADMIN deriva acceso global y el resto solo sus ámbitos vigentes. | `pa_capacidades_leer` / Admin. |
| `GET /v1/subcampanias/:id/miembros-participacion`; `POST /v1/participacion/personas/buscar`, `/v1/participacion/accesos/revisar` | Miembros mínimos/selección administrativa; privado | ADMIN global o administrador contextual de los ámbitos elegidos; rol/baja no se delegan a contexto. | `pa_miembros_participacion_leer`, `pa_personas_buscar`, `pa_accesos_revisar` / Admin. |
| `POST /v1/participacion/accesos/{otorgar-plantador,retirar-plantador,designar-administrador,administrador-a-plantador,retirar-administrador,reemplazar-administrador}` | Vigencias/revisiones/comando; privado | Operación, ámbito, estado, revisión y continuidad se revalidan en RPC. Gestión de administradores exige ADMIN global; incorporar/retirar plantador admite el administrador contextual autorizado. | `pa_acceso_ejecutar` / Admin. |
| `GET /v1/usuarios/:usuario_id/autoridad`; `POST /v1/usuarios/:usuario_id/{roles,inactivaciones}` | Autoridad global/cuenta; privado | ADMIN global; revisión y protección de administradores efectivos bajo locks. | `pa_autoridad_leer`, `pa_autoridad_ejecutar` / Admin. |
| `GET /v1/subcampanias/:id/{contexto-registro,participantes-seleccionables}` | Contexto mínimo y candidatos; privado | ADMIN global o permiso contextual vigente del ámbito ACTIVA. Equipo e historia no habilitan inicial; no devuelve IDs de lotes/asignaciones. | `pa_registro_contexto_leer`, `pa_registro_participantes_leer` / Admin. |
| `POST /v1/plantaciones/iniciales` | Inicial/comando/stock M3; privado | Actor de request; autorización y participantes vigentes, plan, fecha, evidencia propia y PostGIS revalidados en RPC. La pausa solo permite replay propio. | `pa_registro_inicial_ejecutar`; durante pausa `pa_c_replay` / Admin. |
| `POST /v1/participacion/comandos/preparaciones`; `PUT /v1/participacion/comandos/:comando_id/cargas/:carga_id`; `GET /v1/participacion/comandos/:comando_id/cargas`; `POST /v1/participacion/comandos/:comando_id/descarte-preparacion`; `GET /v1/participacion/cargas/:carga_id/preview` | Comando/cargas originales y derivados; privado | Propietario estricto, también frente a ADMIN; nuevas preparaciones/cargas revalidan ámbito/autoridad. Replay/listado/descarte/preview conservan su recuperación propia y estados de carga, sin conceder registro tras retiro. | `pa_cargas_operar`; Storage privado para upload/preview / Admin. |
| `GET /v1/participacion/comandos/:comando_id`; `GET /v1/plantaciones/:id/detalle-propio` | Terminal propio/hecho histórico; privado | Cuenta activa y propiedad del comando o autoría/participación histórica, aun tras retiro. ADMIN no obtiene comando ajeno; coresponsable no obtiene observaciones privadas del autor. | `pa_comando_recuperar`, `pa_registro_detalle_propio_leer` / Admin. |
| `POST /registros-plantacion` | Reposición interna; privado | Interno **y** equipo COORDINADOR/OPERARIO, también ADMIN; estado permitido, origen inicial del mismo ámbito, asignación REPOSICION y evidencia propia. Inicial ausente/false queda retirada con 409. | `fn_m3_registrar_plantacion` redefinida en077 / Admin. |
| `POST`, `DELETE /registros-plantacion/evidencias-pendientes` | Carga/descarte de reposición; privado | Interno/equipo/estado y ámbito/propósito explícitos; propiedad estricta en DB. Contrato antiguo sin contexto da409 antes de decoder/Storage. | `pa_d_evidencias_reposicion` (079), Storage `participacion_evidencias` / Admin. |
| `GET /subcampanias/:id/plantacion/context` | Alias inicial retirado; privado | Tras el guard interno devuelve409 `CLIENTE_INCOMPATIBLE`, sin consultar stock/equipo. Participante usa contexto v1. | `SubcampaniasPlantacionContextService.obtener`; sin IO de dominio. |
| `GET /subcampanias/:id/equipo`; `POST /subcampanias/:id/equipo`; `DELETE /subcampanias/:id/equipo/:usuarioId` | Logística interna; privado | GET interno y ámbito existente; mutaciones solo ADMIN, validando cuentas/roles/estado en RPC. Ni alta ni baja de equipo crean/retiran permiso contextual. | GET `subcampania`/`subcampania_equipo`; `pa_d_equipo_agregar`, `pa_d_equipo_quitar` (078) / Admin. |
| `GET`, `PUT /subcampanias/:id/plan` | Plan; privado | GET para cualquier cuenta activa (ADR-PLA-05); PUT solo ADMIN y estado/revisión permitidos. `ActiveAccountAudience` exceptúa el gate interno y no la identidad/actividad. | `fn_subcampania_obtener_plan`, `fn_subcampania_revisar_plan` (077) / Admin. |
| `POST /subcampanias/:id/{activar,cerrar,cancelar,poligono}`; `PATCH`, `DELETE /subcampanias/:id`; `POST /campanias/:id/desactivar` | Ciclo de vida/geometría; privado | Guard interno y ADMIN por acción, objeto/estado revalidados en RPC; sin reapertura ni permiso derivado del equipo/contexto. | `pa_d_subcampania_{activar,cerrar,editar,borrar}` y `fn_subcampania_setear_poligono` (078); `fn_subcampania_cancelar`, `fn_campania_desactivar_sin_plantaciones` (077) / Admin. |
| `POST /lotes-vivero/:id/asignaciones`; `POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion` | Entrega/devolución física; privado | Interno y ADMIN global o COORDINADOR del ámbito; objeto, estado, propósito/origen y saldos bajo locks. Plantación consume M3; devolución repone Vivero. | `fn_vivero_asignar_stock_subcampania`, `fn_m3_devolver_asignacion_vivero` (077, sustituyen060/076 y054) / Admin. |
| `GET /campanias` y sus detalles/subcampañas/métricas/actividad/preview; `GET /subcampanias` y detalle; `GET /lotes-vivero` y stock/saldos/asignaciones/timeline | Proyecciones operativas internas; privado | Guard interno; no se reutilizan para el contexto participante ni se abren por historia propia. Mutaciones conservan sus reglas de rol/responsabilidad. | Consultas de relaciones cerradas por080 mediante Admin: `CampaniasMetricsService`, `CampaniasConsultasService`, `CampaniasDesactivacionService`, `ViveroSaldosService` y servicios de subcampañas. Relaciones públicas ajenas al inventario conservan su cliente previo. |
| `POST /evidencias-trazabilidad/recolecciones/:recoleccionId`; `GET /evidencias-trazabilidad`, `/entidad/:tipoEntidadCodigo/:entidadId`, `/recolecciones/:recoleccionId`, `/:id` | Evidencias generales internas; privado | Guard interno. Listado y aliases excluyen bucket privado, namespace legado de pendientes y entidad sin vínculo; por ID aplica el mismo cierre. El upload queda restringido a tipo RECOLECCION fijado en servidor. | `EvidenciasTrazabilidadService` / Admin; `getPublicUrl` solo en evidencia general admitida, nunca carga privada v1/reposición. |
| `GET /v1/impact/organizations`; `/organizations/:organizationId/{dashboard,monitoring-timeline,evidence}`; `/organizations/:organizationId/campaigns/:campaignId` | Proyección pública de Impacto | Sin JWT/cuenta/contexto. Organización/campaña elegible, datos reducidos y enlaces de imagen públicos; no stock, pendientes, originales ni contactos. Son las cinco rutas de consulta existentes; esta matriz no inventa endpoints futuros de PA-S02. | Consultas reducidas de `ImpactService` / Admin solo en servidor. |
| `GET /v1/impact/imagenes/:evidenciaId`; `GET /v1/impact/fotos/:evidencia_id` | Fotografía elegible; público | Sin JWT. Elegibilidad DB antes de Storage; pendiente/no elegible404. Imagen devuelve JPEG sanitizado; fotos conserva JSON de URL temporal del derivado. | `pa_foto_publica`, `pa_d_foto_legada_publica` (079); Storage/decoder / Admin. |

Fuentes de la matriz: [guards](../src/auth/internal-actor.guard.ts),
[lecturas](../src/participacion/participacion-lecturas.controller.ts),
[comandos](../src/participacion/participacion-comandos.controller.ts),
[registro](../src/participacion/participacion-registro.controller.ts),
[cargas/foto JSON](../src/participacion/cargas/participacion-cargas.controller.ts),
[subcampañas/plan/equipo](../src/subcampanias/api/subcampanias.controller.ts),
[reposición](../src/plantaciones/api/plantaciones.controller.ts),
[filtro de evidencia general](../src/evidencias-trazabilidad/evidencias-trazabilidad.service.ts),
[Impacto](../src/impact/impact.controller.ts) e
[imagen](../src/impact/impact-imagen.controller.ts).
Identidad/perfil conservan su cierre B/C: alta VOLUNTARIO por servidor,
`VerifiedActorGuard` en perfil propio/selector mínimo y directorio legado solo
interno; `/auth/test-supabase` ya no existe en el controller actual.
Ceremonias WebAuthn, `/health`, raíz, catálogos GET y consultas públicas de cadena
conservan su audiencia; no hay guard global.

Las trece entradas adicionales autorizadas están enumeradas sin ampliar080:

| Entrada exacta | Objeto / autoridad | Servicio / cliente servidor |
|---|---|---|
| `GET /test-db` | Diagnóstico; interno | `AppController.testDbConnection`, SELECT mínimo de `recoleccion.id` / `getClient()` previo, objeto fuera del inventario080. |
| `POST /pinata/upload-json` | Publicación Pinata; interno | `PinataService.uploadJson` / servicio externo. |
| `POST /blockchain/mint` | Mint; interno | `BlockchainService.mintNFT` / servicio externo. |
| `GET /blockchain/wallet` | Diagnóstico wallet; interno | `BlockchainService.getWalletBalance` / servicio externo. |
| `GET /blockchain/contract-info` | Diagnóstico contrato; interno | `BlockchainService.getContractInfo` / servicio externo. |
| `POST /plantas` | Alta catálogo; interno | `PlantasService.crear` / Admin. |
| `POST /plantas/tipos-planta` | Alta tipo; interno | `PlantasService.crearTipoPlanta` / Admin. |
| `PATCH /plantas/:id` | Edición catálogo; interno | `PlantasService.actualizar` / Admin. |
| `PATCH /plantas/:id/desactivar` | Baja catálogo; interno y reglas de dependencias | `PlantasService.desactivar` / Admin. |
| `POST /comunidades` | Alta comunidad/división; interno | `ComunidadesService.crear` / Admin. |
| `PATCH /comunidades/:id` | Edición comunidad/división; interno | `ComunidadesService.actualizar` / Admin. |
| `PATCH /comunidades/:id/desactivar` | Baja comunidad/división; interno | `ComunidadesService.desactivar` / Admin. |
| `POST /ubicaciones/divisiones/flexible` | Alta/resolución de división; interno | `UbicacionesService.ensureFlexibleDivision` / Admin. |

Las pruebas de [superficie HTTP](../src/auth/pa-int02d-superficie.http.spec.ts)
usan controllers/guards/JWT reales y sustituyen DB/dominios externos: prueban401
sin token,403 VOLUNTARIO con header de rol falsificado, positivos internos y GET
públicos conservados; no ejecutan mint/Pinata reales.
[HTTP con DB/Storage](../test/db/pa-int02d-http.spec.ts) cubre las equivalencias
centrales, origen ajeno/propio, propiedad, pausa y foto histórica sanitizada;
los resultados/versiones están en el [informe D](pa-int02d-entrega-local.md).

La matriz HTTP no acredita denegación SQL. Firmas/sobrecargas y helpers de054/057/
060/061/062/076 se sustituyen/cierran en077;078 cierra lifecycle y079 evidencias.
080 se limita a las diez tablas, una vista y cuatro catálogos autorizados; el
[preflight](../scripts/sql/pa-int02d-superficie-preflight.sql) aborta ante vistas,
definers, membresías o grants fuera de ese inventario, sin corregirlos. El catálogo
destino, las ACL/grants indirectas y las políticas/URLs/CDN Storage remotas requieren
cotejo propio. `service_role` conserva su poder privilegiado: la garantía probada
es entre RPC cooperativas, no frente a SQL que omite sus locks. Esta revisión
documental no declara cierre global de D ni habilitación de participantes.

## Inicial y reposición

| Entrada | Contrato vigente | Contrato anterior |
|---|---|---|
| `POST /api/registros-plantacion` | Solo reposición con `es_reposicion:true`, origen inicial del mismo ámbito, asignaciones REPOSICION, evidencias propias privadas. JWT + ADMIN/GENERAL/VALIDADOR, equipo COORDINADOR/OPERARIO y estados ACTIVA/COMPLETADA/FINALIZADA_PARCIAL. | Inicial ausente/false: `409 CLIENTE_INCOMPATIBLE` antes de consultas del servicio o RPC. |
| `GET /api/subcampanias/:id/plantacion/context` | Retirado. Inicial usa `GET /api/v1/subcampanias/:id/contexto-registro`. | `409 CLIENTE_INCOMPATIBLE`, sin leer stock/equipo. |
| `POST /api/registros-plantacion/evidencias-pendientes` | Multipart `subcampania_id` entero, `es_reposicion:true`, `fotos` 1..10; opcionales `titulo`, `descripcion`, `tomado_en`, `es_principal`. Solo autoridad interna/equipo/estado anterior. 10 MiB/foto, formatos JPG/PNG/WEBP/HEIC/HEIF decodificables. | Sin ámbito/propósito o inicial: `409 CLIENTE_INCOMPATIBLE` antes de decoder/Storage. `metadata` libre: 400. |
| `DELETE /api/registros-plantacion/evidencias-pendientes` | JSON `{subcampania_id,es_reposicion:true,evidencia_ids:[...]}`. Tipo/ámbito/propiedad/pendencia verificados DB, también ADMIN. | Sin ámbito/propósito: `409 CLIENTE_INCOMPATIBLE`. |

Bearer JWT es obligatorio en entradas privadas. `x-auth-id` es opcional y debe coincidir con `sub`; el guard adapta el header desde identidad verificada. `x-user-role` no autoriza. El frontend de inicial usa exclusivamente las cargas/comando v1 de INT03-A. El formulario interno de reposición debe añadir contexto al upload/descarte, mantener el origen del mismo ámbito y reutilizar `evidencia_ids` devueltos. La respuesta nueva de upload es `{success:true,data:[{id:string}],evidencia_ids:number[]}`: no devuelve originales/metadata/URL pública. Las vistas previas internas usan el archivo local seleccionado; no guardar URLs Storage antiguas como sustituto del nuevo contrato.

## Audiencias y fotografías

Nuevas fotos de reposición se almacenan en `participacion_evidencias` privado, namespace `reposiciones/<actor>/<subcampania>/<uuid>/original` y `/derivada.jpg`. El servidor conserva el original y genera JPEG sanitizado mediante `ParticipacionImagenService` antes de crear las evidencias. Metadata de autoridad, tipo, propósito, ámbito y derivado procede solo del servidor. La RPC 079 autoriza antes de IO y revalida bajo locks al crear/descarte. Nunca se permite la excepción ADMIN a la propiedad.

`GET /api/v1/impact/imagenes/:evidenciaId` es público, sin JWT ni cuenta, y devuelve bytes `image/jpeg` con `Cache-Control:no-store`. Impacto publica este enlace como `imageUrl`; puede usarse directamente en `<img>`. Para fotos nuevas solo descarga el derivado asociado a un registro elegible; para fotos históricas de `recoleccion_fotos`, `pa_d_foto_legada_publica` verifica primero tipo REGISTRO_PLANTACION, vínculo, campaña/subcampaña no eliminadas y estado público ACTIVA/COMPLETADA/FINALIZADA_PARCIAL, y después sanitiza sus bytes en memoria. No publica paths/URLs originales ni persiste/migra binarios históricos. Elegibilidad rechazada responde404 antes de Storage; Storage/decoder indisponible responde503, sin cambiar registros/stock.

`GET /api/v1/impact/fotos/:evidencia_id` conserva el contrato JSON de URL temporal para derivados nuevos de INT03-A; no se convierte en respuesta binaria. Las consultas de Impacto usan el cliente administrativo exclusivamente en el servidor para construir su proyección pública reducida, manteniendo el controller anónimo. Las rutas generales de evidencias excluyen bucket privado y namespace/pendientes legados incluso por ID. 080 implementa localmente el cierre de lectura SQL directa del inventario fijo de diez tablas/una vista y DML público de cuatro catálogos. Pablo autorizó esa variante reducida tras el rechazo automático del bloque amplio; no añade RLS ni nuevos grants al servicio. Preflight/postflight abortan sin corregir objetos fuera del inventario o privilegios heredados pendientes de revisión.

No se privatiza todo `recoleccion_fotos` ni se borran objetos históricos. Inventario remoto pendiente: políticas efectivas de Storage, enlaces `getPublicUrl` ya emitidos por versiones anteriores, URLs firmadas/publicadas/CDN y consumidores externos. Cambiar las nuevas respuestas no revoca URLs históricas; su conciliación pertenece al corte remoto y debe conservarse como pendiente hasta evidencia específica. Los uploads de Recolección conservan su alcance separado.

## Pausa, drenaje y versión

1. Mantener `PARTICIPACION_INICIAL_ESCRITURA_HABILITADA=false` (también por omisión) para pausar nuevos POST iniciales en el entorno destino y detener emisores/jobs del motor legado; mantener lecturas y GET/replay propios v1.
2. Esperar transacciones antiguas ya abiertas y comprobar que ninguna conserva `rp_seq` en el orden anterior; no iniciar escritura v1 en paralelo con esa 061.
3. Cotejar 074–076 ya aplicadas y Storage sin repetirlas por su sola confirmación; aplicar/cotejar aditivas077–080 en orden conforme su informe, solo después del preflight del destino; aplicación local no acredita aplicación remota.
4. Publicar servidor con rechazo inicial legado y PWA con motor v1 único. Ensayar HTTP/RPC/grants, reposición interna, fotos públicas, desconocimiento y replay con datos sintéticos.
5. Configurar `PARTICIPACION_INICIAL_ESCRITURA_HABILITADA=true` y habilitar escritura/piloto solo tras la evidencia y criterios de INT08 en destino.

Rollback posterior a retiros/cambios de autoridad mantiene inicial legada cerrada: pausar escrituras si hace falta y conservar recibos/cargas/lecturas. No reintroducir permiso contextual OR equipo ni reactivar autorizadores antiguos. Un error de transporte tras CREAR evidencia interna conserva objetos por incertidumbre del COMMIT; no se borran archivos que podrían haber quedado vinculados. El descarte registra tombstone antes de eliminar y permite reintentar limpieza sin borrar evidencia ajena/vinculada.

Con pausa, POST consulta únicamente `pa_c_replay` con huella calculada por el servidor: devuelve el terminal propio idéntico o409 por contenido distinto; ausencia/PREPARADO devuelve503 `RESULTADO_NO_DETERMINADO` (mensaje de pausa) con `resultado_concluyente:false` y `MISMA_CLAVE`, sin crear recibo de rechazo. GET, captura, cargas y descarte conservan su semántica previa; la pausa no clausura preparaciones ni habilita otra clave. Los launchers sintéticos habilitan expresamente el flag y no cargan configuración real.

`DetalleSubcampanaScreen` debe retirar el probe antiguo de contexto que descartaba su respuesta; conservar detalle y GET/PUT de plan según su audiencia. El formulario participante consume contexto v1 mínimo por especie y nunca reconstruye lotes/asignaciones desde IDs del fixture. OpenAPI generado contiene25 rutas/52 schemas; el nuevo endpoint binario de imagen es adicional al GET/fotos JSON vigente.
