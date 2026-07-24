# Backend R3Foresta

API REST de trazabilidad forestal construida con NestJS y Supabase. Modela la
cadena completa:

```text
Recolección → Lote de vivero → Asignación física → Plantación
```

Incluye evidencia en Supabase Storage, metadata NFT en Pinata/IPFS y anclaje
blockchain de recolecciones validadas.

## Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md): arquitectura implementada, invariantes,
  límites transaccionales y riesgos.
- [documentacion/README.md](documentacion/README.md): índice de contratos,
  guías de frontend, Postman y decisiones del backend.
- [test/README.md](test/README.md): estructura y alcance de pruebas.
- [R3foresta/r3foresta-docs](https://github.com/R3foresta/r3foresta-docs):
  requerimientos, reglas de negocio, contratos entre módulos, esquema canónico
  y estado de despliegue.

Si una guía contradice el contrato de producto, revisar el orden de fuentes de
verdad definido en `ARCHITECTURE.md`.

## Requisitos

- Node.js compatible con ES2023.
- npm.
- Proyecto Supabase con las migraciones requeridas.
- Credenciales de Pinata y blockchain: en la implementación actual ambos
  módulos se inicializan al arrancar la aplicación.

Copiar `.env.example` a `.env` y reemplazar todos los valores de ejemplo. No
usar el fallback de `JWT_SECRET` en producción.

## Instalación y ejecución

```bash
npm install
npm run start:dev
```

La API queda, por defecto, en `http://localhost:3000/api` y Swagger en
`http://localhost:3000/api/docs`.

Comandos:

```bash
npm run build
npm run start:prod
npm run lint
npm run format
```

`npm run lint` y `npm run format` modifican archivos.

## Pruebas

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:p0
npm run test:e2e:db
npm run test:cov
```

Integración y e2e pueden depender de Supabase real y escribir datos. Revisar
`test/README.md` y las variables de entorno antes de ejecutarlas.

## Variables de entorno

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_KEY` | Cliente Supabase usado por la mayoría de servicios |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones administrativas/RPC restringidas |
| `JWT_SECRET` | Firma de tokens emitidos por WebAuthn |
| `PINATA_JWT` | Escritura de metadata en Pinata |
| `GATEWAY_URL` | Gateway IPFS |
| `RPC_URL` | Nodo blockchain |
| `PRIVATE_KEY` | Wallet firmante del backend |
| `CONTRACT_ADDRESS` | Contrato NFT |
| `CORS_ORIGINS` | Orígenes adicionales separados por coma |
| `UBICACION_VIEW_NAME` | Vista alternativa de ubicaciones, opcional |
| `PORT` | Puerto HTTP, por defecto `3000` |

Nunca publicar `.env`, `PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`PINATA_JWT` ni `JWT_SECRET`.

## Advertencia de seguridad

El backend emite JWT, pero gran parte de la API todavía identifica al solicitante
mediante `x-auth-id` sin validar globalmente el token. Además existen endpoints
de diagnóstico e integración privilegiada sin guard. Esta situación está
registrada como P0 en `ARCHITECTURE.md`; no se debe considerar `x-auth-id` un
mecanismo suficiente para clientes no confiables.
