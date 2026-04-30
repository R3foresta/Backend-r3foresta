# Pruebas Postman — Fase EMBOLSADO

Módulo: Lotes de Vivero  
Base URL: `http://localhost:3000`  
Header requerido en todos los endpoints: `x-auth-id: <auth_id_del_usuario>`

---

## Flujo completo recomendado

```
1. GET  /lotes-vivero/:id/embolsado/context         → verificar que el lote permite embolsado
2. POST /lotes-vivero/:id/embolsado/evidencias-pendientes → subir fotos y obtener evidencia_ids
3. POST /lotes-vivero/:id/embolsado                  → confirmar embolsado con la RPC
4. GET  /lotes-vivero/:id/embolsado                  → verificar el resultado registrado
```

> Asegúrate de tener un lote con estado `ACTIVO` y con evento `INICIO` ya registrado antes de comenzar.

---

## 1. GET /lotes-vivero/:id/embolsado/context

**Objetivo:** Cargar los datos del lote para la pantalla de embolsado. Solo lectura.

### Request

```
GET http://localhost:3000/lotes-vivero/6/embolsado/context
```

**Headers:**
```
x-auth-id: tu-auth-uuid-aqui
```

### Respuesta esperada — lote listo para embolsar

```json
{
  "lote_id": 6,
  "codigo_trazabilidad": "VIV-000006-REC-2026-066",
  "nombre_cientifico_snapshot": "Quercus robur",
  "nombre_comercial_snapshot": "Roble europeo",
  "tipo_material_snapshot": "ESQUEJE",
  "cantidad_inicial_en_proceso": 50,
  "unidad_medida_inicial": "UNIDAD",
  "fecha_inicio": "2026-04-20",
  "estado_lote": "ACTIVO",
  "plantas_vivas_iniciales": null,
  "saldo_vivo_actual": null,
  "puede_registrar_embolsado": true,
  "motivo_bloqueo": null
}
```

### Respuesta esperada — embolsado ya registrado

```json
{
  "lote_id": 6,
  "codigo_trazabilidad": "VIV-000006-REC-2026-066",
  "nombre_cientifico_snapshot": "Quercus robur",
  "nombre_comercial_snapshot": "Roble europeo",
  "tipo_material_snapshot": "ESQUEJE",
  "cantidad_inicial_en_proceso": 50,
  "unidad_medida_inicial": "UNIDAD",
  "fecha_inicio": "2026-04-20",
  "estado_lote": "ACTIVO",
  "plantas_vivas_iniciales": 100,
  "saldo_vivo_actual": 100,
  "puede_registrar_embolsado": false,
  "motivo_bloqueo": "El lote ya tiene EMBOLSADO registrado. Solo se permite una vez por lote (RN-VIV-11).",
  "evento_embolsado_existente": {
    "id": 27,
    "tipo_evento": "EMBOLSADO",
    "fecha_evento": "2026-04-25",
    "cantidad_afectada": 100,
    "saldo_vivo_antes": null,
    "saldo_vivo_despues": 100,
    "created_at": "2026-04-25T12:00:00Z"
  }
}
```

### Respuesta esperada — lote sin INICIO

```json
{
  "lote_id": 6,
  "puede_registrar_embolsado": false,
  "motivo_bloqueo": "El lote no tiene un evento INICIO registrado. EMBOLSADO requiere INICIO previo (RN-VIV-10)."
}
```

### Errores comunes

| Código | Causa |
|--------|-------|
| 404 | El lote no existe |
| 500 | Error interno al leer el lote |

---

## 2. POST /lotes-vivero/:id/embolsado/evidencias-pendientes

**Objetivo:** Subir las fotos antes de confirmar el embolsado. Devuelve los `evidencia_ids` que se necesitan en el paso 3.

### Request

```
POST http://localhost:3000/lotes-vivero/6/embolsado/evidencias-pendientes
```

**Headers:**
```
x-auth-id: tu-auth-uuid-aqui
Content-Type: multipart/form-data
```

**Body (form-data):**

| Key | Type | Value |
|-----|------|-------|
| fotos | File | foto_embolsado_1.jpg |
| fotos | File | foto_embolsado_2.jpg *(opcional)* |
| titulo | Text | Embolsado lote 6 |
| descripcion | Text | Plantas transferidas a bolsas con sustrato *(opcional)* |

> Solo se aceptan archivos JPG, JPEG y PNG. Máximo 5 fotos.

### Configuración en Postman

1. Seleccionar método `POST`.
2. En **Body** elegir `form-data`.
3. Para el campo `fotos` cambiar el tipo de `Text` a `File` y seleccionar la imagen.
4. Para subir múltiples fotos, agregar varias filas con la misma key `fotos`.

### Respuesta esperada — 201 Created

