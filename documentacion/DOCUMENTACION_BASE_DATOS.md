# 📊 Documentación de Base de Datos - Sistema de Reforestación

## 📋 Descripción General del Proyecto

Sistema de gestión y seguimiento de viveros y plantaciones forestales que permite:
- Registro de recolecciones de material vegetal (semillas, esquejes, etc.)
- Gestión de lotes de vivero y sus eventos
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
- Un usuario puede crear lotes de vivero y registrar eventos
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
- Un vivero puede tener múltiples lotes de vivero
- Un vivero puede recibir múltiples recolecciones

---

### 5. 🌱 `planta`
Catálogo de especies vegetales con información taxonómica, morfológica y de uso.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `especie` | `text` | NOT NULL | Nombre de la especie |
| `nombre_cientifico` | `text` | NOT NULL | Nombre científico (género + especie) |
| `variedad` | `text` | NOT NULL | Variedad de la planta |
| `tipo_planta` | `text` | - | Tipo de planta (árbol, arbusto, hierba, etc.) |
| `tipo_planta_otro` | `text` | Requerido si tipo_planta='Otro' | Otro tipo no catalogado |
| `fuente` | `tipo_material_origen` | NOT NULL | Origen del material (SEMILLA, ESQUEJE) |
| `nombre_comun_principal` | `text` | - | Nombre común principal |
| `nombres_comunes` | `text` | - | Lista de nombres comunes separados por comas |
| `reino` | `text` | - | Reino taxonómico (ej: Plantae) |
| `division` | `text` | - | División taxonómica (ej: Magnoliophyta) |
| `clase` | `text` | - | Clase taxonómica (ej: Magnoliopsida) |
| `orden` | `text` | - | Orden taxonómico (ej: Fabales) |
| `familia` | `text` | - | Familia taxonómica (ej: Fabaceae) |
| `genero` | `text` | - | Género taxonómico (ej: Swietenia) |
| `origen_geografico` | `text` | - | Región o país de origen de la especie |
| `habitat_descripcion` | `text` | - | Descripción del hábitat natural |
| `descripcion_morfologica` | `text` | - | Descripción física de la planta |
| `usos_industriales` | `text` | - | Usos en industria y manufactura |
| `usos_medicinales` | `text` | - | Usos medicinales tradicionales o documentados |
| `usos_ornamentales` | `text` | - | Uso en jardinería y paisajismo |
| `advertencia_toxicidad` | `text` | - | Advertencias sobre toxicidad o peligros |
| `notas_manejo_recoleccion` | `text` | - | Notas sobre manejo y recolección |
| `imagen_url` | `text` | - | URL de imagen representativa de la planta |
| `created_at` | `timestamp with time zone` | NOT NULL, DEFAULT now() | Fecha de registro |

**Relaciones:**
- Una planta puede tener múltiples lotes de vivero
- Una planta puede estar en múltiples recolecciones

**Validaciones:**
- `tipo_planta_otro`: Solo requerido si `tipo_planta = 'Otro'` y debe contener al menos 1 carácter (sin espacios)

**Índices:**
```sql
CREATE UNIQUE INDEX uq_planta_cientifico_variedad 
ON planta USING btree (lower(nombre_cientifico), lower(variedad));
```
*Garantiza unicidad por nombre científico + variedad (case-insensitive)*

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
| `cantidad_inicial_canonica` | `numeric` | NOT NULL, > 0 | Cantidad en unidad canónica (G o UNIDAD) |
| `unidad_canonica` | `text` | NOT NULL | `G` para semillas en gramos, `UNIDAD` para esquejes |
| `tipo_material` | `tipo_material_origen` | NOT NULL | SEMILLA o ESQUEJE |
| `especie_nueva` | `boolean` | NOT NULL, DEFAULT false | ¿Es nueva especie? |
| `observaciones` | `text` | max 1000 chars | Notas adicionales |
| `usuario_id` | `bigint` | NOT NULL, FK | Usuario que registró |
| `ubicacion_id` | `bigint` | NOT NULL, FK | Ubicación de recolección |
| `vivero_id` | `bigint` | FK | Vivero de destino |
| `metodo_id` | `bigint` | NOT NULL, FK | Método de recolección |
| `planta_id` | `bigint` | FK | Planta asociada |
| `created_at` | `date` | NOT NULL, DEFAULT CURRENT_DATE | Fecha de registro |

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
| `created_at` | `date` | NOT NULL, DEFAULT CURRENT_DATE | Fecha de subida |

