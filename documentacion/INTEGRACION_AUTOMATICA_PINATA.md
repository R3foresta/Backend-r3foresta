# 🔄 Integración Automática Pinata + Blockchain

## 📋 Descripción

Cuando se crea una nueva recolección, **automáticamente**:

1. ✅ Se guarda en la base de datos
2. ☁️ Se sube el metadata a IPFS/Pinata en formato NFT estándar
3. 💾 Se guarda la URL de IPFS en la base de datos

---

## 🚀 Flujo Automático

```
POST /api/recolecciones
         ↓
┌────────────────────────┐
│ 1. Validar datos       │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 2. Crear ubicación     │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 3. Crear planta        │
│    (si es nueva)       │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 4. Subir fotos         │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 5. Crear recolección   │
│    en base de datos    │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 6. Generar JSON NFT    │ 🆕
│    automáticamente     │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 7. Subir a Pinata      │ 🆕
│    (POST upload-json)  │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ 8. Guardar URL IPFS    │ 🆕
│    en base de datos    │
└───────────┬────────────┘
            ↓
      ✅ Completo
```

---

## 📝 Formato del JSON Generado

El JSON se genera automáticamente con este formato estándar de NFT:

```json
{
  "name": "REC-2026-0001 - Recolección de Pino",
  "description": "Recolección de semilla de Pino realizada por Jhamil el 2026-01-09 a las 10:30 en La Paz, Bolivia. Cantidad: 60 Kg",
  "image": "https://vyrjlehkhabydkhjxagx.supabase.co/storage/v1/object/public/recoleccion_fotos/total.jpg",
  "attributes": [
    { "trait_type": "ID", "value": "REC-2026-0001" },
    { "trait_type": "Usuario", "value": "Jhamil" },
    { "trait_type": "Tipo", "value": "Recoleccion" },
    { "trait_type": "Fecha", "value": "2026-01-09" },
    { "trait_type": "Hora", "value": "10:30" },
    { "trait_type": "Especie", "value": "Pino" },
    { "trait_type": "Tipo de material", "value": "Semilla" },
    { "trait_type": "Cantidad", "value": "60 Kg" },
    { "trait_type": "Metodo", "value": "Manual" },
    { "trait_type": "Estado", "value": "Almacenado" },
    { "trait_type": "Ubicacion", "value": "La Paz, Bolivia Zona: Irpavi II" },
    { "trait_type": "Coordenadas", "value": "-16.489689, -68.119293" },
    { "trait_type": "Foto Lugar", "value": "https://..." },
    { "trait_type": "Foto Total", "value": "https://..." }
  ]
}
```

---

## 🗄️ Cambios en Base de Datos

Se agregó una nueva columna a la tabla `recoleccion`:

```sql
ALTER TABLE recoleccion 
ADD COLUMN metadata_ipfs_url TEXT;
```

Esta columna almacena la URL de IPFS donde está el metadata (ej: `ipfs://bafkrei...`)

**Para aplicar la migración:**
1. Abre Supabase SQL Editor
2. Ejecuta el archivo: `migrations/add_metadata_ipfs_url.sql`

---

## 💡 Ventajas

✅ **Automatizado:** No necesitas hacer llamadas manuales a Pinata  
✅ **Consistente:** Siempre usa el mismo formato NFT estándar  
✅ **Trazable:** Cada recolección tiene su URL de IPFS guardada  
✅ **Ready para NFT:** El JSON ya está listo para acuñar NFTs  
✅ **Sin cambios frontend:** El frontend sigue usando el mismo endpoint  

---

## 🔍 Cómo Verificar

Después de crear una recolección:

1. **Ver la respuesta del endpoint:**
   ```json
   {
     "id": 123,
     "codigo_trazabilidad": "REC-2026-0001",
     "metadata_ipfs_url": "ipfs://bafkrei...",
     ...
   }
   ```

2. **Ver en Supabase:**
   ```sql
   SELECT codigo_trazabilidad, metadata_ipfs_url 
   FROM recoleccion 
   WHERE id = 123;
   ```

3. **Ver el JSON en IPFS:**
   - Copia la `metadata_ipfs_url`
   - Ábrela en el navegador (usando gateway):
     ```
     https://gateway.pinata.cloud/ipfs/bafkrei...
     ```

---

## 🎯 Uso para Acuñar NFT

Ahora que cada recolección tiene su metadata en IPFS, puedes acuñar el NFT:

```typescript
// 1. Crear recolección (automático: sube a Pinata)
const recoleccion = await fetch('POST /api/recolecciones', { ... });

// 2. La respuesta incluye metadata_ipfs_url
const { metadata_ipfs_url } = recoleccion;

// 3. Acuñar NFT con esa URI
await fetch('POST /api/blockchain/mint', {
  body: JSON.stringify({
    to: "0x2440783D1d86D91118E7e19F62889dDc96775868",
    uri: metadata_ipfs_url  // ← Usar la URI automática
  })
});
```

---

## ⚠️ Manejo de Errores

Si falla la subida a Pinata:
- ✅ La recolección **SÍ** se guarda en la base de datos
- ⚠️ Se loguea el error pero no se lanza excepción
- 💾 `metadata_ipfs_url` será `null`
- 🔄 Puedes intentar subir manualmente después

---

## 🛠️ Solución de Problemas

### Error: "metadata_ipfs_url column does not exist"
**Solución:** Ejecuta la migración SQL en Supabase

### La URL de IPFS es null
**Causas posibles:**
1. Error en Pinata (verifica JWT en .env)
2. Problema de red al subir
3. Revisa los logs del backend

### El JSON no tiene el formato correcto
**Solución:** Verifica que la recolección tenga todos los datos completos (ubicación, planta, fotos, etc.)

---

**Versión:** 1.0  
**Fecha:** 9 de enero de 2026  
**Integración:** Recolecciones + Pinata + IPFS
