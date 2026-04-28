# Consumo frontend - Lotes de vivero

Documento operativo para que una IA/frontend consuma el backend actual sin inventar campos ni llamar rutas incompletas.

## Estado real del backend

Base URL local:

```txt
http://localhost:3000/api
```

Endpoints listos para consumo:

```txt
POST /api/lotes-vivero/evidencias-pendientes
POST /api/lotes-vivero
GET  /api/lotes-vivero
```

Endpoints expuestos pero NO listos todavia:

```txt
POST /api/lotes-vivero/:id/embolsado       -> 501 Not Implemented
POST /api/lotes-vivero/:id/adaptabilidad  -> 501 Not Implemented
POST /api/lotes-vivero/:id/merma          -> 501 Not Implemented
POST /api/lotes-vivero/:id/despacho       -> 501 Not Implemented
GET  /api/lotes-vivero/:id/timeline       -> 501 Not Implemented
```

Para la fase actual del frontend, implementar el flujo de inicio y el listado de lotes creados.

## Regla de autenticacion

Todos los endpoints de escritura requieren header:

```txt
x-auth-id: <auth_id_de_supabase>
```

Enviar el `auth_id` de Supabase, no el `usuario.id` interno de la tabla `usuario`. El backend resuelve el usuario operativo y valida permisos.

Roles permitidos para escribir:

```txt
ADMIN
VALIDADOR
GENERAL
```

## Flujo obligatorio de inicio

El inicio de lote se hace en dos llamadas:

1. Subir una o mas fotos como evidencias pendientes.
2. Crear el lote usando los `evidencia_ids` devueltos.

No crear el lote sin evidencia. La RPC `fn_vivero_crear_lote_desde_recoleccion` exige `evidencia_ids`.

## 1. Crear evidencias pendientes

```txt
POST /api/lotes-vivero/evidencias-pendientes
Content-Type: multipart/form-data
x-auth-id: <auth_id_de_supabase>
```

Body FormData:

| Campo          | Tipo           | Requerido | Reglas                                                   |
| -------------- | -------------- | --------- | -------------------------------------------------------- |
| `fotos`        | File[]         | si        | 1 a 5 imagenes. Solo JPG, JPEG o PNG.                    |
| `titulo`       | string         | no        | Maximo 120 caracteres.                                   |
| `descripcion`  | string         | no        | Maximo 1000 caracteres.                                  |
| `metadata`     | string         | no        | JSON serializado como texto. Debe representar un objeto. |
| `tomado_en`    | string         | no        | Fecha ISO valida.                                        |
| `es_principal` | boolean/string | no        | Acepta `true`, `false`, `1`, `0`, `si`, `no`.            |

Ejemplo frontend:

```ts
const formData = new FormData();
for (const file of files) {
  formData.append('fotos', file);
}
formData.append('titulo', 'Inicio de lote');
formData.append('descripcion', 'Fotos del material al iniciar el lote');
formData.append('metadata', JSON.stringify({ fuente: 'app-mobile' }));
formData.append('tomado_en', new Date().toISOString());
formData.append('es_principal', 'true');

const res = await fetch(`${API_URL}/api/lotes-vivero/evidencias-pendientes`, {
  method: 'POST',
  headers: {
    'x-auth-id': authId,
  },
  body: formData,
});
```

No enviar `Content-Type` manualmente en esta llamada. El navegador debe poner el boundary del `multipart/form-data`.

Respuesta esperada:

```json
{
  "success": true,
  "data": [
    {
      "id": 501,
      "tipo_entidad_id": 9,
      "entidad_id": 0,
      "codigo_trazabilidad": null,
      "bucket": "recoleccion_fotos",
      "ruta_archivo": "vivero/eventos/pendientes/77/...",
      "storage_object_id": "abc-123",
      "tipo_archivo": "FOTO",
      "mime_type": "image/jpeg",
      "tamano_bytes": 245678,
      "hash_sha256": "...",
      "titulo": "Inicio de lote",
      "descripcion": "Fotos del material al iniciar el lote",
      "metadata": {
        "fuente": "app-mobile",
        "origen": "VIVERO_EVENTO_PENDIENTE",
        "estado": "PENDIENTE_VINCULACION",
        "formato": "JPEG"
      },
      "es_principal": true,
      "orden": 0,
      "tomado_en": "2026-04-28T10:00:00.000Z",
      "creado_en": "2026-04-28T10:00:01.000Z",
      "creado_por_usuario_id": 77,
      "public_url": "https://..."
    }
  ],
  "evidencia_ids": [501]
}
```

Guardar `evidencia_ids`. Esos IDs se envian en la siguiente llamada.

## 2. Crear lote desde recoleccion

```txt
POST /api/lotes-vivero
Content-Type: application/json
x-auth-id: <auth_id_de_supabase>
```

Body JSON:

