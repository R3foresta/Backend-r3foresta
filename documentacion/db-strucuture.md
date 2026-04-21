 Nuevo Diagrama:
erDiagram

  PAIS {
    bigint id PK
    text nombre
    character codigo_iso2 "UNIQUE"
    character codigo_iso3
    boolean activo
    timestamptz created_at
  }

  DIVISION_TIPO {
    bigint id PK
    bigint pais_id FK
    text nombre
    int orden
    boolean activo
    timestamptz created_at
  }

  DIVISION_ADMINISTRATIVA {
    bigint id PK
    bigint pais_id FK
    bigint parent_id FK "self"
    bigint tipo_id FK
    text nombre
    text codigo_externo
    boolean activo
    bigint reemplazada_por_id FK "self"
    timestamptz created_at
    timestamptz updated_at
  }

  UBICACION {
    bigint id PK
    numeric latitud
    numeric longitud
    timestamptz created_at
    bigint pais_id FK
    bigint division_id FK
    text nombre
    int precision_m
    text fuente
    text referencia
    timestamptz updated_at
  }

  USUARIO {
    bigint id PK
    text nombre
    text apellido
    text doc_identidad "UNIQUE"
    text wallet_address "UNIQUE"
    text organizacion
    text contacto
    ENUM(rol_usuario) rol
    timestamptz created_at
    text username "UNIQUE"
    text auth_id
    text correo "UNIQUE"
    text foto_perfil_url
  }

  USUARIO_CREDENCIAL {
    bigint id PK
    bigint usuario_id FK
    text credential_id "UNIQUE"
    text public_key
    text algorithm
    int counter
    ARRAY transports
    timestamptz created_at
    timestamptz last_used_at
  }

  TIPOS_ENTIDAD_EVIDENCIA {
    smallint id PK
    text codigo "UNIQUE"
    text descripcion
    boolean activo
    timestamptz creado_en
  }

  EVIDENCIAS_TRAZABILIDAD {
    bigint id PK
    smallint tipo_entidad_id FK
    bigint entidad_id "polimórfico"
    text codigo_trazabilidad
    text bucket
    text ruta_archivo
    uuid storage_object_id
    text tipo_archivo
    text mime_type
    bigint tamano_bytes
    text hash_sha256
    text titulo
    text descripcion
    jsonb metadata
    boolean es_principal
    int orden
    timestamptz tomado_en
    timestamptz creado_en
    timestamptz actualizado_en
    timestamptz eliminado_en
    bigint creado_por_usuario_id FK
    bigint actualizado_por_usuario_id FK
    bigint eliminado_por_usuario_id FK
  }

  VIVERO {
    bigint id PK
    text codigo "UNIQUE"
    text nombre
    bigint ubicacion_id FK "UNIQUE"
    timestamptz created_at
  }

  TIPO_PLANTA {
    int id PK
    text nombre "UNIQUE"
    timestamptz created_at
  }

  PLANTA {
    bigint id PK
    text especie
    text nombre_cientifico
    text variedad
    timestamptz created_at
    text nombre_comun_principal
    text nombres_comunes
    text imagen_url
    text notas
    int tipo_planta_id FK
  }

  METODO_RECOLECCION {
    bigint id PK
    text nombre
    text descripcion
  }

  RECOLECCION {
    bigint id PK
    date fecha
    ENUM(tipo_material_origen) tipo_material
    boolean especie_nueva
    text observaciones
    bigint usuario_id FK
    bigint ubicacion_id FK
    bigint vivero_id FK
    bigint metodo_id FK
    bigint planta_id FK
    timestamptz created_at
    text codigo_trazabilidad "UNIQUE"
    text blockchain_url
    text token_id
    text transaction_hash
    ENUM(estado_registro_recoleccion) estado_registro
    text unidad_canonica
    numeric cantidad_inicial_canonica
    bigint usuario_validacion_id FK
    timestamptz fecha_validacion
    text blockchain_tx_validacion
    numeric saldo_actual
    ENUM(estado_operativo_recoleccion) estado_operativo
  }

  RECOLECCION_FOTO {
    bigint id PK
    bigint recoleccion_id FK
    text url
    int peso_bytes
    text formato
    timestamptz created_at
  }

  RECOLECCION_MOVIMIENTO {
    bigint id PK
    bigint recoleccion_id FK
    ENUM(tipo_movimiento_recoleccion) tipo_movimiento
    numeric delta
    ENUM(unidad_medida) unidad_medida_movimiento "[ MODIFICAR ]"
    ENUM(motivo_movimiento_recoleccion) motivo
    text motivo_otro
    bigint lote_vivero_id "FK a LOTE_VIVERO"
    jsonb detalle_cambios
    bigint created_by FK
    timestamptz created_at
    text blockchain_tx_hash
  }

  LOTE_VIVERO {
    bigint id PK
    bigint recoleccion_id FK "NOT NULL - origen único por lote, sin UNIQUE"
    bigint planta_id FK "NOT NULL"
    bigint vivero_id FK "NOT NULL"
    bigint responsable_id FK "NOT NULL"
    text nombre_cientifico_snapshot "NOT NULL - congelado al crear"
    text nombre_comercial_snapshot "NOT NULL - congelado al crear"
    ENUM(tipo_material_origen) tipo_material_snapshot "NOT NULL - congelado al crear"
    date fecha_inicio "NOT NULL"
    numeric cantidad_inicial_en_proceso "NOT NULL - lectura operativa de inicio"
    ENUM(unidad_medida) unidad_medida_inicial "NOT NULL - UNIDAD | GR"
    int plantas_vivas_iniciales "nullable - materializado al registrar EMBOLSADO"
    int saldo_vivo_actual "nullable - caché controlada, nunca editar directo"
    ENUM(subetapa_adaptabilidad) subetapa_actual "nullable - SOMBRA | MEDIA_SOMBRA | SOL_DIRECTO"
    ENUM(estado_lote_vivero) estado_lote "NOT NULL - ACTIVO | FINALIZADO, default ACTIVO"
    ENUM(motivo_cierre_lote) motivo_cierre "nullable - DESPACHO_TOTAL | PERDIDA_TOTAL | MIXTO"
    text codigo_trazabilidad "NOT NULL - UNIQUE"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
}