```json
{
  "evidencia_ids": [137, 138],
  "evidencias": [
    {
      "id": 137,
      "codigo_trazabilidad": "VIV-000006-REC-2026-066",
      "entidad_id": 0,
      "ruta_archivo": "vivero/eventos/pendientes/77/1714000000000_0_foto1.jpg",
      "tipo_archivo": "image/jpeg"
    },
    {
      "id": 138,
      "codigo_trazabilidad": "VIV-000006-REC-2026-066",
      "entidad_id": 0,
      "ruta_archivo": "vivero/eventos/pendientes/77/1714000000001_1_foto2.jpg",
      "tipo_archivo": "image/jpeg"
    }
  ]
}
```

> Guarda los `evidencia_ids` (`[137, 138]`), los necesitas en el paso 3.

### Errores comunes

| Código | Causa |
|--------|-------|
| 400 | No se enviaron fotos |
| 400 | El lote no está en estado ACTIVO |
| 400 | Formato de imagen no permitido (solo JPG, JPEG, PNG) |
| 401 | Falta el header `x-auth-id` |
| 404 | El lote no existe |

---

## 3. POST /lotes-vivero/:id/embolsado

**Objetivo:** Confirmar el embolsado. Llama la RPC `fn_vivero_registrar_embolsado` de forma atómica.

> El `responsable_id` **no** va en el body. Sale del usuario autenticado via `x-auth-id`.  
> No enviar `unidad_medida_evento`, `saldo_vivo_antes` ni `saldo_vivo_despues`; los calcula la RPC.

### Request

```
POST http://localhost:3000/lotes-vivero/6/embolsado
```

**Headers:**
```
x-auth-id: tu-auth-uuid-aqui
(opcinal para JSON)Content-Type: application/json
```

**Body:**
```json
{
  "fecha_evento": "2026-04-30",
  "plantas_vivas_iniciales": 100,
  "evidencia_ids": [137, 138],
  "observaciones": "Embolsado con sustrato turba y perlita. 100 plantas trasladadas exitosamente."
}
```

### Campos del body

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fecha_evento` | string (date) | Sí | Fecha ISO 8601. No puede ser futura. Máximo 10 días en el pasado. |
| `plantas_vivas_iniciales` | integer | Sí | Entero mayor a 0. Conteo observado, no conversión de gramos. |
| `evidencia_ids` | number[] | Sí | Mínimo 1 ID de evidencia pendiente obtenido en el paso 2. |
| `observaciones` | string | No | Máximo 1000 caracteres. |

### Respuesta esperada — 201 Created

```json
{
  "message": "Embolsado registrado correctamente.",
  "evento_embolsado_id": 27,
  "lote_vivero_id": 6,
  "codigo_trazabilidad": "VIV-000006-REC-2026-066",
  "plantas_vivas_iniciales": 100,
  "saldo_vivo_antes": null,
  "saldo_vivo_despues": 100,
  "evidencia_ids_vinculadas": [137, 138]
}
```

### Casos de error a probar

**Sin INICIO previo:**
```json
{
  "statusCode": 400,
  "message": "El lote 6 no tiene un evento INICIO registrado. EMBOLSADO requiere INICIO previo (RN-VIV-10)."
}
```

**EMBOLSADO duplicado (segunda vez en el mismo lote):**
```json
{
  "statusCode": 400,
  "message": "El lote 6 ya tiene un evento EMBOLSADO registrado. No se puede registrar dos veces (RN-VIV-11)."
}
```

**Evidencia ya vinculada a otro evento:**
```json
{
  "statusCode": 400,
  "message": "Todas las evidencias de EMBOLSADO deben existir, no estar eliminadas y no estar vinculadas a otra entidad."
}
```

**Sin evidencias:**
```json
{
  "statusCode": 400,
  "message": [
    "Se requiere al menos una evidencia para EMBOLSADO"
  ]
}
```

**plantas_vivas_iniciales menor a 1:**
```json
{
  "statusCode": 400,
  "message": [
    "plantas_vivas_iniciales must not be less than 1"
  ]
}
```

**Sin header x-auth-id:**
```json
{
  "statusCode": 401,
  "message": "Header x-auth-id es requerido"
}
```

### Errores comunes

| Código | Causa |
|--------|-------|
| 400 | Lote sin INICIO, EMBOLSADO duplicado, evidencia ya usada, campos inválidos |
| 401 | Falta o está vacío el header `x-auth-id` |
| 403 | El rol del usuario no permite escribir |
| 404 | El usuario del `x-auth-id` no existe |
| 500 | Error interno o de Supabase |

---

## 4. GET /lotes-vivero/:id/embolsado

**Objetivo:** Consultar el resultado del embolsado ya registrado.

### Request

```
GET http://localhost:3000/lotes-vivero/6/embolsado
```

**Headers:**
```
x-auth-id: tu-auth-uuid-aqui
```

### Respuesta esperada — embolsado registrado

```json
{
  "registrado": true,
  "evento": {
    "id": 27,
    "tipo_evento": "EMBOLSADO",
    "fecha_evento": "2026-04-30",
    "cantidad_afectada": 100,
    "unidad_medida_evento": "UNIDAD",
    "saldo_vivo_antes": null,
    "saldo_vivo_despues": 100,
    "observaciones": "Embolsado con sustrato turba y perlita.",
    "responsable_id": 77,
    "created_at": "2026-04-30T15:30:00Z"
  },
  "lote": {
    "id": 6,
    "codigo_trazabilidad": "VIV-000006-REC-2026-066",
    "plantas_vivas_iniciales": 100,
    "saldo_vivo_actual": 100
  },
  "evidencias": [
    {
      "id": 137,
      "ruta_archivo": "vivero/eventos/pendientes/77/1714000000000_0_foto1.jpg",
      "mime_type": "image/jpeg",
      "tipo_archivo": "FOTO",
      "es_principal": true,
      "orden": 0,
      "public_url": "https://tu-proyecto.supabase.co/storage/v1/object/public/recoleccion_fotos/vivero/eventos/pendientes/77/1714000000000_0_foto1.jpg"
    }
  ]
}
```

### Respuesta esperada — embolsado no registrado aún

```json
{
  "registrado": false,
  "evento": null
}
```

### Errores comunes

| Código | Causa |
|--------|-------|
| 404 | El lote no existe |
| 500 | Error interno |

---

## Colección de Postman — variables de entorno sugeridas

Crea un Environment en Postman con estas variables:

| Variable | Valor de ejemplo |
|----------|-----------------|
| `base_url` | `http://localhost:3000` |
| `auth_id` | `tu-auth-uuid-de-supabase` |
| `lote_id` | `6` |
| `evidencia_ids` | `[137]` *(actualizar después del paso 2)* |

