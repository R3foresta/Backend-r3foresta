# Pruebas Postman — Endpoints MERMA

Modulo: Lotes de Vivero  
Base URL: `http://localhost:3000/api`

> **Flujo obligatorio:** primero subir evidencias → luego confirmar la merma → opcionalmente consultar historial.

---

## Variables de entorno sugeridas

| Variable | Valor de ejemplo |
|----------|-----------------|
| `base_url` | `http://localhost:3000/api` |
| `auth_id` | `uuid-del-usuario-en-supabase` |
| `lote_id` | `6` |

---

## PASO 1 — Subir evidencias pendientes

### POST `/api/lotes-vivero/:id/merma/evidencias-pendientes`

**Descripcion:** Sube las fotos antes de confirmar la merma. Retorna los `evidencia_ids` que se usan en el siguiente paso.

```
Metodo:  POST
URL:     {{base_url}}/lotes-vivero/{{lote_id}}/merma/evidencias-pendientes
```

**Headers:**

| Key | Value |
|-----|-------|
| `x-auth-id` | `{{auth_id}}` |

**Body — form-data:**

| Key | Type | Value | Requerido |
|-----|------|-------|-----------|
| `fotos` | File | Seleccionar imagen JPG/JPEG/PNG/WEBP/HEIC/HEIF | Si (min 1, max 5) |
| `titulo` | Text | `Evidencia merma por plaga` | No |
| `descripcion` | Text | `Plantas afectadas en sector norte` | No |

**Respuesta esperada 201:**
```json
{
  "success": true,
  "data": {
    "evidencia_ids": [201, 202],
    "evidencias": [
      {
        "id": 201,
        "codigo_trazabilidad": "VIV-000006-REC-2026-066",
        "entidad_id": 0,
        "ruta_archivo": "vivero/eventos/pendientes/77/foto1.jpg",
        "tipo_archivo": "image/jpeg"
      },
      {
        "id": 202,
        "codigo_trazabilidad": "VIV-000006-REC-2026-066",
        "entidad_id": 0,
        "ruta_archivo": "vivero/eventos/pendientes/77/foto2.jpg",
        "tipo_archivo": "image/jpeg"
      }
    ]
  }
}
```

**Errores posibles:**

| Codigo | Causa |
|--------|-------|
| 400 | No se enviaron fotos |
| 400 | El lote no esta en estado ACTIVO |
| 401 | Falta el header `x-auth-id` |
| 404 | El lote no existe |

---

## PASO 2 — Confirmar merma

### POST `/api/lotes-vivero/:id/merma`

**Descripcion:** Registra la merma llamando la RPC `fn_vivero_registrar_merma`. Descuenta el saldo vivo y vincula las evidencias atomicamente. Si el saldo llega a 0 el lote se cierra automaticamente.

```
Metodo:  POST
URL:     {{base_url}}/lotes-vivero/{{lote_id}}/merma
```

**Headers:**

| Key | Value |
|-----|-------|
| `x-auth-id` | `{{auth_id}}` |
| `Content-Type` | `application/json` |

**Body — raw JSON:**
```json
{
  "fecha_evento": "2026-05-05",
  "cantidad_afectada": 10,
  "causa_merma": "PLAGA",
  "evidencia_ids": [201, 202],
  "observaciones": "Plaga de mosca blanca detectada en sector norte"
}
```

**Valores validos para `causa_merma`:**

| Valor | Descripcion |
|-------|-------------|
| `PLAGA` | Ataque de insectos u otros parasitos |
| `ENFERMEDAD` | Hongos, bacterias u otras patologias |
| `SEQUIA` | Falta de riego o agua |
| `DANO_FISICO` | Golpes, pisotones, viento u otros daños mecanicos |
| `MUERTE_NATURAL` | Muerte sin causa identificada |
| `OTRO` | Causa no listada (agregar observaciones) |

**Respuesta esperada 201 — merma parcial (lote sigue ACTIVO):**
```json
{
  "success": true,
  "data": {
    "message": "Merma registrada correctamente.",
    "evento_merma_id": 45,
    "lote_vivero_id": 6,
    "codigo_trazabilidad": "VIV-000006-REC-2026-066",
    "cantidad_perdida": 10,
    "causa_merma": "PLAGA",
    "saldo_vivo_antes": 100,
    "saldo_vivo_despues": 90,
    "evidencia_ids_vinculadas": [201, 202],
    "lote_finalizado": false,
    "motivo_cierre": null
  }
}
```

