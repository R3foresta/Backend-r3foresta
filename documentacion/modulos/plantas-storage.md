# 📸 Documentación: Guardar Imágenes de Plantas en Supabase Storage

## 🎯 Resumen
Las imágenes de plantas ahora se guardan automáticamente en **Supabase Storage** en el bucket `fotos_plantas`, en lugar de guardar el base64 directamente en la base de datos.

---

## 🔧 Configuración del Bucket

### 1. Ejecutar el script SQL
Ejecuta el archivo `migrations/002_create_fotos_plantas_bucket.sql` en el **SQL Editor** de tu proyecto Supabase:

```sql
-- El script crea:
-- ✅ Bucket público "fotos_plantas"
-- ✅ Políticas de lectura pública (SELECT)
-- ✅ Políticas de escritura pública (INSERT)
-- ✅ Políticas de eliminación pública (DELETE)
-- ✅ Políticas de actualización pública (UPDATE)
```

### 2. Verificar en Supabase Dashboard
1. Ve a **Storage** → **Buckets**
2. Deberías ver el bucket **fotos_plantas** con estado **PUBLIC**
3. Verifica que tenga las 4 políticas activas

---

## 🚀 Cómo Funciona

### Endpoint: `POST /api/plantas`

#### **Antes** ❌
```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "imagen_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```
❌ La imagen base64 se guardaba directamente en la columna `imagen_url`

#### **Ahora** ✅
```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "imagen_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```
✅ El backend detecta que es base64, la sube al storage y guarda la URL pública:
```
https://[tu-proyecto].supabase.co/storage/v1/object/public/fotos_plantas/swietenia_macrophylla_1737588000000.png
```

---

## 📋 Proceso Automático

Cuando envías una imagen en base64, el servicio:

1. **Detecta** que la imagen viene en formato `data:image/[tipo];base64,[datos]`
2. **Extrae** el tipo de archivo (png, jpeg, jpg, webp, etc.)
3. **Convierte** el base64 a Buffer
4. **Genera** un nombre único: `{nombre_cientifico}_{timestamp}.{extension}`
   - Ejemplo: `swietenia_macrophylla_1737588000000.png`
5. **Sube** la imagen al bucket `fotos_plantas` en Supabase Storage
6. **Obtiene** la URL pública de la imagen
7. **Guarda** la URL en la columna `imagen_url` de la base de datos

---

## 🔍 Formatos de Imagen Soportados

El servicio acepta imágenes en base64 con estos formatos:
- ✅ `data:image/png;base64,...`
- ✅ `data:image/jpeg;base64,...`
- ✅ `data:image/jpg;base64,...`
- ✅ `data:image/webp;base64,...`
- ✅ `data:image/gif;base64,...`

---

## 📂 Estructura en Storage

```
fotos_plantas/
├── swietenia_macrophylla_1737588000000.png
├── cedrela_odorata_1737588123456.jpg
├── cordia_alliodora_1737588234567.png
└── ...
```

Cada archivo tiene un nombre único basado en:
- Nombre científico sanitizado (sin espacios ni caracteres especiales)
- Timestamp (milisegundos)
- Extensión del archivo original

---

## 🧪 Ejemplo de Uso

### Request (Frontend)
```javascript
const response = await fetch('http://localhost:3000/api/plantas', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    especie: 'Caoba',
    nombre_cientifico: 'Swietenia macrophylla',
    tipo_planta: 'Árbol',
    fuente: 'SEMILLA',
    nombres_comunes: 'Caoba, Mahogany',
    imagen_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    // ... otros campos
  }),
});

const data = await response.json();
console.log(data.data.imagen_url);
// https://xxxxxx.supabase.co/storage/v1/object/public/fotos_plantas/swietenia_macrophylla_1737588000000.png
```

### Response
```json
{
  "success": true,
  "message": "Planta creada exitosamente",
  "data": {
    "id": 123,
    "especie": "Caoba",
    "nombre_cientifico": "Swietenia macrophylla",
    "imagen_url": "https://xxxxxx.supabase.co/storage/v1/object/public/fotos_plantas/swietenia_macrophylla_1737588000000.png",
    ...
  }
}
```

---

## ⚠️ Validaciones

### Error: Formato de Imagen Inválido
```json
{
  "statusCode": 400,
  "message": "Formato de imagen inválido. Debe ser base64 con formato: data:image/[tipo];base64,[datos]",
  "error": "Bad Request"
}
```
**Solución**: Asegúrate de que la imagen tenga el prefijo correcto `data:image/...;base64,`

### Error: Planta Duplicada
```json
{
  "statusCode": 409,
  "message": "Ya existe una planta con nombre científico \"Swietenia macrophylla\"",
  "error": "Conflict"
}
```

### Error al Subir al Storage
```json
{
  "statusCode": 500,
  "message": "Error al subir imagen al storage",
  "error": "Internal Server Error"
}
```
**Solución**: Verifica que:
- El bucket `fotos_plantas` exista
- Las políticas estén configuradas correctamente
- Las credenciales de Supabase sean válidas

---

## 🔐 Permisos del Bucket

El bucket `fotos_plantas` tiene estas políticas públicas:

| Política | Comando | Aplicado a | Descripción |
|----------|---------|------------|-------------|
| Permitir lectura | `SELECT` | `public` | Cualquiera puede ver las imágenes |
| Permitir upload | `INSERT` | `public` | Cualquiera puede subir imágenes |
| Permitir eliminar | `DELETE` | `public` | Cualquiera puede eliminar imágenes |
| Permitir actualizar | `UPDATE` | `public` | Cualquiera puede actualizar imágenes |

> ⚠️ **Nota**: Estos permisos son públicos. Si necesitas restringir el acceso, modifica las políticas en Supabase.

---

## 📊 Ventajas de Este Enfoque

✅ **Mejor rendimiento**: No se guarda base64 en la BD  
✅ **Optimización**: Las imágenes se sirven desde CDN de Supabase  
✅ **Escalabilidad**: Storage optimizado para archivos grandes  
✅ **URLs públicas**: Fácil acceso desde cualquier cliente  
✅ **Nombres únicos**: No hay colisiones de archivos  

---

## 🛠️ Mantenimiento

### Ver todas las imágenes
```sql
SELECT * FROM storage.objects WHERE bucket_id = 'fotos_plantas';
```

### Eliminar una imagen específica
```javascript
const { data, error } = await supabase.storage
  .from('fotos_plantas')
  .remove(['swietenia_macrophylla_1737588000000.png']);
```

### Limpiar imágenes huérfanas
Puedes crear un script para eliminar imágenes que no estén referenciadas en la tabla `planta`.

---

## 📝 Notas Importantes

1. **Tamaño máximo**: Supabase tiene límites de tamaño por archivo (generalmente 50MB)
2. **Formato recomendado**: Usa JPEG o WebP para mejor compresión
3. **Nombres sanitizados**: Los espacios y caracteres especiales se eliminan automáticamente
4. **Cache**: Las URLs públicas están cacheadas por el CDN de Supabase

---

## 🔗 Referencias

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Storage Policies](https://supabase.com/docs/guides/storage/security/access-control)
