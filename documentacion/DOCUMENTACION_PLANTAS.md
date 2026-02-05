# 🌱 Documentación - API de Plantas

## 📋 Descripción General

Sistema de gestión del catálogo de especies vegetales simplificado para el proyecto Reforesta.

**Base URL:** `http://localhost:3000/api/plantas`

---

## 📚 Conceptos Importantes

Antes de usar la API, es importante entender las diferencias entre estos conceptos:

| Término | Definición | Ejemplo |
|---------|------------|---------|
| **Especie** | Grupo biológico de individuos con características genéticas similares que pueden reproducirse entre sí (la categoría biológica) | Papa (como organismo biológico) |
| **Nombre Científico** | Etiqueta científica única y universal en nomenclatura binomial | *Solanum tuberosum* |
| **Variedad** | Subdivisión específica de la especie con características distintivas | Hondureña, Peruana, Andina, Común |
| **Nombre más común** | Nombre popular más reconocido en la región | Papa (en Latinoamérica) o Patata (en España) |
| **Nombres comunes** | Todas las variantes de nombres populares | Papa, Patata, Turma, Chulo |

### Ejemplo Completo:
```
Especie: Papa
Nombre Científico: Solanum tuberosum
Variedad: Común
Nombre más común: Papa
Nombres comunes: Papa, Patata, Turma, Chulo
```

---

## 🔗 Endpoints Disponibles

### 1. 📝 Crear Nueva Planta

Registra una nueva especie vegetal en el catálogo.

**Endpoint:** `POST /api/plantas`

#### Headers
```
Content-Type: application/json
```

#### Body Parameters

##### Campos Obligatorios

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `especie` | `string` | Grupo biológico al que pertenece | `"Caoba"` |
| `nombre_cientifico` | `string` | Nombre científico único (nomenclatura binomial) | `"Swietenia macrophylla"` |
| `variedad` | `string` | Variedad específica de la planta | `"Hondureña"`, `"Común"` |

##### Campos Opcionales

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `tipo_planta` | `string` | Clasificación morfológica | `"Árbol"`, `"Arbusto"`, `"Hierba"`, `"Palma"`, `"Enredadera"`, `"Otro"` |
| `tipo_planta_otro` | `string` | Especificación cuando tipo_planta es "Otro" | `"Liana leñosa"` |
| `nombre_comun_principal` | `string` | Nombre común más reconocido en la región | `"Caoba de Honduras"` |
| `nombres_comunes` | `string` | Otros nombres comunes (separados por comas) | `"Caoba, Aguano, Zopilote"` |
| `imagen_url` | `string` | URL o imagen base64 | `"data:image/png;base64,..."` o `"https://..."` |
| `notas` | `string` | Información adicional sobre manejo, recolección, características | `"Especie de crecimiento lento, requiere suelos bien drenados"` |

#### Ejemplo de Request - Básico

```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "variedad": "Hondureña"
}
```

#### Ejemplo de Request - Completo

```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "variedad": "Hondureña",
  "tipo_planta": "Árbol",
  "nombre_comun_principal": "Caoba de Honduras",
  "nombres_comunes": "Caoba, Aguano, Zopilote, Araputanga",
  "imagen_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "notas": "Especie de crecimiento lento, requiere suelos bien drenados. Recolectar semillas maduras directamente del árbol."
}
```

#### Ejemplo de Request - Con tipo_planta "Otro"

```json
{
  "especie": "Bejuco de agua",
  "nombre_cientifico": "Vitis tiliifolia",
  "variedad": "Común",
  "tipo_planta": "Otro",
  "tipo_planta_otro": "Liana leñosa trepadora",
  "nombres_comunes": "Bejuco de agua, Uva silvestre"
}
```

#### Respuesta Exitosa - `201 Created`

