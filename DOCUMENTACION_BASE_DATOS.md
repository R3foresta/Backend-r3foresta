# 📊 Documentación de Base de Datos - Sistema de Reforestación

## 📋 Descripción General del Proyecto

Sistema de gestión y seguimiento de viveros y plantaciones forestales que permite:
- Registro de recolecciones de material vegetal (semillas, esquejes, etc.)
- Gestión de fase vivero (lotes de plantines) y sus transiciones
- Plantación en campo con riego, abono, fotos y monitoreo
- Trazabilidad completa desde la recolección hasta la plantación
- Gestión de usuarios con roles y autenticación

**Base de Datos:** PostgreSQL (Supabase)

---

## 🗂️ Tablas del Sistema

### 1. 👤 `usuario`
Almacena información de los usuarios del sistema.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `userid` | `text` | - | Handle visible (ej: andy, pablex) |
| `nombre` | `text` | NOT NULL | Nombre completo del usuario |
| `doc_identidad` | `text` | UNIQUE, opcional | Documento de identidad |
| `wallet_address` | `text` | UNIQUE, opcional; formato 0x... | Dirección de wallet blockchain |
| `organizacion` | `text` | - | Organización a la que pertenece |
| `contacto` | `text` | opcional; formato +número | Teléfono (formato internacional) |
| `rol` | `rol_usuario` | NOT NULL, DEFAULT 'GENERAL' | Rol del usuario |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

**Relaciones:**
- Un usuario puede registrar múltiples recolecciones
- Un usuario puede crear y actualizar lotes de fase vivero
- Un usuario puede registrar plantaciones y participar en ellas
- Un usuario puede registrar monitoreos de plantación
- **Un usuario puede tener múltiples credenciales WebAuthn** → `usuario_credencial(usuario_id)` (1:N)

**Validaciones:**
- `wallet_address`: Debe seguir formato Ethereum `^0x[0-9a-fA-F]{40}$`
- `contacto`: Formato internacional `^\+\d{7,15}$`

---

### 2. 🔐 `usuario_credencial`
Almacena las credenciales de WebAuthn (passkeys) para autenticación biométrica sin contraseña.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `usuario_id` | `bigint` | NOT NULL, FK | Usuario propietario de la credencial |
| `credential_id` | `text` | NOT NULL, UNIQUE | ID único de la credencial generado por WebAuthn |
| `public_key` | `text` | NOT NULL | Clave pública en formato base64 |
| `algorithm` | `text` | NOT NULL, DEFAULT 'ES256' | Algoritmo criptográfico usado |
| `counter` | `integer` | NOT NULL, DEFAULT 0 | Contador anti-replay, incrementa con cada uso |
| `transports` | `text[]` | - | Métodos de transporte: internal, usb, nfc, ble, hybrid |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de creación de la credencial |
| `last_used_at` | `timestamp with time zone` | - | Fecha del último uso de la credencial |

**Relaciones:**
- **usuario_id** → `usuario(id)` ON DELETE CASCADE

**Índices:**
```sql
CREATE INDEX idx_usuario_credencial_usuario_id ON usuario_credencial(usuario_id);
CREATE INDEX idx_usuario_credencial_credential_id ON usuario_credencial(credential_id);
```

---

### 3. 📍 `ubicacion`
Almacena coordenadas geográficas y detalles de ubicación.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `pais` | `text` | - | País |
| `departamento` | `text` | - | Departamento/Estado |
| `provincia` | `text` | - | Provincia/Municipio |
| `comunidad` | `text` | - | Comunidad |
| `zona` | `text` | - | Zona específica |
| `latitud` | `numeric` | NOT NULL, -90 a 90 | Coordenada latitud |
| `longitud` | `numeric` | NOT NULL, -180 a 180 | Coordenada longitud |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

**Relaciones:**
- Una ubicación puede tener un vivero (1:1)
- Una ubicación puede tener múltiples recolecciones
- Una ubicación puede tener múltiples plantaciones

---

