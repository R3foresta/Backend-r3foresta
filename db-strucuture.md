::: mermaid
erDiagram
    USUARIO {
        int id
        string nombre
        string doc_identidad
        string wallet_address
        string organizacion
        string contacto
    }

    UBICACION {
        int id
        string pais
        string departamento
        string provincia
        string comunidad
        string zona
        decimal latitud
        decimal longitud
    }

    VIVERO {
        int id
        string codigo
        string nombre
        int ubicacion_id
    }

    PLANTA {
        int id
        string especie
        string nombre_cientifico
        string variedad
        string tipo_planta
        string tipo_planta_otro
        string fuente
    }

    METODO_RECOLECCION {
        int id
        string nombre
        string descripcion
    }

    RECOLECCION {
        int id
        date fecha
        string nombre_cientifico
        string nombre_comercial
        decimal cantidad
        string unidad
        string tipo_material
        string estado
        boolean especie_nueva
        string observaciones
        int usuario_id
        int ubicacion_id
        int vivero_id
        int metodo_id
        int planta_id
    }

    RECOLECCION_FOTO {
        int id
        int recoleccion_id
        string url
        int peso_bytes
        string formato
    }

    LOTE_PLANTACION {
        int id
        int planta_id
        int vivero_id
        int responsable_id
        date fecha_inicio
        int cantidad_inicio
        int cantidad_embolsadas
        int cantidad_sombra
        int cantidad_lista_plantar
        date fecha_embolsado
        date fecha_sombra
        date fecha_salida
        decimal altura_prom_sombra
        decimal altura_prom_salida
        string estado
    }

    LOTE_PLANTACION_RECOLECCION {
        int lote_id
        int recoleccion_id
    }

    LOTE_PLANTACION_HISTORIAL {
        int id
        int lote_id
        int nro_cambio
        datetime fecha_cambio
        int responsable_id
        string accion
        string estado

        int cantidad_inicio
        int cantidad_embolsadas
        int cantidad_sombra
        int cantidad_lista_plantar

        date fecha_inicio
        date fecha_embolsado
        date fecha_sombra
        date fecha_salida

        decimal altura_prom_sombra
        decimal altura_prom_salida

        string notas
    }

    %% Relaciones

    UBICACION ||--o{ VIVERO : tiene
    UBICACION ||--o{ RECOLECCION : ocurre_en

    USUARIO ||--o{ RECOLECCION : recolecta
    USUARIO ||--o{ LOTE_PLANTACION : crea
    USUARIO ||--o{ LOTE_PLANTACION_HISTORIAL : registra

    VIVERO ||--o{ RECOLECCION : almacena
    VIVERO ||--o{ LOTE_PLANTACION : se_realiza_en

    PLANTA ||--o{ RECOLECCION : corresponde_a
    PLANTA ||--o{ LOTE_PLANTACION : se_siembra

    METODO_RECOLECCION ||--o{ RECOLECCION : se_usa_en

    RECOLECCION ||--o{ RECOLECCION_FOTO : tiene

    LOTE_PLANTACION ||--o{ LOTE_PLANTACION_RECOLECCION : usa
    RECOLECCION ||--o{ LOTE_PLANTACION_RECOLECCION : proviene_de

    LOTE_PLANTACION ||--o{ LOTE_PLANTACION_HISTORIAL : versiona
:::

Aclaraciónes sobre algunas tablas:
En PLANTA:
    string tipo_planta      // Árbol, Arbusto, etc.
    string tipo_planta_otro // texto libre si es "Otro"
    string fuente           // SEMILLA / ESQUEJE

En RECOLECCIÓN:
    string unidad           // UNIDAD / KG / G
    string tipo_material    // SEMILLA / ESQUEJE
    string estado           // USADO / ALMACENADO / DESECHADO

En LOTE_PLANTACION:
    string estado           // INICIO / EMBOLSADO / SOMBRA / LISTA_PLANTAR / SALIDA_VIVERO

En LOTE_PLANTACION_HISTORIAL:
    string accion           // INICIO, EMBOLSADO, SOMBRA, LISTA_PLANTAR, SALIDA, AJUSTE...
        