```json
{
  "success": true,
  "message": "Planta creada exitosamente",
  "data": {
    "id": 1,
    "especie": "Caoba",
    "nombre_cientifico": "Swietenia macrophylla",
    "variedad": "Hondureña",
    "tipo_planta": "Árbol",
    "tipo_planta_otro": null,
    "nombre_comun_principal": "Caoba de Honduras",
    "nombres_comunes": "Caoba, Aguano, Zopilote",
    "imagen_url": "https://[supabase-url]/storage/v1/object/public/fotos_plantas/swietenia_macrophylla_1738674600000.png",
    "notas": "Especie de crecimiento lento, requiere suelos bien drenados",
    "created_at": "2026-02-04T10:30:00.000Z"
  }
}
```

#### Posibles Errores

##### 1. Campos obligatorios faltantes - `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": [
    "especie should not be empty",
    "nombre_cientifico should not be empty",
    "variedad should not be empty"
  ],
  "error": "Bad Request"
}
```

##### 2. Planta duplicada - `409 Conflict`
```json
{
  "statusCode": 409,
  "message": "Ya existe una planta con nombre científico \"Swietenia macrophylla\" y variedad \"Hondureña\". No se pueden crear plantas duplicadas.",
  "error": "Conflict"
}
```

**Nota:** La validación de duplicados es **case-insensitive** (no distingue mayúsculas/minúsculas). Si necesitas crear la misma especie, usa una variedad diferente.

##### 3. Validación de tipo_planta_otro - `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": "Si tipo_planta es 'Otro', debe especificar tipo_planta_otro",
  "error": "Bad Request"
}
```

##### 4. Formato de imagen inválido - `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": "Formato de imagen inválido. Debe ser base64 con formato: data:image/[tipo];base64,[datos]",
  "error": "Bad Request"
}
```

##### 5. Error interno del servidor - `500 Internal Server Error`
```json
{
  "statusCode": 500,
  "message": "Error al crear planta",
  "error": "Internal Server Error"
}
```

---

### 2. 📋 Listar Todas las Plantas

Obtiene el listado completo de plantas registradas, con opción de búsqueda.

**Endpoint:** `GET /api/plantas`

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` | `string` | ❌ No | Término de búsqueda (busca en especie y nombre_cientifico) |

#### Ejemplos de Request

**Sin búsqueda:**
```
GET http://localhost:3000/api/plantas
```

**Con búsqueda:**
```
GET http://localhost:3000/api/plantas?q=caoba
```

#### Respuesta Exitosa - `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "especie": "Caoba",
      "nombre_cientifico": "Swietenia macrophylla",
      "variedad": "Hondureña",
      "tipo_planta": "Árbol",
      "tipo_planta_otro": null,
      "nombre_comun_principal": "Caoba de Honduras",
      "nombres_comunes": "Caoba, Aguano, Zopilote",
      "imagen_url": "https://[supabase-url]/storage/v1/object/public/fotos_plantas/...",
      "notas": "Especie de crecimiento lento",
      "created_at": "2026-02-04T10:30:00.000Z"
    },
    {
      "id": 2,
      "especie": "Roble",
      "nombre_cientifico": "Quercus robur",
      "variedad": "Común",
      "tipo_planta": "Árbol",
      "tipo_planta_otro": null,
      "nombre_comun_principal": "Roble europeo",
      "nombres_comunes": "Roble, Roble común, Carballo",
      "imagen_url": null,
      "notas": null,
      "created_at": "2026-02-04T11:00:00.000Z"
    }
  ]
}
```

---

### 3. 🔍 Buscar Plantas

Endpoint alternativo para búsqueda de plantas (funcionalmente idéntico a GET /plantas?q=).

**Endpoint:** `GET /api/plantas/search`

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` | `string` | ✅ Sí | Término de búsqueda |

#### Ejemplo de Request

```
GET http://localhost:3000/api/plantas/search?q=caoba
```

#### Respuesta

Misma estructura que el endpoint de listar plantas.

---

## 🧪 Pruebas en Postman

### Configuración Inicial

1. **Crear una nueva colección:** "Reforesta - Plantas"
2. **Establecer variable de entorno:**
   - Variable: `base_url`
   - Valor: `http://localhost:3000/api`

### Caso de Prueba 1: Crear Planta Básica

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Headers:**
   - `Content-Type: application/json`
4. **Body (raw JSON):**
```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "variedad": "Hondureña"
}
```
5. **Resultado esperado:** Status `201`, planta creada con ID

