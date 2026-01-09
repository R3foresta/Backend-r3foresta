# 🚀 Guía Rápida: Cómo Subir JSON a IPFS

## ⚡ Setup Rápido (5 minutos)

### 1️⃣ Instalar Dependencias
```bash
npm install
```

### 2️⃣ Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
PINATA_JWT=tu_jwt_aqui
GATEWAY_URL=gateway.pinata.cloud
PORT=3000
```

**¿Cómo obtener tu JWT?**
1. Ve a [https://app.pinata.cloud](https://app.pinata.cloud)
2. Crea cuenta o inicia sesión
3. **Developers** → **API Keys** → **New Key**
4. Selecciona permisos: `pinFileToIPFS` y `pinJSONToIPFS`
5. Copia el JWT y pégalo en tu `.env`

### 3️⃣ Iniciar el Servidor
```bash
npm run start:dev
```

---

## 📤 Subir un JSON

### Endpoint:
```
POST http://localhost:3000/api/pinata/upload-json
```

### Ejemplo con Postman:

**Headers:**
```
Content-Type: application/json
```

**Body (raw - JSON):**
```json
{
  "data": {
    "nombre": "Mi primer archivo",
    "descripcion": "Prueba de IPFS",
    "fecha": "2026-01-09"
  },
  "filename": "prueba.json"
}
```

### Respuesta:
```json
{
  "success": true,
  "cid": "bafkreidrjxlor...",
  "name": "prueba.json",
  "size": 123,
  "ipfs_url": "ipfs://bafkreidrjxlor...",
  "gateway_url": "https://gateway.pinata.cloud/ipfs/bafkreidrjxlor...",
  "public_url": "https://ipfs.io/ipfs/bafkreidrjxlor...",
  "access": "PUBLIC",
  "message": "JSON subido exitosamente a IPFS (acceso público para NFT)",
  "nft_ready": true
}
```

---

## 🌐 Ver tu Archivo

Copia el `gateway_url` de la respuesta y ábrelo en tu navegador:
```
https://gateway.pinata.cloud/ipfs/TU_CID_AQUI
```

---

## 💻 Ejemplo de Código (Frontend)

```javascript
async function subirJSON(data) {
  const response = await fetch('http://localhost:3000/api/pinata/upload-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: data,
      filename: 'mi-archivo.json'
    })
  });
  
  const resultado = await response.json();
  console.log('CID:', resultado.cid);
  console.log('URL:', resultado.public_url);
  return resultado;
}

// Usar:
subirJSON({ mensaje: "¡Hola IPFS!" });
```

---

## 📚 Documentación Completa

Para más detalles, consulta: **[DOCUMENTACION_PINATA.md](./DOCUMENTACION_PINATA.md)**

---

## ✅ Verificación Rápida

1. ✅ Servidor corriendo en `http://localhost:3000`
2. ✅ `.env` configurado con `PINATA_JWT`
3. ✅ Endpoint responde en `/api/pinata/upload-json`
4. ✅ El JSON se puede ver en la URL del gateway

---

## 🆘 Problemas Comunes

**Error: PINATA_JWT no configurado**
- Verifica que el archivo `.env` existe
- Reinicia el servidor después de crear el `.env`

**Error 401: Invalid JWT**
- Genera un nuevo JWT en Pinata
- Asegúrate de copiar el JWT completo

**Error 404**
- Verifica la ruta: debe ser `/api/pinata/upload-json`
- Confirma que el servidor está corriendo

---

**¡Listo! Tu módulo de Pinata está funcionando 🎉**