Y reemplaza en los requests:

```
{{base_url}}/lotes-vivero/{{lote_id}}/embolsado/context
{{base_url}}/lotes-vivero/{{lote_id}}/embolsado/evidencias-pendientes
{{base_url}}/lotes-vivero/{{lote_id}}/embolsado
```

Header común:
```
x-auth-id: {{auth_id}}
```

---

## Secuencia completa de prueba paso a paso

### Paso 1 — Verificar contexto

```
GET {{base_url}}/lotes-vivero/{{lote_id}}/embolsado/context
```

Verificar que la respuesta tenga:
- `"estado_lote": "ACTIVO"`
- `"puede_registrar_embolsado": true`
- `"motivo_bloqueo": null`

---

### Paso 2 — Subir evidencias

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/embolsado/evidencias-pendientes
```

Body: `form-data` con al menos 1 foto en el campo `fotos`.

Guardar los `evidencia_ids` de la respuesta para usarlos en el paso 3.

---

### Paso 3 — Registrar embolsado

```
POST {{base_url}}/lotes-vivero/{{lote_id}}/embolsado
```

```json
{
  "fecha_evento": "2026-04-30",
  "plantas_vivas_iniciales": 100,
  "evidencia_ids": [137],
  "observaciones": "Prueba de embolsado"
}
```

Verificar que la respuesta tenga:
- `"message": "Embolsado registrado correctamente."`
- `"saldo_vivo_antes": null`
- `"saldo_vivo_despues": 100`
- `"evidencia_ids_vinculadas": [137]`

---

### Paso 4 — Confirmar resultado

```
GET {{base_url}}/lotes-vivero/{{lote_id}}/embolsado
```

Verificar que la respuesta tenga:
- `"registrado": true`
- `"evento"` con los datos del embolsado
- `"lote.plantas_vivas_iniciales": 100`
- `"lote.saldo_vivo_actual": 100`
- `"evidencias"` con las fotos vinculadas

---

## Reglas de negocio a recordar durante las pruebas

- `EMBOLSADO` solo puede registrarse **una vez** por lote.
- El lote debe estar en estado `ACTIVO`.
- Debe existir un evento `INICIO` previo.
- `plantas_vivas_iniciales` es un conteo observado; **no** es conversión automática desde gramos.
- Las evidencias deben estar en estado pendiente (`entidad_id = 0`); no se reutilizan evidencias ya vinculadas a otros eventos.
- `responsable_id` **nunca** va en el body; siempre sale del `x-auth-id`.
- `saldo_vivo_antes` siempre es `null` en EMBOLSADO (no había saldo vivo antes).
- Desde EMBOLSADO el saldo vivo se maneja siempre en `UNIDAD`.
