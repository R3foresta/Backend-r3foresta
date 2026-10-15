# Guías de implementación y consumo

Entrada principal del repositorio: [README.md](../README.md). Arquitectura y límites actuales: [ARCHITECTURE.md](../ARCHITECTURE.md). Reglas de producto y estado por entorno: [r3foresta-docs](https://github.com/R3foresta/r3foresta-docs).

## Contratos vigentes de participación

| Tema | Fuente |
|---|---|
| Alta/passkeys/JWT | [WebAuthn](frontend/webauthn.md) y [código de autenticación](../src/auth/auth.service.ts) |
| Perfil propio, afiliación y compatibilidad de usuarios | [Usuarios](frontend/modulos/usuarios.md) |
| Capacidades, miembros, búsqueda, comandos y rol/baja | [Entrega INT02-C](../docs/pa-int02c-entrega-local.md), [OpenAPI](../docs/pa-int02c-openapi.json) y [ejemplos HTTP](../docs/pa-int02c-ejemplos.json) |
| Arranque sintético, verificación y SQL aplicado/informado | [Informe de C](../docs/pa-int02c-entrega-local.md) y [pruebas](../test/README.md) |

`docs/` conserva informes y evidencia fechada; `documentacion/` contiene guías de consumo. No duplicar allí otra especificación completa. El OpenAPI de C se genera desde `scripts/qa/pa-int02c-openapi.cjs`; no editar sus salidas manualmente.

## Otros módulos y referencias

- [Referencia general HTTP](frontend/api-reference.md).
- M1: [Recolecciones](modulos/recolecciones.md) y [guía frontend](frontend/recolecciones.md).
- M2: [Lotes de Vivero](modulos/lotes-vivero.md), [frontend](frontend/lotes-vivero.md) y [asignación física M2→M3](frontend/guia-migracion-asignacion-fisica.md).
- M3: [Campañas](frontend/modulos/campanias.md), [Subcampañas](frontend/modulos/subcampanias.md), [Plantaciones](frontend/modulos/plantaciones.md), [Organizaciones](frontend/modulos/organizaciones.md) e [Impacto](frontend/impact-portal.md).
- Catálogos: [Plantas](modulos/plantas.md), [Storage](modulos/plantas-storage.md) y [Ubicaciones](frontend/modulos/ubicaciones.md).
- Integraciones: [Pinata](modulos/pinata.md), [integración M1](modulos/pinata-integracion.md) y [Blockchain](modulos/blockchain.md).
- Consultas físicas: [desactivación masiva de Campaña](frontend/desactivacion-campania-cancelacion-masiva.md).
- Pruebas manuales: [índice Postman](postman/README.md).
- Contexto técnico: [flujo físico](arquitectura/flujo-end-to-end.md), [BD](arquitectura/base-de-datos.md), [ADR de saldo M1](arquitectura/adr/001-saldo-operativo-recoleccion.md) y [decisiones DB](arquitectura/adr/002-decisiones-db.md).
- [Tareas históricas](tareas/README.md): conservan decisiones y criterios de integración; no son el siguiente backlog de Participación aliada.

## Cómo interpretar las guías anteriores

Varias recetas por módulo preceden INT02-A/C y muestran `x-auth-id` o números para IDs. Para rutas privadas operativas se exige **Bearer verificado**; `x-auth-id` es opcional y sólo puede coincidir con la sesión. Los tipos de las rutas legadas se conservan, mientras participación v1 usa BIGINT/revisiones como cadenas. Confirmar siempre controller, DTO, guard y última RPC antes de copiar un ejemplo antiguo.

No tratar todos los GET como públicos ni proteger Impacto de forma indiscriminada. Las superficies privilegiadas aún sin guard y los límites de `service_role` se identifican en arquitectura. Un informe de prueba local no prueba despliegue o transición real.

Al cambiar un contrato actualizar su código, Swagger y la guía correspondiente; enlazar evidencia en el informe de entrega y actualizar el estado canónico cuando exista acreditación. Conservar las guías de dominio útiles; retirar ejemplos falsos y tutoriales duplicados en lugar de mantener dos contratos incompatibles.
