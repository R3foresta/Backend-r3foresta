# 🔗 Documentación: Módulo Blockchain NFT

## 📋 Descripción

Módulo completo para acuñar NFTs en el contrato **TokenJham** usando auto-custodia wallet. El backend controla la clave privada y firma las transacciones automáticamente.

---

## 📁 Estructura del Módulo

```
src/blockchain/
├── blockchain.controller.ts   # Endpoints HTTP
├── blockchain.service.ts      # Lógica de negocio con ethers.js
├── blockchain.module.ts       # Módulo de NestJS
├── TokenJhamABI.json          # ABI del contrato ERC721
└── dto/
    └── mint-nft.dto.ts        # DTO para validación
```

---

## 🔧 Variables de Entorno Requeridas

Agrega estas variables a tu archivo `.env`:

```env
# Blockchain Configuration
RPC_URL=https://tu-red-blockchain.com
PRIVATE_KEY=tu_clave_privada_sin_0x
CONTRACT_ADDRESS=0xDireccionDelContratoTokenJham
```

**Importante:**
- `RPC_URL`: URL del nodo RPC de tu red blockchain
- `PRIVATE_KEY`: Clave privada de la wallet que será el owner del contrato (sin el prefijo `0x`)
- `CONTRACT_ADDRESS`: Dirección donde está desplegado el contrato TokenJham

---

## 🎨 Endpoints Disponibles

### **1. Acuñar NFT (Mint)**

**POST** `/api/blockchain/mint`

Acuña un nuevo NFT y lo envía a una dirección específica.

**Body:**
```json
{
  "to": "0x2440783D1d86D91118E7e19F62889dDc96775868",
  "uri": "ipfs://bafkreidrjxlorjhatgeafcojozeiiltrfkzyujcs5w7bxuo2cnibomnd1"
}
```

**Respuesta:**
```json
{
  "success": true,
  "transactionHash": "0xabc123...",
  "blockNumber": 12345,
  "gasUsed": "123456",
  "tokenId": "0",
  "to": "0x2440783D1d86D91118E7e19F62889dDc96775868",
  "uri": "ipfs://bafkreidrjxlor...",
  "message": "NFT acuñado exitosamente"
}
```

---

### **2. Obtener URI de un Token**

**GET** `/api/blockchain/token/:tokenId/uri`

Consulta la URI de metadata de un token específico.

**Ejemplo:** `/api/blockchain/token/0/uri`

**Respuesta:**
```json
{
  "tokenId": "0",
  "uri": "ipfs://bafkreidrjxlor..."
}
```

---

### **3. Obtener Dueño de un Token**

**GET** `/api/blockchain/token/:tokenId/owner`

Consulta quién es el dueño actual de un token.

**Ejemplo:** `/api/blockchain/token/0/owner`

**Respuesta:**
```json
{
  "tokenId": "0",
  "owner": "0x2440783D1d86D91118E7e19F62889dDc96775868"
}
```

---

### **4. Obtener Balance de NFTs**

**GET** `/api/blockchain/balance/:address`

Consulta cuántos NFTs tiene una dirección.

**Ejemplo:** `/api/blockchain/balance/0x2440783D1d86D91118E7e19F62889dDc96775868`

**Respuesta:**
```json
{
  "address": "0x2440783D1d86D91118E7e19F62889dDc96775868",
  "balance": 5
}
```

---

### **5. Información de la Wallet del Backend**

**GET** `/api/blockchain/wallet`

Obtiene información de la wallet que firma las transacciones.

**Respuesta:**
```json
{
  "address": "0xWalletDelBackend...",
  "balance": "1.234567890123456789",
  "balanceWei": "1234567890123456789"
}
```

---

### **6. Información del Contrato**

**GET** `/api/blockchain/contract-info`

Obtiene información general del contrato NFT.

**Respuesta:**
```json
{
  "name": "TokenJham",
  "symbol": "MTj",
  "owner": "0xOwnerAddress...",
  "paused": false,
  "address": "0xContractAddress..."
}
```

---

## 🚀 Flujo Completo: Subir JSON + Acuñar NFT

### Paso 1: Subir JSON a Pinata

```bash
POST /api/pinata/upload-json
```

Body:
```json
{
  "data": {
    "name": "Recolección #001",
    "description": "Semillas nativas de Quercus humboldtii",
    "image": "ipfs://bafybeihdwdcefgh...",
    "attributes": [
      { "trait_type": "Especie", "value": "Quercus humboldtii" },
      { "trait_type": "Ubicación", "value": "Bogotá" }
    ]
  },
  "filename": "metadata-001.json"
}
```

**Respuesta:**
```json
{
  "success": true,
  "cid": "bafkreidrjxlor...",
  "ipfs_url": "ipfs://bafkreidrjxlor...",
  "gateway_url": "https://gateway.pinata.cloud/ipfs/bafkreidrjxlor..."
}
```

### Paso 2: Acuñar NFT con la URI

```bash
POST /api/blockchain/mint
```

