# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Backend REST API (NestJS 11 + TypeScript) for **Reforesta**, a forestry traceability system. Tracks material vegetal from field collection (`recolecciones`) through nursery batches (`lotes-vivero`) until dispatch, with photo evidence stored in Supabase Storage + Pinata/IPFS, plus on-chain anchoring of validated events via an ethers.js smart contract.

Primary persistence is **Supabase** (PostgreSQL + Auth + Storage). Authentication is **WebAuthn/passkeys** issuing a JWT; downstream endpoints identify the caller via the `x-auth-id` header (Supabase `auth_id`).

Spanish is the working language for code identifiers, DTOs, comments, swagger tags, and documentation — keep new code consistent with that convention.

## Commands

```bash
npm run start:dev          # watch-mode dev server on PORT (default 3000)
npm run start:prod         # run compiled dist/main.js
npm run build              # nest build → ./dist
npm run lint               # eslint --fix on src/, apps/, libs/, test/
npm run format             # prettier write
npm run test               # jest (rootDir: src, testRegex: .*\.spec\.ts$)
npm run test:watch
npm run test:cov
npm run test:e2e           # uses test/jest-e2e.json
npx jest path/to/file.spec.ts            # single test file
npx jest -t "name of test"               # single test by name
```

API mounts at `/api`. Swagger UI at `/api/docs` (uses `x-auth-id` apiKey scheme).

## Environment

Required env vars (see `.env.example`):
- `SUPABASE_URL`, `SUPABASE_KEY`, optionally `SUPABASE_SERVICE_ROLE_KEY` (admin client falls back to anon if missing — `src/supabase/supabase.service.ts`)
- `JWT_SECRET` (defaulted in code; **must override in prod**)
- `RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS` — required at boot by `BlockchainService`; the app will fail to start without them
- `PINATA_JWT`, `GATEWAY_URL`
- `CORS_ORIGINS` (comma-separated, optional — adds to the hardcoded localhost + `pwa-r3foresta.vercel.app` + any `*.vercel.app` subdomain)
- `PORT`

## Architecture

### Module layout
Each top-level feature is a Nest module under `src/`. Two of the core domains use a layered structure; the rest are flat (controller + service in the module root):

```
src/
├── app.module.ts                # composition root
├── main.ts                      # CORS, ValidationPipe (whitelist+transform), /api prefix, Swagger
├── supabase/                    # SupabaseService.getClient() / getAdminClient()
├── auth/                        # WebAuthn registration + login + JWT issuance
├── users/
├── recolecciones/               # LAYERED: api/ application/ domain/ tests/
├── lotes-vivero/                # LAYERED: api/ application/ domain/ tests/
├── viveros/                     # flat
├── plantas/                     # flat
├── metodos-recoleccion/
├── ubicaciones/  +  common/ubicaciones/
├── comunidades/
├── evidencias-trazabilidad/
├── blockchain/                  # ethers v6 + TokenJhamABI.json
├── pinata/                      # IPFS pinning
└── pingrepet/                   # health/ping
```

### Layered modules (`recolecciones`, `lotes-vivero`)

These two are the heart of the system and follow a deliberate split. **When adding behaviour, place it in the right layer rather than fattening the orchestrator service.**

- `api/` — Controller + DTOs (`class-validator`) + Swagger decorators in `api/docs/*.swagger.ts` + multipart parsers (e.g. `recoleccion-formdata.parser.ts`).
- `application/` — Many small single-responsibility services. The top-level service (`RecoleccionesService`, `LotesViveroService`) is an **orchestrator** that delegates to feature-specific services:
  - `*-auth.service.ts` — resolves `x-auth-id` → user/role/permisos
  - `*-creation.service.ts` / `*-inicio.service.ts` — atomic create paths (often call Supabase RPC functions defined in `migrations/`)
  - `*-consultas.service.ts` — read/list queries
  - `*-evidencias.service.ts` — Supabase Storage uploads (buckets created in migrations 002–004)
  - `*-snapshots.service.ts` — saldo / lote snapshots for traceability
  - `*-codigos.service.ts` — traceability code generation
  - `*-historial.service.ts` / `*-timeline.service.ts` / `*-eventos.service.ts` — event log views
  - `recoleccion-blockchain.service.ts` — minting on validation
  - `recoleccion-elegibilidad.service.ts`, `recoleccion-completitud.service.ts`, `recoleccion-validacion.service.ts`, `recoleccion-draft.service.ts` — state-machine checks
  - `vivero-embolsado.service.ts`, `vivero-adaptabilidad.service.ts`, `vivero-merma.service.ts` — per-event flows
- `domain/` — `enums/` and `policies/` (pure TypeScript, no Nest decorators). Policies hold business rules tested in isolation (see `recolecciones/tests/cantidad-unidad.policy.spec.ts`).
- `tests/` — colocated `*.spec.ts` for that module's services and policies. Picked up by the root jest config (`rootDir: src`).

### Lote-vivero lifecycle (drives most of the domain)

`recolección VALIDADA con saldo` → `POST /lotes-vivero/evidencias-pendientes` (pre-upload photos) → `POST /lotes-vivero` (create lote, decrements recolección saldo via RPC) → `POST /:id/embolsado` → `POST /:id/adaptabilidad` (SOMBRA → MEDIA_SOMBRA → SOL_DIRECTO) → optional `POST /:id/merma` → `POST /:id/despacho` (auto-closes when stock hits 0). `GET /:id/timeline` returns the full event history.

### Database & migrations

SQL migrations in `migrations/` are numbered and must be applied to Supabase in order. Several flows are implemented as Supabase **RPC functions** (e.g. `017_vivero_inicio_lote_rpc.sql`, `019_vivero_embolsado_rpc.sql`, `020_vivero_merma_rpc.sql`, `021_vivero_adaptabilidad_rpc.sql`) — the corresponding service calls `supabase.rpc('...')` for atomicity. When changing one of these flows, update both the SQL migration and the calling service.

Storage buckets are also provisioned via migrations (002–004). Image uploads must go through Supabase Storage; do not send base64 in the JSON body (main.ts caps body at 5 MB and comments warn against it).

### Authentication contract

- Registration/login go through `auth/auth.service.ts` using `@passwordless-id/webauthn`. Challenges are kept in an **in-memory Map** with a 5-min TTL — not safe for multi-instance deploys; replace with Redis before horizontal scaling.
- All other endpoints expect the `x-auth-id` header. Each layered module has its own `*-auth.service.ts` that converts that header into user + role + permissions; controllers throw `UnauthorizedException` if it's missing (see `LotesViveroController.requireAuthId`).

### Conventions to preserve

- **Spanish identifiers everywhere** (services, DTOs, enums, swagger tags). Don't anglicise.
- **DTOs use `class-validator`** and the global `ValidationPipe` is configured with `whitelist: true, forbidNonWhitelisted: true, transform: true` — unknown fields are rejected, so keep DTOs accurate.
- **Swagger decorators live in `api/docs/*.swagger.ts`** as named decorator factories (e.g. `ApiRegistrarEmbolsado()`) rather than inline on the controller. Follow this pattern when adding endpoints to the layered modules.
- **Orchestrator services stay thin.** New behaviour in `recolecciones` / `lotes-vivero` should go in a new or existing `*-<feature>.service.ts`, not in `recolecciones.service.ts` / `lotes-vivero.service.ts`.
- TypeScript is configured with `strictNullChecks: true` but `noImplicitAny: false` and `strictBindCallApply: false` — be aware when touching legacy code.