### 4. 🏡 `vivero`
Registra los viveros forestales.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `codigo` | `text` | UNIQUE | Código único del vivero (ej: VIV-001) |
| `nombre` | `text` | UNIQUE (case-insensitive) | Nombre del vivero |
| `ubicacion_id` | `bigint` | NOT NULL, UNIQUE, FK | Referencia a ubicación |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de creación |

**Relaciones:**
- **ubicacion_id** → `ubicacion(id)` (1:1)
- Un vivero puede tener múltiples lotes de fase vivero
- Un vivero puede recibir múltiples recolecciones

---

### 5. 🌱 `planta`
Catálogo de especies vegetales.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `especie` | `text` | NOT NULL | Nombre de la especie |
| `nombre_cientifico` | `text` | NOT NULL | Nombre científico (género + especie) |
| `variedad` | `text` | NOT NULL | Variedad de la planta |
| `tipo_planta` | `text` | - | Tipo de planta (árbol, arbusto, etc.) |
| `tipo_planta_otro` | `text` | Requerido si tipo_planta=Otro | Otro tipo no catalogado |
| `fuente` | `tipo_material_origen` | NOT NULL | Origen (SEMILLA, ESQUEJE) |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

**Relaciones:**
- Una planta puede tener múltiples lotes de fase vivero
- Una planta puede estar en múltiples recolecciones

---

### 6. 🔄 `metodo_recoleccion`
Catálogo de métodos de recolección.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `nombre` | `text` | UNIQUE (case-insensitive) | Nombre del método |
| `descripcion` | `text` | - | Descripción del método |

---

### 7. 📦 `recoleccion`
Registra las recolecciones de material vegetal.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `codigo_trazabilidad` | `text` | UNIQUE | Código tipo `REC-YYYY-XXXXX` |
| `fecha` | `date` | NOT NULL, últimos 45 días | Fecha de recolección |
| `nombre_cientifico` | `text` | opcional | Requerido si no hay `planta_id` |
| `nombre_comercial` | `text` | opcional | Requerido si no hay `planta_id` |
| `cantidad` | `numeric` | NOT NULL, > 0 | Cantidad recolectada |
| `unidad` | `text` | NOT NULL | UNIDAD/UNIDADES para ESQUEJE; KG/G para SEMILLA |
| `tipo_material` | `tipo_material_origen` | NOT NULL | SEMILLA o ESQUEJE |
| `estado` | `estado_recoleccion` | NOT NULL, DEFAULT 'ALMACENADO' | Estado actual |
| `especie_nueva` | `boolean` | NOT NULL, DEFAULT false | ¿Es nueva especie? |
| `observaciones` | `text` | max 1000 chars | Notas adicionales |
| `usuario_id` | `bigint` | NOT NULL, FK | Usuario que registró |
| `ubicacion_id` | `bigint` | NOT NULL, FK | Ubicación de recolección |
| `vivero_id` | `bigint` | FK | Vivero de destino |
| `metodo_id` | `bigint` | NOT NULL, FK | Método de recolección |
| `planta_id` | `bigint` | FK | Planta asociada |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

**Relaciones:**
- **usuario_id** → `usuario(id)`
- **ubicacion_id** → `ubicacion(id)`
- **vivero_id** → `vivero(id)`
- **metodo_id** → `metodo_recoleccion(id)`
- **planta_id** → `planta(id)`

---

### 8. 📸 `recoleccion_foto`
Almacena fotos asociadas a recolecciones.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `recoleccion_id` | `bigint` | NOT NULL, FK | Recolección asociada |
| `url` | `text` | NOT NULL | URL de la imagen |
| `peso_bytes` | `integer` | max 5MB | Tamaño del archivo |
| `formato` | `text` | JPG, JPEG, PNG | Formato de imagen |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de subida |

**Relaciones:**
- **recoleccion_id** → `recoleccion(id)`

**Regla de negocio:**
- Mínimo 2 fotos por recolección (validar en backend)

---