### Caso de Prueba 2: Crear Planta Completa

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Body (raw JSON):**
```json
{
  "especie": "Roble",
  "nombre_cientifico": "Quercus robur",
  "variedad": "Europeo",
  "tipo_planta": "Árbol",
  "nombre_comun_principal": "Roble europeo",
  "nombres_comunes": "Roble, Roble común, Carballo",
  "notas": "Árbol caducifolio de hasta 40m de altura. Madera de alta calidad para construcción y tonelería."
}
```
4. **Resultado esperado:** Status `201`, planta creada con todos los campos

### Caso de Prueba 3: Crear Planta con Tipo "Otro"

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Body (raw JSON):**
```json
{
  "especie": "Bejuco de agua",
  "nombre_cientifico": "Vitis tiliifolia",
  "variedad": "Común",
  "tipo_planta": "Otro",
  "tipo_planta_otro": "Liana leñosa trepadora"
}
```
4. **Resultado esperado:** Status `201`, planta creada con tipo personalizado

### Caso de Prueba 4: Validar Duplicados

1. Crear una planta: nombre_cientifico "Quercus robur", variedad "Europeo"
2. Intentar crear otra con los mismos valores
3. **Resultado esperado:** Status `409 Conflict` con mensaje indicando duplicado

### Caso de Prueba 5: Crear Variedad Diferente

1. Crear planta: nombre_cientifico "Quercus robur", variedad "Europeo"
2. Crear otra: nombre_cientifico "Quercus robur", variedad "Americano"
3. **Resultado esperado:** Ambas creadas exitosamente (Status `201`)

### Caso de Prueba 6: Validar Campos Obligatorios

1. **Body incompleto:**
```json
{
  "especie": "Planta incompleta"
}
```
2. **Resultado esperado:** Status `400`, error de validación (faltan nombre_cientifico y variedad)

### Caso de Prueba 7: Subir Imagen Base64

1. **Body con imagen:**
```json
{
  "especie": "Pino",
  "nombre_cientifico": "Pinus sylvestris",
  "variedad": "Común",
  "imagen_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
}
```
2. **Resultado esperado:** Status `201`, imagen subida a Supabase Storage y URL retornada

### Caso de Prueba 8: Listar y Buscar

1. **GET** `{{base_url}}/plantas` → Obtener todas las plantas
2. **GET** `{{base_url}}/plantas?q=caoba` → Buscar por término
3. **GET** `{{base_url}}/plantas/search?q=quercus` → Búsqueda alternativa

---

## 🔒 Validaciones y Reglas de Negocio

### Validaciones a Nivel de Base de Datos

1. **Índice Único (uq_planta_cientifico_variedad):**
   - Combinación de `nombre_cientifico` + `variedad` debe ser única
   - **Case-insensitive**: No distingue mayúsculas/minúsculas
   - Permite crear la misma especie con diferentes variedades

   Ejemplo válido:
   ```
   ✅ nombre_cientifico: "Quercus robur", variedad: "Europeo"
   ✅ nombre_cientifico: "Quercus robur", variedad: "Americano"
   ❌ nombre_cientifico: "Quercus robur", variedad: "Europeo" (duplicado)
   ❌ nombre_cientifico: "QUERCUS ROBUR", variedad: "europeo" (considerado duplicado)
   ```

2. **Check Constraint (chk_tipo_planta_otro):**
   - Si `tipo_planta` = "Otro", entonces `tipo_planta_otro` debe tener un valor válido (no nulo y no vacío)

3. **Campos obligatorios en BD:**
   - `especie`, `nombre_cientifico`, `variedad`

4. **Campos con valores por defecto:**
   - `created_at`: Timestamp automático (NOW())

### Validaciones a Nivel de Aplicación (Backend)

1. **Campos obligatorios en API:**
   - `especie` (string, not empty)
   - `nombre_cientifico` (string, not empty)
   - `variedad` (string, not empty)

2. **Campos opcionales:**
   - Todos los demás campos pueden ser `null` u omitirse