**Respuesta esperada 201 — merma total (saldo llega a 0, lote se cierra):**
```json
{
  "success": true,
  "data": {
    "message": "Merma registrada correctamente. El lote ha sido cerrado automaticamente por saldo en 0.",
    "evento_merma_id": 46,
    "lote_vivero_id": 6,
    "codigo_trazabilidad": "VIV-000006-REC-2026-066",
    "cantidad_perdida": 90,
    "causa_merma": "MUERTE_NATURAL",
    "saldo_vivo_antes": 90,
    "saldo_vivo_despues": 0,
    "evidencia_ids_vinculadas": [203],
    "lote_finalizado": true,
    "motivo_cierre": "PERDIDA_TOTAL"
  }
}
```

**Errores posibles:**

| Codigo | Causa |
|--------|-------|
| 400 | Lote sin EMBOLSADO previo (RN-VIV-10) |
| 400 | Lote en estado FINALIZADO |
| 400 | `cantidad_afectada` supera el saldo vivo disponible |
| 400 | `cantidad_afectada` menor a 1 |
| 400 | `causa_merma` con valor no valido |
| 400 | Sin `evidencia_ids` o evidencias ya vinculadas a otra entidad |
| 400 | Fecha futura, mayor a 10 dias en el pasado, o anterior al EMBOLSADO |
| 401 | Falta el header `x-auth-id` |
| 403 | Rol del usuario sin permiso de escritura |
| 404 | Lote no encontrado |
| 500 | Error interno o de Supabase |

---

## PASO 3 (opcional) — Consultar historial de mermas

### GET `/api/lotes-vivero/:id/merma`

**Descripcion:** Devuelve todos los eventos MERMA registrados en el lote con sus evidencias vinculadas y el saldo vivo actual.

```
Metodo:  GET
URL:     {{base_url}}/lotes-vivero/{{lote_id}}/merma
```

**Headers:**

| Key | Value |
|-----|-------|
| `x-auth-id` | `{{auth_id}}` |

**Respuesta esperada 200:**
```json
{
  "success": true,
  "data": {
    "lote_id": 6,
    "saldo_vivo_actual": 90,
    "total_mermas": 2,
    "mermas": [
      {
        "id": 45,
        "fecha_evento": "2026-05-05",
        "cantidad_afectada": 10,
        "causa_merma": "PLAGA",
        "saldo_vivo_antes": 100,
        "saldo_vivo_despues": 90,
        "observaciones": "Plaga de mosca blanca detectada en sector norte",
        "responsable_id": 1,
        "created_at": "2026-05-05T14:30:00Z",
        "evidencias": [
          {
            "id": 201,
            "ruta_archivo": "vivero/eventos/...",
            "mime_type": "image/jpeg",
            "tipo_archivo": "image/jpeg",
            "es_principal": false,
            "orden": 0,
            "public_url": "https://xyz.supabase.co/storage/v1/object/public/recoleccion_fotos/..."
          }
        ]
      }
    ]
  }
}
```

**Errores posibles:**

| Codigo | Causa |
|--------|-------|
| 404 | Lote no encontrado |
| 500 | Error interno |

---

## Casos de prueba recomendados

| Caso | Body | Resultado esperado |
|------|------|--------------------|
| Merma parcial valida | `cantidad_afectada: 10`, saldo = 100 | 201, `saldo_vivo_despues: 90`, `lote_finalizado: false` |
| Merma total (cierre automatico) | `cantidad_afectada` = saldo actual | 201, `lote_finalizado: true`, `motivo_cierre: PERDIDA_TOTAL` |
| Sin evidencias | `evidencia_ids: []` | 400 |
| Evidencia ya vinculada | ID de evidencia de otro evento | 400 |
| Cantidad supera saldo | `cantidad_afectada` > saldo actual | 400 |
| Fecha futura | `fecha_evento: "2026-12-31"` | 400 |
| Fecha antes del embolsado | Fecha anterior al evento EMBOLSADO | 400 |
| Lote sin embolsado | Lote solo con INICIO | 400 |
| Lote FINALIZADO | Lote en estado FINALIZADO | 400 |
| `causa_merma` invalida | `"causa_merma": "VALOR_INEXISTENTE"` | 400 |
| Sin header `x-auth-id` | Omitir el header | 401 |
| Multiples mermas parciales | Repetir paso 1 y 2 varias veces | Cada merma descuenta del saldo acumulado |

---

## Notas importantes

- Los `evidencia_ids` del **Paso 1** son de un solo uso. Una vez vinculados a una merma no pueden reutilizarse.
- `responsable_id` **nunca va en el body**. Se resuelve internamente desde `x-auth-id`.
- `saldo_vivo_antes` y `saldo_vivo_despues` los calcula la RPC; el cliente no los envia.
- Si `causa_merma = OTRO`, se recomienda incluir `observaciones` aunque no es obligatorio.