**Relaciones:**
- **recoleccion_id** → `recoleccion(id)`

**Regla de negocio:**
- Mínimo 2 fotos por recolección (validar en backend)

---

### 9. 🧪 `lote_vivero`
Gestiona los lotes de material vegetal dentro del vivero con snapshots del material de origen.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `recoleccion_id` | `bigint` | NOT NULL, FK | Recolección de origen |
| `planta_id` | `bigint` | NOT NULL, FK | Especie del lote |
| `vivero_id` | `bigint` | NOT NULL, FK | Vivero donde está |
| `responsable_id` | `bigint` | NOT NULL, FK | Responsable del lote |
| `nombre_cientifico_snapshot` | `text` | NOT NULL | Nombre científico al crear el lote |
| `nombre_comercial_snapshot` | `text` | NOT NULL | Nombre comercial al crear el lote |
| `tipo_material_snapshot` | `text` | NOT NULL | Tipo de material al crear el lote |
| `fecha_inicio` | `date` | NOT NULL | Fecha de inicio del lote |
| `cantidad_inicial_en_proceso` | `numeric` | NOT NULL | Cantidad inicial en proceso |
| `unidad_medida_inicial` | `unidad_medida` | NOT NULL | Unidad inicial |
| `plantas_vivas_iniciales` | `integer` | - | Plantas vivas iniciales |
| `saldo_vivo_actual` | `integer` | - | Saldo vivo actual |
| `subetapa_actual` | `subetapa_adaptabilidad` | - | Subetapa actual |
| `estado_lote` | `estado_lote_vivero` | NOT NULL, DEFAULT 'ACTIVO' | Estado del lote |
| `motivo_cierre` | `motivo_cierre_lote` | - | Motivo de cierre |
| `codigo_trazabilidad` | `text` | NOT NULL, UNIQUE | Código de trazabilidad |
| `created_at` | `date` | NOT NULL, DEFAULT CURRENT_DATE | Fecha de creación |
| `updated_at` | `date` | NOT NULL, DEFAULT CURRENT_DATE | Última actualización |

**Relaciones:**
- **recoleccion_id** → `recoleccion(id)`
- **planta_id** → `planta(id)`
- **vivero_id** → `vivero(id)`
- **responsable_id** → `usuario(id)`

---

### 10. 📋 `evento_lote_vivero`
Registra los eventos operativos de un lote de vivero.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `bigint` | PK, AUTO | Identificador único |
| `lote_id` | `bigint` | NOT NULL, FK | Lote asociado |
| `tipo_evento` | `tipo_evento_vivero` | NOT NULL | Tipo de evento |
| `fecha_evento` | `date` | NOT NULL | Fecha del evento |
| `created_at` | `date` | NOT NULL, DEFAULT CURRENT_DATE | Fecha de registro |
| `responsable_id` | `bigint` | NOT NULL, FK | Responsable del evento |
| `cantidad_afectada` | `numeric` | - | Cantidad afectada |
| `unidad_medida_evento` | `unidad_medida` | - | Unidad del evento |
| `causa_merma` | `causa_merma_vivero` | - | Causa de merma |
| `destino_tipo` | `destino_tipo_vivero` | - | Tipo de destino |
| `destino_referencia` | `text` | - | Referencia de destino |
| `comunidad_destino_id` | `bigint` | FK | Comunidad de destino |
| `subetapa_destino` | `subetapa_adaptabilidad` | - | Subetapa destino |
| `saldo_vivo_antes` | `integer` | - | Saldo antes del evento |
| `saldo_vivo_despues` | `integer` | - | Saldo después del evento |
| `motivo_cierre_calculado` | `motivo_cierre_lote` | - | Motivo de cierre calculado |
| `ref_evento_trigger_id` | `bigint` | FK | Evento relacionado |
| `metadata_blockchain` | `jsonb` | - | Metadata blockchain |
| `observaciones` | `text` | - | Observaciones |

