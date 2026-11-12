# Integración automática Pinata + Blockchain

Anexo a [pinata.md](./pinata.md) y [recolecciones.md](./recolecciones.md). Describe cuándo y cómo el módulo de recolecciones sube metadata a IPFS y acuña el NFT.

## Cuándo se dispara

La subida automática a Pinata ocurre después de confirmar la **recepción y validación**:

```txt
POST /api/v1/recepcion-semillas/:id/recibir-validar
```

La operación requiere ADMIN global o VALIDADOR con asignación vigente al vivero,
siempre distinto del recolector. BORRADOR y RECHAZADO permiten corrección.
PENDIENTE_VALIDACION espera la decisión de recepción y mantiene la ficha congelada.

## Flujo end-to-end de recepción

```
POST /api/v1/recepcion-semillas/:id/recibir-validar
         │
         ▼
1. RecoleccionRecepcionService ejecuta la RPC de recepción
         │
         ▼
2. PostgreSQL confirma recepción, VALIDADO, revisión, evidencia, historial y recibo
         │
         ▼
3. Sólo la primera ejecución confirmada llama RecoleccionBlockchainService
   a. Genera JSON NFT con datos de la recolección
   b. PinataService.uploadJson() → IPFS CID
   c. BlockchainService.mintNFT() → token NFT
   d. Persiste blockchain_url / token_id / transaction_hash
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
| `blockchain_url` | TEXT | Tras completar el `mint`, enlace al explorador |
| `token_id` | TEXT | Identificador devuelto por el `mint` |
| `transaction_hash` | TEXT | Transacción devuelta por el `mint` |

## Manejo de fallos

- Un fallo de Pinata o blockchain conserva la recepción confirmada y se registra
  en los logs del backend. El recibo identifica el anclaje como `FUERA_TRANSACCION`.
- Replay y recuperación no vuelven a intentar el mint. Una interrupción después
  del commit puede dejarlo pendiente. No existe outbox ni reintento durable.
- El servicio actual guarda las referencias en Recolección después de completar
  el mint. Una subida IPFS seguida de un fallo de mint no garantiza una URI
  persistida para recuperación automática.

## Verificación rápida

```sql
SELECT codigo_trazabilidad, estado_registro, blockchain_url, token_id,
       transaction_hash
FROM recoleccion
WHERE id = :id;
```

El contrato de recepción y sus límites están en la
[guía consumible](../../docs/t4-recepcion-semillas.md).
