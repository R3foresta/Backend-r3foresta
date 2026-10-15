# Trabajo en Backend R3Foresta

Trabajar en español y mantener los nombres e IDs del dominio.

## Lectura mínima

1. [README](README.md) y [arquitectura](ARCHITECTURE.md).
2. Requerimiento, contrato y estado en `../r3foresta-docs`; su tablero de
   participación está en `specs/plantacion/participacion-aliada/implementacion/README.md`.
3. Controller/DTO/service y última redefinición SQL de la operación a modificar.
   Para acceso contextual: [guía de participación](documentacion/modulos/participacion.md).

## Implementación

- Mantener delgado el orquestador; casos de uso en `application`, reglas puras
  en `domain/policies`. No reestructurar módulos planos sin necesidad.
- Actor desde `VerifiedActorGuard` o `InternalActorGuard`; nunca desde body,
  `x-user-role`, afiliación o un `x-auth-id` sin verificación. Impacto público
  no debe exigir cuenta. La autorización por objeto sigue siendo obligatoria.
- Usar `getAdminClient()` para datos/RPC privados, sin fallback al público.
- Conservar saldos, revisiones, auditoría y recibo en la misma transacción RPC;
  compartir el orden de locks. Probar concurrencia cuando se modifica esa garantía.
- Agregar migraciones aditivas; no reescribir SQL aplicado. Leer las redefiniciones
  en orden y comprobar catálogo destino. Un índice no protege al último administrador.
- No convertir equipo/organización/historia en permisos. No borrar snapshots,
  historiales, vigencias retiradas o claves terminales para permitir reuso.
- Plantar consume stock asignado y no vuelve a descontar Vivero. Imágenes por
  multipart, nunca base64 en JSON. PostGIS decide la validación geográfica.

## Verificación y entrega

Usar [test/README.md](test/README.md) para elegir comprobaciones proporcionales.
Build y unitarios son la entrada; los runners PostgreSQL B/C aíslan sus fixtures.
Integración/e2e pueden escribir en servicios reales; comprobar entorno antes de ejecutarlos.
`lint`/`format` escriben archivos. No registrar secretos, tokens ni datos personales.

Mantener DTO, Swagger y guía consumible alineados. En participación, actualizar el
[generador OpenAPI](scripts/qa/pa-int02c-openapi.cjs) y regenerar los artefactos;
`node scripts/qa/pa-int02c-openapi.cjs --check` detecta desajustes.
Registrar versión/entorno y límites; actualizar el estado canónico cuando corresponda.
No equiparar código, pruebas, SQL aplicado, push y despliegue. Mantener una entrada
breve y enlaces a evidencia; evitar duplicar planes o convertir informes históricos
sobre un entorno concreto en instrucciones vigentes para todos los entornos.