EVENTO_LOTE_VIVERO {
    bigint id PK
    bigint lote_id FK "NOT NULL"
    ENUM(tipo_evento_vivero) tipo_evento "NOT NULL - INICIO | EMBOLSADO | ADAPTABILIDAD | MERMA | DESPACHO | CIERRE_AUTOMATICO"
    date fecha_evento "NOT NULL"
    timestamptz created_at "NOT NULL - inmutable, cuándo se guardó realmente"
    bigint responsable_id FK "NOT NULL"
    numeric cantidad_afectada "nullable - plantas o unidades según tipo_evento"
    ENUM(unidad_medida) unidad_medida_evento "nullable - UNIDAD | GR"
    ENUM(causa_merma_vivero) causa_merma "nullable - solo aplica en MERMA"
    ENUM(destino_tipo_vivero) destino_tipo "nullable - solo aplica en DESPACHO"
    text destino_referencia "nullable - solo aplica en DESPACHO"
    bigint comunidad_destino_id FK "nullable - referencia a DIVISION_ADMINISTRATIVA(id), solo aplica en DESPACHO"
    ENUM(subetapa_adaptabilidad) subetapa_destino "nullable - SOMBRA | MEDIA_SOMBRA | SOL_DIRECTO"
    int saldo_vivo_antes "nullable - calculado por sistema"
    int saldo_vivo_despues "nullable - calculado por sistema"
    ENUM(motivo_cierre_lote) motivo_cierre_calculado "nullable - DESPACHO_TOTAL | PERDIDA_TOTAL | MIXTO"
    bigint ref_evento_trigger_id FK "nullable - autorreferencia, solo aplica en CIERRE_AUTOMATICO"
    jsonb metadata_blockchain "nullable - solo aplica en DESPACHO con anclaje activo"
    text observaciones "nullable"
}

  PLANTACION {
    bigint id PK
    text codigo_trazabilidad "UNIQUE"
    text destino
    int ubicacion_id FK
    int cantidad_arboles
    date fecha_plantacion
    numeric superficie_m2
    numeric tamano_promedio_cm
    text propietario
    text origen_propiedad
    int frecuencia_monitoreo_dias
    int created_by FK
    timestamptz created_at
  }

  TIPO_ABONO {
    int id PK
    text nombre "UNIQUE"
    text descripcion
  }

  TIPO_RIEGO {
    int id PK
    text nombre "UNIQUE"
    text descripcion
  }

  PLANTACION_ABONO {
    bigint plantacion_id PK
    int tipo_abono_id PK
  }

  PLANTACION_RIEGO {
    bigint plantacion_id PK
    int tipo_riego_id PK
  }

  PLANTACION_USUARIO {
    bigint plantacion_id PK
    int usuario_id PK
    text rol
  }

  PLANTACION_FOTO {
    bigint id PK
    bigint plantacion_id FK
    text url
    int peso_bytes
    text formato
    text descripcion
  }

  PLANTACION_MONITOREO {
    bigint id PK
    bigint plantacion_id FK
    date fecha_monitoreo
    int arboles_vivos
    int arboles_muertos
    int arboles_reemplazados
    text notas
    int usuario_id FK
    timestamptz created_at
  }

  PLANTACION_LOTE_VIVERO {
    bigint plantacion_id PK
    bigint lote_vivero_id PK
    int cantidad_plantines_usados
  }

  %% === Relaciones sin cambio ===

  PAIS ||--o{ DIVISION_TIPO : tiene
  PAIS ||--o{ DIVISION_ADMINISTRATIVA : tiene
  PAIS ||--o{ UBICACION : tiene
  DIVISION_TIPO ||--o{ DIVISION_ADMINISTRATIVA : clasifica
  DIVISION_ADMINISTRATIVA ||--o{ DIVISION_ADMINISTRATIVA : parent
  DIVISION_ADMINISTRATIVA ||--o{ DIVISION_ADMINISTRATIVA : reemplaza
  UBICACION }o--|| DIVISION_ADMINISTRATIVA : pertenece_a
  UBICACION ||--|| VIVERO : ubicacion_unica
  USUARIO ||--o{ USUARIO_CREDENCIAL : tiene
  USUARIO ||--o{ RECOLECCION : registra
  UBICACION ||--o{ RECOLECCION : ocurre_en
  VIVERO ||--o{ RECOLECCION : almacena_en
  METODO_RECOLECCION ||--o{ RECOLECCION : metodo
  PLANTA ||--o{ RECOLECCION : identifica
  RECOLECCION ||--o{ RECOLECCION_FOTO : fotos
  RECOLECCION ||--o{ RECOLECCION_MOVIMIENTO : movimientos
  USUARIO ||--o{ RECOLECCION_MOVIMIENTO : creado_por
  TIPOS_ENTIDAD_EVIDENCIA ||--o{ EVIDENCIAS_TRAZABILIDAD : tipo
  USUARIO ||--o{ EVIDENCIAS_TRAZABILIDAD : creado_por
  USUARIO ||--o{ EVIDENCIAS_TRAZABILIDAD : actualizado_por
  USUARIO ||--o{ EVIDENCIAS_TRAZABILIDAD : eliminado_por

  %% === Relaciones módulo vivero — actualizadas ===

  RECOLECCION ||--o{ LOTE_VIVERO : "origen único"
  PLANTA ||--o{ LOTE_VIVERO : planta
  VIVERO ||--o{ LOTE_VIVERO : contiene
  USUARIO ||--o{ LOTE_VIVERO : responsable

  LOTE_VIVERO ||--o{ EVENTO_LOTE_VIVERO : "historial append-only"
  USUARIO ||--o{ EVENTO_LOTE_VIVERO : responsable
  EVENTO_LOTE_VIVERO ||--o| EVENTO_LOTE_VIVERO : "ref_evento_trigger"

  RECOLECCION_MOVIMIENTO }o--|| LOTE_VIVERO : "registra consumo en M1"

  TIPOS_ENTIDAD_EVIDENCIA ||--o{ EVIDENCIAS_TRAZABILIDAD : tipo

  %% === Relaciones plantación — sin cambio ===

  UBICACION ||--o{ PLANTACION : lugar
  USUARIO ||--o{ PLANTACION : created_by
  PLANTACION ||--o{ PLANTACION_FOTO : fotos
  PLANTACION ||--o{ PLANTACION_MONITOREO : monitoreos
  USUARIO ||--o{ PLANTACION_MONITOREO : registra
  PLANTACION ||--o{ PLANTACION_ABONO : usa
  TIPO_ABONO ||--o{ PLANTACION_ABONO : tipo
  PLANTACION ||--o{ PLANTACION_RIEGO : usa
  TIPO_RIEGO ||--o{ PLANTACION_RIEGO : tipo
  PLANTACION ||--o{ PLANTACION_USUARIO : asigna
  USUARIO ||--o{ PLANTACION_USUARIO : participa
  PLANTACION ||--o{ PLANTACION_LOTE_VIVERO : usa_lote
  LOTE_VIVERO ||--o{ PLANTACION_LOTE_VIVERO : se_usa_en
ENUMS
RECOLECCION
tipo_material_origen = [SEMILLA, ESQUEJE]

estado_registro_recoleccion = [BORRADOR, PENDIENTE_VALIDACION, VALIDADO, RECHAZADO]

tipo_movimiento_recoleccion = [
  CONSUMO_A_VIVERO, DESECHO, CORRECCION, AJUSTE_MIGRACION
]
estado_operativo_recoleccion = [ABIERTO, CERRADO]

motivo_movimiento_recoleccion = [
  CONSUMO_PARA_VIVERO,
  DESECHO_*,
  CORRECCION_*,
  AJUSTE_*,
  OTRO
]
LOTE VIVIERO

estado_lote_vivero = [ACTIVO, FINALIZADO]

tipo_evento_vivero = [
  INICIO, EMBOLSADO, ADAPTABILIDAD, MERMA, DESPACHO, CIERRE_AUTOMATICO
]

subetapa_adaptabilidad = [SOMBRA, MEDIA_SOMBRA, SOL_DIRECTO]

causa_merma_vivero = [
  PLAGA, ENFERMEDAD, SEQUIA, DANO_FISICO,
  MUERTE_NATURAL, DESCARTE_CALIDAD, OTRO
]

destino_tipo_vivero = [
  PLANTACION_PROPIA, DONACION_COMUNIDAD, VENTA, OTRO
]

motivo_cierre_lote = [DESPACHO_TOTAL, PERDIDA_TOTAL, MIXTO]
USUARIO
rol_usuario = [ADMIN, GENERAL, VALIDADOR, VOLUNTARIO]
UNIDADES
unidad_medida = [UNIDAD, GR]