### 9. 🧪 `lote_fase_vivero`
Gestiona lotes de plantines en fase de vivero.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `codigo_trazabilidad` | `text` | UNIQUE | Código tipo `LFV-YYYY-XXXXX` |
| `planta_id` | `bigint` | NOT NULL, FK | Especie del lote |
| `vivero_id` | `bigint` | NOT NULL, FK | Vivero donde está |
| `responsable_id` | `bigint` | NOT NULL, FK | Responsable del lote |
| `fecha_inicio` | `date` | NOT NULL | Fecha de inicio del lote |
| `cantidad_inicio` | `integer` | NOT NULL | Cantidad inicial |
| `cantidad_embolsadas` | `integer` | NOT NULL, DEFAULT 0 | Plantas embolsadas |
| `cantidad_sombra` | `integer` | NOT NULL, DEFAULT 0 | Plantas en sombra |
| `cantidad_lista_plantar` | `integer` | NOT NULL, DEFAULT 0 | Listas para plantar |
| `fecha_embolsado` | `date` | - | Fecha de embolsado |
| `fecha_sombra` | `date` | - | Fecha ingreso a sombra |
| `fecha_salida` | `date` | - | Fecha de salida del vivero |
| `altura_prom_sombra` | `numeric` | - | Altura promedio al entrar a sombra |
| `altura_prom_salida` | `numeric` | - | Altura promedio al salir |
| `estado` | `lote_fase_vivero_estado` | NOT NULL, DEFAULT 'INICIO' | Estado actual |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de creación |
| `updated_at` | `timestamp with time zone` | - | Última actualización |
| `updated_by` | `bigint` | FK | Usuario que actualizó (obligatorio en UPDATE) |

**Relaciones:**
- **planta_id** → `planta(id)`
- **vivero_id** → `vivero(id)`
- **responsable_id** → `usuario(id)`
- **updated_by** → `usuario(id)`

---

### 10. 📋 `lote_fase_vivero_historial`
Registra los cambios realizados en un lote de fase vivero.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `lote_id` | `bigint` | NOT NULL, FK | Lote al que pertenece |
| `nro_cambio` | `integer` | UNIQUE por lote | Número secuencial del cambio |
| `fecha_cambio` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Cuándo se hizo el cambio |
| `responsable_id` | `bigint` | NOT NULL, FK | Quién hizo el cambio |
| `accion` | `accion_historial_lote` | NOT NULL | Tipo de acción |
| `estado` | `lote_fase_vivero_estado` | NOT NULL | Estado después del cambio |
| `cantidad_inicio` | `integer` | - | Snapshot: cantidad inicial |
| `cantidad_embolsadas` | `integer` | - | Snapshot: embolsadas |
| `cantidad_sombra` | `integer` | - | Snapshot: en sombra |
| `cantidad_lista_plantar` | `integer` | - | Snapshot: listas |
| `fecha_inicio` | `date` | - | Snapshot: fecha inicio |
| `fecha_embolsado` | `date` | - | Snapshot: fecha embolsado |
| `fecha_sombra` | `date` | - | Snapshot: fecha sombra |
| `fecha_salida` | `date` | - | Snapshot: fecha salida |
| `altura_prom_sombra` | `numeric` | - | Snapshot: altura sombra |
| `altura_prom_salida` | `numeric` | - | Snapshot: altura salida |
| `notas` | `text` | max 2000 chars | Observaciones del cambio |

**Relaciones:**
- **lote_id** → `lote_fase_vivero(id)`
- **responsable_id** → `usuario(id)`

**Propósito:**
- Auditoría y trazabilidad completa de modificaciones

---

### 11. 📷 `lote_fase_vivero_foto`
Almacena fotos asociadas a un cambio en el historial de un lote de fase vivero.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `lote_historial_id` | `bigint` | NOT NULL, FK | Referencia al historial del lote |
| `url` | `text` | NOT NULL | URL de la imagen |
| `peso_bytes` | `integer` | max 5MB | Tamaño del archivo |
| `formato` | `text` | JPG, JPEG, PNG | Formato de imagen |
| `es_portada` | `boolean` | - | TRUE si es la foto principal de ese cambio |
| `descripcion` | `text` | - | Descripción (ej: detalle de raíces, vista general) |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de subida |