3. **Prevención de duplicados:**
   - Verificación previa con consulta case-insensitive antes de inserción
   - Si existe duplicado → Error `409 Conflict` con mensaje descriptivo

4. **Procesamiento de imágenes:**
   - Acepta URLs directas o imágenes base64
   - Formato base64: `data:image/[tipo];base64,[datos]`
   - Tipos soportados: jpg, jpeg, png, webp
   - Si es base64 → Sube a Supabase Storage → Retorna URL pública

### Diferencia con Estructura Anterior

**Campos eliminados:**
- `fuente` (SEMILLA/ESQUEJE)
- Taxonomía completa: `reino`, `division`, `clase`, `orden`, `familia`, `genero`
- Descripciones detalladas: `origen_geografico`, `habitat_descripcion`, `descripcion_morfologica`
- Usos: `usos_industriales`, `usos_medicinales`, `usos_ornamentales`
- `advertencia_toxicidad`
- `notas_manejo_recoleccion` → Reemplazado por `notas` (más general)

**Campos nuevos/modificados:**
- `variedad`: Ahora es **requerido** (antes era hardcoded como "Común")
- `notas`: Campo general para cualquier información adicional

---

## 📝 Notas Importantes

### 1. Estructura Simplificada
La estructura actual de la tabla se enfoca en los campos **esenciales** para el registro y seguimiento de plantas:
- Identificación: `especie`, `nombre_cientifico`, `variedad`
- Clasificación: `tipo_planta`, `tipo_planta_otro`
- Nombres locales: `nombre_comun_principal`, `nombres_comunes`
- Recursos: `imagen_url`
- Información adicional: `notas`

### 2. Diferencia Entre Conceptos Clave

**Especie vs Nombre Científico:**
- **Especie**: El grupo biológico (ej: "Papa")
- **Nombre Científico**: La etiqueta única mundial (ej: "Solanum tuberosum")

**Ejemplo completo:**
```json
{
  "especie": "Papa",
  "nombre_cientifico": "Solanum tuberosum",
  "variedad": "Peruana",
  "nombre_comun_principal": "Papa",
  "nombres_comunes": "Papa, Patata, Turma"
}
```

### 3. Validación de Unicidad

La combinación `nombre_cientifico` + `variedad` debe ser única (case-insensitive):

✅ **Permitido:**
```
Planta 1: Quercus robur + Europeo
Planta 2: Quercus robur + Americano
Planta 3: Pinus sylvestris + Común
```

❌ **No Permitido:**
```
Planta 1: Quercus robur + Europeo
Planta 2: QUERCUS ROBUR + europeo  ← Duplicado (case-insensitive)
```

### 4. Campo variedad es Requerido

A diferencia de la versión anterior, `variedad` **debe** especificarse en cada request:
- Si es la variedad más común: usar `"Común"` o `"Estándar"`
- Si hay variaciones: especificar `"Hondureña"`, `"Peruana"`, etc.
- Siempre debe tener un valor explícito

### 5. Tipo de Planta

Valores sugeridos para `tipo_planta`:
- `"Árbol"`
- `"Arbusto"`
- `"Hierba"`
- `"Palma"`
- `"Enredadera"`
- `"Helecho"`
- `"Cactus"`
- `"Suculenta"`
- `"Otro"` (requiere especificar `tipo_planta_otro`)

### 6. Formato de Nombres Comunes

El campo `nombres_comunes` debe ser texto separado por comas:
```
"Caoba, Aguano, Zopilote, Araputanga"
```

### 7. Subida de Imágenes

**Opción 1: URL Directa**
```json
{
  "imagen_url": "https://ejemplo.com/mi-imagen.jpg"
}
```

**Opción 2: Base64 (recomendado)**
```json
{
  "imagen_url": "data:image/png;base64,iVBORw0KGgo..."
}
```
- Si es base64, se sube automáticamente a Supabase Storage
- Retorna la URL pública en la respuesta
- Bucket: `fotos_plantas`
- Tamaño máximo recomendado: 5MB

### 8. Nomenclatura Científica

