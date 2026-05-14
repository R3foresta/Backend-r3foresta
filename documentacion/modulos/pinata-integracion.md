# Integración automática Pinata + Blockchain

Anexo a [pinata.md](./pinata.md) y [recolecciones.md](./recolecciones.md). Describe cuándo y cómo el módulo de recolecciones sube metadata a IPFS y acuña el NFT.

## Cuándo se dispara

La subida automática a Pinata **no ocurre en la creación** (`POST /api/recolecciones`). Ocurre durante la **aprobación de validación**:

```txt
PATCH /api/recolecciones/:id/approve   (solo VALIDADOR o ADMIN)
```

Razón: solo las recolecciones validadas deben quedar inmutables en IPFS/blockchain. Mientras una recolección esté en `BORRADOR` o `PENDIENTE_VALIDACION`, puede ser editada o rechazada y no debe consumir recursos on-chain.

## Flujo end-to-end (aprobación)

```
PATCH /api/recolecciones/:id/approve
         │
         ▼
1. RecoleccionValidacionService valida estado y rol
         │
         ▼
2. Actualiza estado_registro → VALIDADO
         │
         ▼
3. RecoleccionBlockchainService:
   a. Genera JSON NFT con datos de la recolección
   b. PinataService.uploadJson() → IPFS CID
   c. Persiste metadata_ipfs_url en tabla recoleccion
   d. BlockchainService.mint() → token NFT
   e. Persiste token_id / tx_hash
```

Implementación: [src/recolecciones/application/recoleccion-blockchain.service.ts](../../src/recolecciones/application/recoleccion-blockchain.service.ts).

## Formato del JSON NFT generado

```json
{
  "name": "REC-2026-0001 - Recolección de Pino",
  "description": "Recolección de semilla de Pino realizada por Jhamil el 2026-01-09...",
  "image": "https://<supabase>/storage/v1/object/public/recoleccion_fotos/...",
  "attributes": [
    { "trait_type": "ID", "value": "REC-2026-0001" },
    { "trait_type": "Usuario", "value": "Jhamil" },
    { "trait_type": "Tipo", "value": "Recoleccion" },
    { "trait_type": "Fecha", "value": "2026-01-09" },
    { "trait_type": "Especie", "value": "Pino" },
    { "trait_type": "Tipo de material", "value": "Semilla" },
    { "trait_type": "Cantidad", "value": "60 Kg" },
    { "trait_type": "Ubicacion", "value": "La Paz, Bolivia" },
    { "trait_type": "Coordenadas", "value": "-16.489689, -68.119293" }
  ]
}
```

## Persistencia

Columnas relevantes en la tabla `recoleccion`:

| Columna | Tipo | Cuándo se llena |
|---|---|---|
| `metadata_ipfs_url` | TEXT | Tras subir el JSON a Pinata |
| `nft_token_id` | TEXT/NUMERIC | Tras el `mint` on-chain |
| `nft_tx_hash` | TEXT | Tras el `mint` on-chain |

## Manejo de fallos

- Si la subida a Pinata falla, la transición a `VALIDADO` se revierte o se loguea según `RecoleccionBlockchainService`. Revisar logs del backend ante un `metadata_ipfs_url` nulo en una recolección validada.
- Si el `mint` falla pero el JSON sí se subió, queda el CID en `metadata_ipfs_url` para reintentar manualmente vía `POST /api/blockchain/mint` con esa URI.

## Verificación rápida

```sql
SELECT codigo_trazabilidad, estado_registro, metadata_ipfs_url, nft_token_id
FROM recoleccion
WHERE id = :id;
```

Abrir el JSON en `https://gateway.pinata.cloud/ipfs/<cid>` (sin el prefijo `ipfs://`).
