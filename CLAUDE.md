# Guía de trabajo para agentes — Backend R3Foresta

## Antes de cambiar código

1. Leer [ARCHITECTURE.md](ARCHITECTURE.md).
2. Consultar el requerimiento y la regla de negocio vigentes en
   [`R3foresta/r3foresta-docs`](https://github.com/R3foresta/r3foresta-docs).
3. Confirmar el contrato real en controller, DTO, Swagger y última migración
   aplicable. No inferir campos a partir de una guía antigua.
4. Revisar `r3foresta-docs/ESTADO.md` antes de afirmar que algo está desplegado
   o aplicado en producción.

Idioma de trabajo: español para dominio, DTOs, enums, mensajes, Swagger y
documentación.

## Comandos

```bash
npm run start:dev
npm run build
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:p0
npm run test:e2e:db
npm run test:cov
```

`npm run lint` y `npm run format` escriben sobre el código. Integración y e2e
pueden usar servicios reales y escribir datos.

La API usa el prefijo `/api`; Swagger vive en `/api/docs`.

## Reglas de implementación

- Mantener delgado el service orquestador en los módulos por capas.
- Crear o extender un service de aplicación enfocado por caso de uso.
- Llevar reglas puras a `domain/policies/` y cubrirlas con unitarios.
- Tratar DTO, Swagger, documentación frontend y Postman como un único contrato.
- Una operación que conserva saldos entre varias filas debe ser una RPC
  PostgreSQL y tener pruebas de concurrencia.
- Cambiar juntos el service llamador y una nueva migración. No reescribir una
  migración ya desplegada para corregir producción.
- Recorrer las redefiniciones de RPC en orden: la última migración gana.
- Subir imágenes como `multipart/form-data`; nunca base64 en JSON.
- Mantener snapshots históricos; no recalcular identidad pasada desde maestros.
- Mantener eventos e historiales append-only.
- Propagar cambios de dominio a `r3foresta-docs` sin renumerar reglas.
- Actualizar `r3foresta-docs/ESTADO.md` solo con evidencia de implementación o
  despliegue.

## Invariantes de dominio

- Un lote de vivero tiene una única Recolección origen.
- `INICIO` no crea saldo vivo; `EMBOLSADO` lo inaugura.
- Antes de `EMBOLSADO`, una pérdida total es
  `DESCARTE_PRE_EMBOLSADO`, no `MERMA`.
- Asignar a una subcampaña es entregar físicamente: descuenta el lote en ese
  momento.
- Plantar consume `saldo_asignado_disponible`; no vuelve a descontar Vivero.
- `cantidad_asignada` es inmutable.
- Una devolución física aumenta `cantidad_devuelta` y repone el lote origen.
- `AUTOMATICO_PLANTACION` es legado y no admite nuevas escrituras.
- `COORDINADOR` es membresía de Subcampaña, no rol global.
- El estado de Campaña se deriva; no se persiste como columna.
- PostGIS es la autoridad para la validación GPS.

## Seguridad: no normalizar la deuda actual

- El JWT se emite, pero la mayoría de rutas usa `x-auth-id` sin guard global.
- CORS no autentica.
- No añadir endpoints que confíen en `x-user-role`.
- No copiar el fallback actual de `JWT_SECRET`.
- No exponer nuevas operaciones de Pinata, wallet o blockchain sin
  autenticación y autorización.
- No registrar secretos, payloads WebAuthn completos ni datos sensibles.

Los P0 y el drift de migraciones están detallados en `ARCHITECTURE.md`.