| Campo                         | Tipo     | Requerido | Reglas                                    |
| ----------------------------- | -------- | --------- | ----------------------------------------- |
| `recoleccion_id`              | number   | si        | Entero mayor o igual a 1.                 |
| `vivero_id`                   | number   | si        | Entero mayor o igual a 1.                 |
| `fecha_inicio`                | string   | si        | Fecha ISO. Recomendado `YYYY-MM-DD`.      |
| `fecha_evento`                | string   | si        | Fecha ISO. Recomendado `YYYY-MM-DD`.      |
| `cantidad_inicial_en_proceso` | number   | si        | Mayor a 0. Maximo 6 decimales.            |
| `unidad_medida_inicial`       | string   | si        | `UNIDAD` o `G`.                           |
| `evidencia_ids`               | number[] | si        | Array no vacio, IDs unicos, enteros >= 1. |
| `observaciones`               | string   | no        | Maximo 1000 caracteres.                   |

Ejemplo:

```ts
const payload = {
  recoleccion_id: 45,
  vivero_id: 1,
  fecha_inicio: '2026-04-28',
  fecha_evento: '2026-04-28',
  cantidad_inicial_en_proceso: 10,
  unidad_medida_inicial: 'UNIDAD',
  evidencia_ids: [501],
  observaciones: 'Inicio del lote en vivero central',
};

const res = await fetch(`${API_URL}/api/lotes-vivero`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-auth-id': authId,
  },
  body: JSON.stringify(payload),
});
```

Respuesta esperada:

```json
{
  "success": true,
  "data": {
    "lote_vivero_id": 101,
    "evento_inicio_id": 202,
    "recoleccion_movimiento_id": 303,
    "codigo_trazabilidad": "VIV-000101-REC-000045",
    "saldo_recoleccion_antes": 10,
    "saldo_recoleccion_despues": 0,
    "evidencia_inicio_ids": [501]
  }
}
```

Despues de esta llamada, las evidencias pendientes quedan vinculadas al evento `INICIO`.

## 3. Listar lotes de vivero

```txt
GET /api/lotes-vivero
```

No requiere `x-auth-id`.

Query params:

| Campo            | Tipo   | Requerido | Reglas                                      |
| ---------------- | ------ | --------- | ------------------------------------------- |
| `page`           | number | no        | Default 1. Entero >= 1.                     |
| `limit`          | number | no        | Default 20. Maximo 50.                      |
| `estado_lote`    | string | no        | `ACTIVO` o `FINALIZADO`.                    |
| `vivero_id`      | number | no        | Entero >= 1.                                |
| `recoleccion_id` | number | no        | Entero >= 1.                                |
| `lote_vivero_id` | number | no        | Entero >= 1. Filtra por `lote_vivero.id`.   |
| `motivo_cierre`  | string | no        | `DESPACHO_TOTAL`, `PERDIDA_TOTAL`, `MIXTO`. |
| `fecha_inicio`   | string | no        | Fecha ISO. Filtra desde `fecha_inicio`.     |
| `fecha_fin`      | string | no        | Fecha ISO. Filtra hasta `fecha_inicio`.     |
| `q`              | string | no        | Busca en codigo y snapshots de texto.       |

Ejemplo:

```ts
const params = new URLSearchParams({
  estado_lote: 'ACTIVO',
  vivero_id: String(viveroId),
  page: '1',
  limit: '20',
});

const res = await fetch(`${API_URL}/api/lotes-vivero?${params.toString()}`);
```

Respuesta esperada:

