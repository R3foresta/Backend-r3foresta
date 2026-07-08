/**
 * Reglas operativas de la plantación inicial que el frontend necesita para
 * construir el flujo de registro sin inventar valores.
 *
 * Cada valor ES un espejo de una regla ya implementada en backend/BD.
 * Si cambia la fuente, actualizar aquí también:
 *
 * - max_dias_retroactivos: ventana hardcoded en fn_vivero_assert_fecha_operativa
 *   (migrations/010_vivero_operational_rules.sql), usada por
 *   fn_m3_registrar_plantacion (migrations/053).
 * - gps_fuera_poligono_bloquea: la RPC 053 guarda gps_dentro_poligono como flag
 *   y NO aborta el registro cuando el punto cae fuera del polígono.
 * - precision_gps_advertencia_m: umbral de precisión del dispositivo a partir
 *   del cual el frontend debe advertir antes de enviar (advisory, no bloquea).
 * - requiere_evidencia / min_fotos: la RPC 053 y RegistrarPlantacionDto exigen
 *   al menos una evidencia previamente subida.
 * - max_fotos: tope de PlantacionEvidenciasService ('Maximo 10 fotos permitidas').
 * - permite_exceder_meta_especie: la RPC 053 (sección 11) rechaza plantaciones
 *   iniciales que excedan cantidad_objetivo de SUBCAMPANIA_META_ESPECIE.
 * - orden_consumo_asignaciones: orden FIFO con el que el frontend debe consumir
 *   asignaciones de una misma especie (índice FIFO de migrations/024).
 */
export const REGLAS_PLANTACION_INICIAL = {
  max_dias_retroactivos: 10,
  gps_fuera_poligono_bloquea: false,
  precision_gps_advertencia_m: 50,
  requiere_evidencia: true,
  min_fotos: 1,
  max_fotos: 10,
  permite_exceder_meta_especie: false,
  orden_consumo_asignaciones: 'fecha_asignacion ASC, asignacion_id ASC',
} as const;

export type ReglasPlantacionInicial = typeof REGLAS_PLANTACION_INICIAL;
