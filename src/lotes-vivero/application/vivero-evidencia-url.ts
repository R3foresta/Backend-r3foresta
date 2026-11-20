import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET_VIVERO_EVIDENCIAS = 'vivero_evidencias';
export const BUCKET_VIVERO_INCORPORACIONES = 'vivero_incorporaciones';
const VIVERO_URL_TTL_SEGUNDOS = 300;

// Los llamadores autorizan el lote, evento o carga antes de proyectar la URL.
export async function proyectarUrlEvidenciaVivero(
  supabase: SupabaseClient,
  evidencia: { bucket: string; ruta_archivo: string },
) {
  if (
    evidencia.bucket === BUCKET_VIVERO_EVIDENCIAS ||
    evidencia.bucket === BUCKET_VIVERO_INCORPORACIONES
  ) {
    try {
      const { data, error } = await supabase.storage
        .from(evidencia.bucket)
        .createSignedUrl(evidencia.ruta_archivo, VIVERO_URL_TTL_SEGUNDOS);
      if (!error && data?.signedUrl) {
        return {
          estado_url: 'DISPONIBLE' as const,
          signed_url: data.signedUrl,
          url_expira_en_segundos: VIVERO_URL_TTL_SEGUNDOS,
        };
      }
    } catch {
      // Un fallo de Storage conserva la evidencia y sus metadatos.
    }
    return {
      estado_url: 'ERROR_FIRMA' as const,
      signed_url: null,
      url_expira_en_segundos: null,
    };
  }

  try {
    const { data } = supabase.storage
      .from(evidencia.bucket)
      .getPublicUrl(evidencia.ruta_archivo);
    if (data?.publicUrl) {
      return { estado_url: 'DISPONIBLE' as const, public_url: data.publicUrl };
    }
  } catch {
    // El historial sigue disponible cuando falla la URL de una foto.
  }
  return { estado_url: 'ERROR_URL' as const, public_url: null };
}