**Relaciones:**
- **lote_id** → `lote_vivero(id)`
- **responsable_id** → `usuario(id)`
- **comunidad_destino_id** → `division_administrativa(id)`
- **ref_evento_trigger_id** → `evento_lote_vivero(id)`

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


### `estado_lote_vivero`
```sql
'ACTIVO'
'FINALIZADO'
```

### `tipo_evento_vivero`
```sql
'INICIO'
'EMBOLSADO'
'ADAPTABILIDAD'
'MERMA'
'DESPACHO'
'CIERRE_AUTOMATICO'
```

### `motivo_cierre_lote`
```sql
'DESPACHO_TOTAL'
'PERDIDA_TOTAL'
'MIXTO'
```

### `subetapa_adaptabilidad`
```sql
'SOMBRA'
'MEDIA_SOMBRA'
'SOL_DIRECTO'
```

### `causa_merma_vivero`
```sql
'PLAGA'
'ENFERMEDAD'
'SEQUIA'
'DANO_FISICO'
'MUERTE_NATURAL'
'DESCARTE_CALIDAD'
'OTRO'
```

### `destino_tipo_vivero`
```sql
'PLANTACION_PROPIA'
'DONACION_COMUNIDAD'
'VENTA'
'OTRO'
```

### `unidad_medida`
```sql
'UNIDAD'
'GR'
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
 ├─< lote_vivero >─ vivero
 │          └─< evento_lote_vivero
 └─< plantacion >─ ubicacion
            ├─< plantacion_foto
            ├─< plantacion_monitoreo
            └─< plantacion_usuario

recoleccion -> lote_vivero (1:N)
lote_vivero -> evento_lote_vivero (1:N)
plantacion <-> tipo_riego (N:M)
plantacion <-> tipo_abono (N:M)
```

---

## 📊 Flujo de Trabajo del Sistema

### 1️⃣ Recolección de Material
```
Usuario → Recolecta material → Registra ubicación → Asigna vivero destino
```

### 2️⃣ Vivero
```
Crea lote de vivero → Registra eventos: INICIO, EMBOLSADO, ADAPTABILIDAD, MERMA o DESPACHO
```

### 3️⃣ Plantación en Campo
```
Se crea plantación → Se registran riego, abono y fotos
```

### 4️⃣ Monitoreo y Auditoría
```
Monitoreos periódicos → Registro de estado y mortalidad
Eventos operativos en EVENTO_LOTE_VIVERO
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
- Lotes de vivero bajo su responsabilidad
- Plantaciones registradas o en las que participa
- Monitoreos realizados

### Por Vivero
- Cantidad de lotes de vivero activos por estado
- Especies en proceso
- Capacidad utilizada vs disponible

### Por Plantación
- Superficie plantada por destino
- Evolución de supervivencia por monitoreos

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

-- Lotes de vivero
CREATE INDEX idx_lote_vivero_recoleccion_id ON lote_vivero(recoleccion_id);
CREATE INDEX idx_lote_vivero_vivero_id ON lote_vivero(vivero_id);
CREATE INDEX idx_lote_vivero_estado_lote ON lote_vivero(estado_lote);

-- Eventos de lotes de vivero
CREATE INDEX idx_evento_lote_vivero_lote_fecha ON evento_lote_vivero(lote_id, fecha_evento);
CREATE INDEX idx_evento_lote_vivero_tipo_evento ON evento_lote_vivero(tipo_evento);
CREATE INDEX idx_evento_lote_vivero_responsable_id ON evento_lote_vivero(responsable_id);

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
-- Actualizar updated_at automáticamente en LOTE_VIVERO
-- Registrar eventos derivados cuando el cierre del lote sea automático
-- Validar consistencia de saldos entre eventos
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
**Total de Tablas:** Pendiente de consolidar tras la migración del modelo de vivero
**Última actualización:** Alineada con `db-strucuture.md` (vFinal + Módulo Plantación)