**Relaciones:**
- **lote_historial_id** → `lote_fase_vivero_historial(id)`

---

### 12. 🔗 `lote_fase_vivero_recoleccion`
Relación N:M entre lotes de fase vivero y recolecciones.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `lote_id` | `bigint` | PK, FK | Lote de fase vivero |
| `recoleccion_id` | `bigint` | PK, FK | Recolección de origen |

---

### 13. 💧 `tipo_riego`
Catálogo de tipos de riego.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `nombre` | `text` | UNIQUE | Botellas recicladas, Goteo, Natural, Inundación |
| `descripcion` | `text` | - | Descripción |

---

### 14. 🌿 `tipo_abono`
Catálogo de tipos de abono.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `nombre` | `text` | UNIQUE | Humus, Tierra negra, Compost, etc. |
| `descripcion` | `text` | - | Descripción |

---

### 15. 🌳 `plantacion`
Registra plantaciones en campo.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `codigo_trazabilidad` | `text` | UNIQUE | Código tipo `PLA-YYYY-XXXXX` |
| `destino` | `destino_plantacion` | NOT NULL | ARBORIZACION, FORESTACION, REFORESTACION |
| `ubicacion_id` | `bigint` | NOT NULL, FK | Ubicación donde se plantó |
| `cantidad_arboles` | `integer` | NOT NULL, > 0 | Cantidad de árboles |
| `fecha_plantacion` | `date` | NOT NULL | Fecha de plantación |
| `superficie_m2` | `numeric` | - | Área de la plantación |
| `tamano_promedio_cm` | `numeric` | - | Tamaño promedio al plantar |
| `propietario` | `text` | - | Nombre del dueño del terreno |
| `origen_propiedad` | `origen_propiedad` | - | DONADO, ADQUIRIDO, OTRO, NULL |
| `frecuencia_monitoreo_dias` | `integer` | - | Cada cuántos días se monitorea |
| `created_by` | `bigint` | NOT NULL, FK | Usuario que registra |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

**Relaciones:**
- **ubicacion_id** → `ubicacion(id)`
- **created_by** → `usuario(id)`

---

### 16. 👥 `plantacion_usuario`
Relación de usuarios participantes en una plantación.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `plantacion_id` | `bigint` | PK, FK | Plantación |
| `usuario_id` | `bigint` | PK, FK | Usuario participante |
| `rol` | `text` | - | RESPONSABLE / VOLUNTARIO / TECNICO / etc. |

---

### 17. 🔗 `plantacion_lote_fase_vivero`
Relación N:M entre plantaciones y lotes de fase vivero.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `plantacion_id` | `bigint` | PK, FK | Plantación |
| `lote_fase_vivero_id` | `bigint` | PK, FK | Lote de fase vivero |
| `cantidad_plantines_usados` | `integer` | NOT NULL, > 0 | Plantines usados |

---

### 18. 🚿 `plantacion_riego`
Relación N:M entre plantaciones y tipos de riego.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `plantacion_id` | `bigint` | PK, FK | Plantación |
| `tipo_riego_id` | `bigint` | PK, FK | Tipo de riego |

---

### 19. 🧫 `plantacion_abono`
Relación N:M entre plantaciones y tipos de abono.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `plantacion_id` | `bigint` | PK, FK | Plantación |
| `tipo_abono_id` | `bigint` | PK, FK | Tipo de abono |

---

### 20. 📷 `plantacion_foto`
Almacena fotos asociadas a una plantación.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `plantacion_id` | `bigint` | NOT NULL, FK | Plantación asociada |
| `url` | `text` | NOT NULL | URL de la imagen |
| `peso_bytes` | `integer` | max 5MB | Tamaño del archivo |
| `formato` | `text` | JPG, JPEG, PNG | Formato de imagen |
| `descripcion` | `text` | - | Descripción de la foto |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de subida |

