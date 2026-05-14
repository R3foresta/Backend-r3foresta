# Storage de imagenes de plantas

Las imagenes de plantas se almacenan en el bucket publico **`fotos_plantas`** de Supabase Storage. El backend recibe el archivo via `multipart/form-data` y devuelve una URL publica que se persiste en `planta.imagen_url`.

> Para el contrato de endpoint, ver [plantas.md](./plantas.md).

## Bucket

| Atributo | Valor |
|---|---|
| Nombre | `fotos_plantas` |
| Acceso | publico |
| Provision | `migrations/002_create_fotos_plantas_bucket.sql` (+ `004_create_all_storage_buckets.sql`) |

## Restricciones

- MIME aceptado: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`
- Tamaño maximo: **2 MB**
- Validacion: `ParseFilePipe` con `MaxFileSizeValidator` + `FileTypeValidator` en el controller.

## Como subir

`POST /api/plantas` y `PATCH /api/plantas/:id` aceptan `multipart/form-data` con un campo file llamado **`imagen`**. Es opcional.

```bash
curl -X POST http://localhost:3000/api/plantas \
  -F "especie=Caoba" \
  -F "nombre_cientifico=Swietenia macrophylla" \
  -F "variedad=Hondurena" \
  -F "tipo_planta_id=1" \
  -F "nombres_comunes=Caoba, Mahogany" \
  -F "imagen=@./caoba.png"
```

```javascript
const formData = new FormData();
formData.append('especie', 'Caoba');
formData.append('nombre_cientifico', 'Swietenia macrophylla');
formData.append('variedad', 'Hondureña');
formData.append('tipo_planta_id', '1');
formData.append('imagen', fileInput.files[0]);

await fetch('/api/plantas', { method: 'POST', body: formData });
// NO setear Content-Type manualmente: el browser agrega el boundary
```

## Flujo interno

1. Multer recibe el archivo y lo coloca en `file.buffer` (memoria).
2. `PlantasService.subirImagen()`:
   - Resuelve la extension a partir del mimetype (fallback: nombre de archivo).
   - Genera `${slug(nombre_cientifico)}_${timestamp}.${ext}`.
   - Sube al bucket con `supabase.storage.from('fotos_plantas').upload(path, buffer, { contentType, upsert: false })`.
   - Obtiene la URL publica con `getPublicUrl()`.
3. La URL se persiste en `planta.imagen_url`.

## Errores comunes

| Causa | Status | Mensaje |
|---|---|---|
| Imagen > 2 MB | 400 | Validation failed (file size) |
| MIME no permitido | 400 | Validation failed (expected type is `.(png\|jpeg\|jpg\|webp)`) |
| Falla de upload (storage caido, permisos) | 500 | `Error al subir imagen de planta al storage` |
| Extension no detectable | 400 | `Extension de imagen no soportada. Permitidas: png, jpg, jpeg, webp` |

## Migracion desde el enfoque viejo (base64)

Antes el backend aceptaba `imagen_url` como dataURL base64 en `application/json` y la parseaba server-side. Ese flujo **fue removido** en el refactor de 2026-05. Hoy:

- Si el FE manda base64 al body JSON → el `ValidationPipe` con `forbidNonWhitelisted` lo rechaza (`imagen_url` ya no esta en el DTO).
- La unica via de upload es `multipart/form-data` con el campo `imagen`.

## Limpieza de huerfanos

No hay job automatico. Para listar:

```sql
SELECT * FROM storage.objects WHERE bucket_id = 'fotos_plantas';
```

Para eliminar una imagen especifica:

```javascript
await supabase.storage.from('fotos_plantas').remove(['archivo.png']);
```

## Permisos

El bucket es publico (lectura y escritura). Si en el futuro se necesita restringir, modificar las policies en Supabase Dashboard.