Body:
```json
{
  "to": "0x2440783D1d86D91118E7e19F62889dDc96775868",
  "uri": "ipfs://bafkreidrjxlor..."
}
```

**Respuesta:**
```json
{
  "success": true,
  "transactionHash": "0xabc123...",
  "tokenId": "0",
  "message": "NFT acuñado exitosamente"
}
```

---

## 💻 Ejemplo de Código (JavaScript/TypeScript)

```typescript
// 1. Subir metadata a IPFS
const uploadResponse = await fetch('http://localhost:3000/api/pinata/upload-json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: {
      name: "Mi NFT",
      description: "Descripción del NFT",
      image: "ipfs://..."
    },
    filename: "metadata.json"
  })
});

const { ipfs_url } = await uploadResponse.json();

// 2. Acuñar NFT con la URI
const mintResponse = await fetch('http://localhost:3000/api/blockchain/mint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: "0x2440783D1d86D91118E7e19F62889dDc96775868",
    uri: ipfs_url
  })
});

const { tokenId, transactionHash } = await mintResponse.json();
console.log(`NFT #${tokenId} acuñado: ${transactionHash}`);
```

---

## 🔐 Seguridad

### ✅ Buenas Prácticas

- La `PRIVATE_KEY` **NUNCA** debe exponerse al cliente
- El `.env` **DEBE** estar en `.gitignore`
- Solo el backend puede acuñar NFTs (onlyOwner)
- La wallet del backend debe ser la owner del contrato

### ⚠️ Advertencias

- La wallet del backend necesita tener **tokens nativos** (ETH, MATIC, etc.) para pagar gas
- Cada transacción de mint **cuesta gas**
- Verifica que la wallet tenga fondos antes de hacer mint masivo

---

## 🛠️ Troubleshooting

### Error: "PRIVATE_KEY no está configurado"
**Solución:** Agrega `PRIVATE_KEY=tu_clave` al archivo `.env`

### Error: "insufficient funds for gas"
**Solución:** Envía tokens nativos a la wallet del backend. Ver balance con `GET /api/blockchain/wallet`

### Error: "OwnableUnauthorizedAccount"
**Solución:** La wallet del backend debe ser la owner del contrato. Verifica con `GET /api/blockchain/contract-info`

### Error: "execution reverted"
**Solución:** 
- Verifica que la dirección `to` sea válida
- Asegúrate de que el contrato no esté pausado
- Confirma que la URI sea accesible

---

## 📊 Diagrama de Flujo

```
┌─────────────┐
│   Cliente   │
└──────┬──────┘
       │
       │ 1. POST /pinata/upload-json
       ▼
┌─────────────┐
│   Pinata    │ Sube JSON a IPFS
└──────┬──────┘
       │
       │ 2. Devuelve ipfs://bafk...
       ▼
┌─────────────┐
│   Cliente   │
└──────┬──────┘
       │
       │ 3. POST /blockchain/mint
       │    { to, uri }
       ▼
┌─────────────┐
│   Backend   │
│  (Wallet)   │ Firma TX con PRIVATE_KEY
└──────┬──────┘
       │
       │ 4. safeMint(to, uri)
       ▼
┌─────────────┐
│  Blockchain │
│  (Contrato) │ Acuña NFT
└──────┬──────┘
       │
       │ 5. Evento Transfer + tokenId
       ▼
┌─────────────┐
│   Cliente   │ Recibe confirmación
└─────────────┘
```

---

## 📚 Funciones del Contrato Utilizadas

### `safeMint(address to, string memory uri)`
- **Descripción:** Acuña un nuevo NFT
- **Parámetros:**
  - `to`: Dirección del destinatario
  - `uri`: URI del metadata en IPFS
- **Retorna:** `uint256` - ID del token acuñado
- **Modificador:** `onlyOwner` (solo el backend puede llamarla)

### `tokenURI(uint256 tokenId)`
- **Descripción:** Obtiene la URI de metadata de un token
- **Parámetros:** `tokenId` - ID del token
- **Retorna:** `string` - URI del token

### `ownerOf(uint256 tokenId)`
- **Descripción:** Obtiene el dueño de un token
- **Parámetros:** `tokenId` - ID del token
- **Retorna:** `address` - Dirección del dueño

### `balanceOf(address owner)`
- **Descripción:** Cantidad de tokens de una dirección
- **Parámetros:** `owner` - Dirección a consultar
- **Retorna:** `uint256` - Cantidad de tokens

---

## ✨ Características

- ✅ **Auto-Custodia:** El backend firma transacciones automáticamente
- ✅ **Integración Completa:** Funciona con Pinata para metadata
- ✅ **Validación:** DTOs validan direcciones Ethereum y URIs
- ✅ **Logging:** Logs detallados de cada operación
- ✅ **Manejo de Errores:** Errores claros y descriptivos
- ✅ **Type-Safe:** TypeScript completo
- ✅ **Modular:** Fácil de extender y mantener

---

**Versión:** 1.0  
**Fecha:** 9 de enero de 2026  
**Proyecto:** Reforesta Backend - Blockchain Module  
**Contrato:** TokenJham (ERC721)