Seguir nomenclatura binomial estándar:
- Formato: `Género especie`
- Primera letra del género en mayúscula
- Especie en minúsculas
- Ejemplos correctos:
  - ✅ `"Swietenia macrophylla"`
  - ✅ `"Quercus robur"`
  - ❌ `"swietenia macrophylla"` (género en minúscula)
  - ❌ `"SWIETENIA MACROPHYLLA"` (todo en mayúsculas)

### 9. Campo notas

Campo de texto libre para incluir:
- Características especiales
- Recomendaciones de manejo
- Métodos de recolección
- Condiciones ideales de crecimiento
- Cualquier información relevante

Ejemplo:
```json
{
  "notas": "Especie de crecimiento lento. Requiere suelos bien drenados. Recolectar semillas maduras directamente del árbol. Las semillas pierden viabilidad después de 2-3 meses."
}
```

### 10. Campos Automáticos

No incluir en el request (generados automáticamente):
- `id`: Autoincremental (BIGSERIAL)
- `created_at`: Timestamp de creación (NOW())

---

## 🐛 Solución de Problemas Comunes

### Error: "Cannot POST /plantas"
**Solución:** Verificar que la URL incluya `/api` → `http://localhost:3000/api/plantas`

### Error: "variedad should not be empty"
**Solución:** El campo `variedad` es obligatorio. Agregar una variedad (ej: `"Común"`, `"Hondureña"`, etc.)

### Error: 409 Conflict - "Ya existe una planta con nombre científico..."
**Causa:** Ya existe una planta con la misma combinación de `nombre_cientifico` + `variedad`

**Soluciones:**
1. Verificar si realmente es un duplicado consultando `/api/plantas?q=[nombre]`
2. Si es la misma especie pero diferente variedad, cambiar el valor de `variedad`
3. Si es un error de mayúsculas/minúsculas, recordar que la validación es case-insensitive

### Error: "Formato de imagen inválido"
**Causa:** La imagen base64 no tiene el formato correcto

**Solución:** Asegurarse de que la imagen tenga el formato:
```
data:image/[tipo];base64,[datos]
```
Tipos válidos: `png`, `jpg`, `jpeg`, `webp`

### Error: Connection refused
**Solución:** Verificar que el servidor esté corriendo con `npm run start:dev`

### Error: "Si tipo_planta es 'Otro', debe especificar tipo_planta_otro"
**Solución:** Cuando `tipo_planta` sea `"Otro"`, agregar el campo `tipo_planta_otro`:
```json
{
  "tipo_planta": "Otro",
  "tipo_planta_otro": "Descripción del tipo personalizado"
}
```

### Warning: Imagen muy grande
**Recomendación:** Optimizar imágenes antes de subirlas. Tamaño recomendado: máximo 5MB

---

## 📊 Estructura de Respuestas

Todas las respuestas siguen un formato consistente:

**Éxito:**
```json
{
  "success": true,
  "message": "Mensaje descriptivo",
  "data": { ... }
}
```

**Error:**
```json
{
  "statusCode": 400,
  "message": "Descripción del error o array de errores",
  "error": "Tipo de error"
}
```

---

## 🔄 Próximas Funcionalidades

- [ ] Actualizar planta existente (PUT /plantas/:id)
- [ ] Eliminar planta (DELETE /plantas/:id)
- [ ] Obtener planta por ID (GET /plantas/:id)
- [ ] Paginación para listado de plantas
- [ ] Filtros avanzados (por tipo, variedad, etc.)
- [ ] Carga masiva de plantas desde CSV/JSON
- [ ] Búsqueda avanzada con múltiples criterios
- [ ] Historial de cambios en plantas
- [ ] Gestión de múltiples imágenes por planta

---

## 📚 Recursos Adicionales

- **Migración SQL:** Ver archivo `/migrations/update_planta_table_structure.sql`
- **DTO TypeScript:** `/src/plantas/dto/create-planta.dto.ts`
- **Servicio:** `/src/plantas/plantas.service.ts`
- **Controlador:** `/src/plantas/plantas.controller.ts`

---

## 📞 Soporte

Para reportar problemas o sugerencias, contactar al equipo de desarrollo del proyecto Reforesta.