---

### 21. 📊 `plantacion_monitoreo`
Registra monitoreos de una plantación.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `plantacion_id` | `bigint` | NOT NULL, FK | Plantación asociada |
| `fecha_monitoreo` | `date` | NOT NULL | Fecha del monitoreo |
| `arboles_vivos` | `integer` | - | Cantidad de árboles vivos |
| `arboles_muertos` | `integer` | - | Cantidad de árboles muertos |
| `arboles_reemplazados` | `integer` | - | Cantidad de árboles reemplazados |
| `notas` | `text` | - | Observaciones |
| `usuario_id` | `bigint` | NOT NULL, FK | Usuario que monitorea |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

---

## 🎯 Tipos de Datos Personalizados (ENUMs)

### `rol_usuario`
```sql
'RECOLECTOR'
'VIVERO'
'VOLUNTARIO'
'GENERAL'
```

### `tipo_material_origen`
```sql
'SEMILLA'
'ESQUEJE'
```

### `estado_recoleccion`
```sql
'ALMACENADO'
'USADO'
'DESECHADO'
```

### `lote_fase_vivero_estado`
```sql
'INICIO'
'EMBOLSADO'
'SOMBRA'
'LISTA_PLANTAR'
'SALIDA_VIVERO'
```

### `accion_historial_lote`
```sql
'INICIO'
'EMBOLSADO'
'SOMBRA'
'LISTA_PLANTAR'
'SALIDA'
'AJUSTE'
```

### `destino_plantacion`
```sql
'ARBORIZACION'
'FORESTACION'
'REFORESTACION'
```

### `origen_propiedad`
```sql
'DONADO'
'ADQUIRIDO'
'OTRO'
'NULL'
```

---

## 🔄 Diagrama de Relaciones Principales

Diagrama completo en `db-strucuture.md`. Resumen de relaciones clave:

```
usuario
 ├─< recoleccion >─ ubicacion
 │                ├─ vivero
 │                ├─ planta
 │                └─ metodo_recoleccion
 ├─< lote_fase_vivero >─ vivero
 │          └─< lote_fase_vivero_historial
 │                    └─< lote_fase_vivero_foto
 └─< plantacion >─ ubicacion
            ├─< plantacion_foto
            ├─< plantacion_monitoreo
            └─< plantacion_usuario

recoleccion <-> lote_fase_vivero (N:M)
plantacion <-> lote_fase_vivero (N:M)
plantacion <-> tipo_riego (N:M)
plantacion <-> tipo_abono (N:M)
```

---

## 📊 Flujo de Trabajo del Sistema

### 1️⃣ Recolección de Material
```
Usuario → Recolecta material → Registra ubicación → Asigna vivero destino
```

### 2️⃣ Fase Vivero
```
Crea lote (LFV) → Transiciones: INICIO → EMBOLSADO → SOMBRA → LISTA_PLANTAR → SALIDA_VIVERO
```

### 3️⃣ Plantación en Campo
```
Se crea plantación → Se vinculan lotes LFV → Se registran riego, abono y fotos
```

### 4️⃣ Monitoreo y Auditoría
```
Monitoreos periódicos → Registro de estado y mortalidad
Historial automático en LOTE_FASE_VIVERO_HISTORIAL con fotos en LOTE_FASE_VIVERO_FOTO
```

---

## 🔐 Integración con WebAuthn

El sistema implementa autenticación biométrica sin contraseña usando passkeys.

### ✅ Tabla Implementada

**Tabla `usuario_credencial`:**
- Almacena credenciales WebAuthn por usuario
- Relación 1:N con `usuario`
- Cada credencial contiene `credential_id`, `public_key`, `counter`, `transports`

### 🔄 Flujo de Autenticación