```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "codigo_trazabilidad": "VIV-000101-REC-000045",
      "estado_lote": "ACTIVO",
      "motivo_cierre": null,
      "recoleccion_id": 45,
      "planta_id": 12,
      "vivero_id": 1,
      "responsable_id": 77,
      "nombre_cientifico_snapshot": "Cedrela odorata",
      "nombre_comercial_snapshot": "Cedro",
      "tipo_material_snapshot": "SEMILLA",
      "variedad_snapshot": "Local",
      "nombre_comunidad_origen_snapshot": "Comunidad A",
      "nombre_responsable_snapshot": "Responsable Vivero",
      "fecha_inicio": "2026-04-28",
      "cantidad_inicial_en_proceso": 10,
      "unidad_medida_inicial": "UNIDAD",
      "plantas_vivas_iniciales": null,
      "saldo_vivo_actual": null,
      "stock_vivo_actual": null,
      "subetapa_actual": null,
      "created_at": "2026-04-28T10:00:00Z",
      "updated_at": "2026-04-28T10:00:00Z",
      "vivero": {
        "id": 1,
        "codigo": "VIV-CENTRAL",
        "nombre": "Vivero Central"
      },
      "recoleccion": {
        "id": 45,
        "codigo_trazabilidad": "REC-000045",
        "fecha": "2026-04-20",
        "tipo_material": "SEMILLA",
        "estado_registro": "VALIDADO",
        "estado_operativo": "ABIERTO",
        "saldo_actual": 0,
        "unidad_canonica": "UNIDAD"
      },
      "planta": {
        "id": 12,
        "especie": "Cedrela odorata",
        "nombre_cientifico": "Cedrela odorata",
        "nombre_comun_principal": "Cedro",
        "variedad": "Local",
        "imagen_url": null
      },
      "responsable": {
        "id": 77,
        "nombre": "Responsable",
        "apellido": "Vivero",
        "username": "rvivero",
        "correo": "rvivero@example.com"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

Nota para UI: despues del evento `INICIO`, `saldo_vivo_actual` puede venir `null` hasta que se implemente/registre `EMBOLSADO`. Para mostrar cantidad inicial usar `cantidad_inicial_en_proceso`; para plantas vivas usar `saldo_vivo_actual` solo cuando no sea `null`.

## Validaciones que debe respetar el frontend

Antes de llamar `POST /api/lotes-vivero`, el frontend debe seleccionar una recoleccion que cumpla:

```txt
estado_registro = VALIDADO
estado_operativo = ABIERTO
saldo_actual suficiente
codigo_trazabilidad existente
unidad_canonica igual a unidad_medida_inicial
snapshots obligatorios completos
```

Reglas de cantidad/unidad:

```txt
Si unidad_medida_inicial = UNIDAD, cantidad_inicial_en_proceso debe ser entera.
Si la recoleccion es tipo_material = ESQUEJE, la unidad debe ser UNIDAD.
No enviar cantidades negativas, cero, NaN ni strings vacios.
No enviar mas de 6 decimales.
```

Fechas:

```txt
No enviar fechas futuras.
Usar formato YYYY-MM-DD para fecha_inicio y fecha_evento.
```

## Campos que NO debe enviar el frontend

No enviar estos campos en `POST /api/lotes-vivero`; el backend/RPC los calcula:

```txt
responsable_id
nombre_responsable_snapshot
codigo_trazabilidad
evento_inicio_id
recoleccion_movimiento_id
saldo_recoleccion_antes
saldo_recoleccion_despues
created_by
estado_lote
saldo_vivo_actual
planta_id
nombre_cientifico_snapshot
nombre_comercial_snapshot
variedad_snapshot
nombre_comunidad_origen_snapshot
```

No enviar parametros `p_*` de la RPC desde el frontend. El frontend llama REST; el backend llama la RPC.

No enviar imagenes en base64 en JSON. Las fotos van por `multipart/form-data` en `/evidencias-pendientes`.

No enviar `entidad_id`, `tipo_entidad_id` ni `codigo_trazabilidad` al crear evidencia pendiente. El backend los asigna.

## Errores esperados

Formato comun de error NestJS:

```json
{
  "message": "Texto del error",
  "error": "Bad Request",
  "statusCode": 400
}
```

Errores frecuentes:

| Status | Causa probable                                                                           | Accion frontend                                         |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 400    | Payload invalido, metadata no es JSON, falta foto, saldo insuficiente, unidad incorrecta | Mostrar mensaje y permitir corregir.                    |
| 401    | Falta `x-auth-id`                                                                        | Reautenticar o reenviar header.                         |
| 403    | Rol sin permiso                                                                          | Bloquear accion para el usuario.                        |
| 404    | Usuario/vivero/recoleccion/tipo evidencia no existe                                      | Refrescar datos base o reportar configuracion faltante. |
| 500    | Error interno o storage/RPC                                                              | Mostrar error generico y permitir reintento.            |

## Checklist para IA/frontend

Para implementar inicio de lote:

```txt
1. Tener authId de Supabase.
2. Elegir recoleccion VALIDADO/ABIERTO con saldo.
3. Elegir vivero_id.
4. Pedir al menos 1 foto.
5. Llamar POST /api/lotes-vivero/evidencias-pendientes con FormData.
6. Tomar evidencia_ids de la respuesta.
7. Llamar POST /api/lotes-vivero con JSON y esos evidencia_ids.
8. Guardar lote_vivero_id, evento_inicio_id y codigo_trazabilidad retornados.
9. Refrescar listado con GET /api/lotes-vivero.
10. No llamar todavia endpoints de embolsado/adaptabilidad/merma/despacho/timeline desde UI productiva.
```

## Referencias de codigo

Swagger central del modulo:

```txt
src/lotes-vivero/api/docs/lotes-vivero.swagger.ts
```

Controller REST:

```txt
src/lotes-vivero/api/lotes-vivero.controller.ts
```

Servicios implementados:

```txt
src/lotes-vivero/application/vivero-evidencias.service.ts
src/lotes-vivero/application/vivero-inicio.service.ts
src/lotes-vivero/application/vivero-consultas.service.ts
```

Migracion RPC vigente:

```txt
migrations/018_fix_vivero_inicio_lote_rpc_trazabilidad_evidencia.sql
```