#### Registro (Sign Up)
```
1. Usuario solicita challenge → Backend genera challenge aleatorio
2. Frontend activa WebAuthn → Navegador muestra prompt biométrico
3. Dispositivo genera par de claves → Se almacena la clave pública
4. Backend guarda la credencial → Retorna JWT token
```

#### Login
```
1. Usuario solicita challenge → Backend genera challenge
2. WebAuthn solicita autenticación → Usuario confirma con biométrica
3. Dispositivo firma challenge → Backend verifica con public_key
4. Backend actualiza counter → Retorna JWT token
```

### 📊 Endpoints Implementados

```
GET  /api/auth/challenge           → Obtener challenge para autenticación
POST /api/auth/register            → Registrar nueva credencial y usuario
POST /api/auth/login               → Autenticar con credencial existente
GET  /api/auth/test-supabase       → Verificar conexión a base de datos
```

---

## 📈 Métricas y Reportes Posibles

### Por Usuario
- Total de recolecciones realizadas
- Lotes LFV bajo su responsabilidad
- Plantaciones registradas o en las que participa
- Monitoreos realizados

### Por Vivero
- Cantidad de lotes LFV activos por estado
- Especies en proceso
- Capacidad utilizada vs disponible

### Por Plantación
- Superficie plantada por destino
- Evolución de supervivencia por monitoreos
- Lotes LFV utilizados y trazabilidad

### Por Especie (Planta)
- Total de recolecciones
- Lotes activos y plantaciones asociadas

---

## 🛠️ Consideraciones Técnicas

### Índices Recomendados
```sql
-- Recolecciones
CREATE INDEX idx_recoleccion_usuario ON recoleccion(usuario_id);
CREATE INDEX idx_recoleccion_fecha ON recoleccion(fecha);
CREATE UNIQUE INDEX idx_recoleccion_codigo ON recoleccion(codigo_trazabilidad);

-- Lotes fase vivero
CREATE INDEX idx_lfv_estado ON lote_fase_vivero(estado);
CREATE INDEX idx_lfv_vivero ON lote_fase_vivero(vivero_id);
CREATE INDEX idx_lfv_historial_lote ON lote_fase_vivero_historial(lote_id);
CREATE INDEX idx_lfv_foto_historial ON lote_fase_vivero_foto(lote_historial_id);

-- Plantaciones
CREATE INDEX idx_plantacion_fecha ON plantacion(fecha_plantacion);
CREATE INDEX idx_plantacion_destino ON plantacion(destino);
CREATE INDEX idx_plantacion_ubicacion ON plantacion(ubicacion_id);

-- Autenticación WebAuthn
CREATE INDEX idx_usuario_credencial_usuario_id ON usuario_credencial(usuario_id);
CREATE INDEX idx_usuario_credencial_credential_id ON usuario_credencial(credential_id);
```

### Triggers Sugeridos
```sql
-- Actualizar updated_at automáticamente en LOTE_FASE_VIVERO
-- Registrar automáticamente en LOTE_FASE_VIVERO_HISTORIAL
-- Validar transiciones de estado en LOTE_FASE_VIVERO
```

### Políticas de Seguridad (RLS - Supabase)
- Usuarios solo ven sus propias recolecciones
- Admins/roles con privilegios ven todo
- Técnicos de vivero ven sus lotes
- Participantes solo ven plantaciones asignadas
- **Usuarios solo acceden a sus propias credenciales WebAuthn**

---

## 📝 Notas Finales

Este sistema permite:
- ✅ Trazabilidad completa desde recolección hasta plantación
- ✅ Control de calidad en cada etapa
- ✅ Auditoría de cambios
- ✅ Geolocalización precisa
- ✅ Gestión de múltiples viveros
- ✅ Reportes y estadísticas
- ✅ Autenticación biométrica sin contraseña (WebAuthn)

**Base de Datos:** PostgreSQL en Supabase  
**Total de Tablas:** 21 (20 del dominio + 1 de autenticación)  
**Última actualización:** Alineada con `db-strucuture.md` (vFinal + Módulo Plantación)
