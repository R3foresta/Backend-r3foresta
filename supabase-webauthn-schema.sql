-- =====================================================
-- TABLA PARA CREDENCIALES DE WEBAUTHN (PASSKEYS)
-- =====================================================
-- Esta tabla almacena las credenciales de passkeys para autenticación sin contraseña
-- Se relaciona con la tabla usuario mediante el campo usuario_id

CREATE TABLE IF NOT EXISTS public.usuario_credencial (
  id bigserial PRIMARY KEY,
  usuario_id bigint NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  algorithm text NOT NULL DEFAULT 'ES256',
  counter integer NOT NULL DEFAULT 0,
  transports text[], -- ['internal', 'usb', 'nfc', 'ble', 'hybrid']
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  
  CONSTRAINT usuario_credencial_usuario_id_fkey 
    FOREIGN KEY (usuario_id) 
    REFERENCES public.usuario(id) 
    ON DELETE CASCADE
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_usuario_credencial_usuario_id 
  ON public.usuario_credencial(usuario_id);

CREATE INDEX IF NOT EXISTS idx_usuario_credencial_credential_id 
  ON public.usuario_credencial(credential_id);

-- Comentarios para documentación
COMMENT ON TABLE public.usuario_credencial IS 'Almacena las credenciales de WebAuthn (passkeys) para autenticación biométrica sin contraseña';
COMMENT ON COLUMN public.usuario_credencial.credential_id IS 'ID único de la credencial generado por WebAuthn';
COMMENT ON COLUMN public.usuario_credencial.public_key IS 'Clave pública de la credencial en formato base64';
COMMENT ON COLUMN public.usuario_credencial.algorithm IS 'Algoritmo criptográfico usado (generalmente ES256)';
COMMENT ON COLUMN public.usuario_credencial.counter IS 'Contador para prevenir ataques de replay, incrementa con cada uso';
COMMENT ON COLUMN public.usuario_credencial.transports IS 'Métodos de transporte soportados por el autenticador';

-- =====================================================
-- POLÍTICAS RLS (Row Level Security) - OPCIONAL
-- =====================================================
-- Descomentar si quieres habilitar RLS para mayor seguridad

-- ALTER TABLE public.usuario_credencial ENABLE ROW LEVEL SECURITY;

-- -- Los usuarios solo pueden ver sus propias credenciales
-- CREATE POLICY "Usuarios pueden ver sus propias credenciales"
--   ON public.usuario_credencial
--   FOR SELECT
--   USING (auth.uid()::text = (SELECT auth_id FROM public.usuario WHERE id = usuario_id));

-- -- Los usuarios pueden insertar sus propias credenciales
-- CREATE POLICY "Usuarios pueden crear sus propias credenciales"
--   ON public.usuario_credencial
--   FOR INSERT
--   WITH CHECK (auth.uid()::text = (SELECT auth_id FROM public.usuario WHERE id = usuario_id));

-- -- Los usuarios pueden actualizar solo el contador de sus credenciales
-- CREATE POLICY "Usuarios pueden actualizar el contador de sus credenciales"
--   ON public.usuario_credencial
--   FOR UPDATE
--   USING (auth.uid()::text = (SELECT auth_id FROM public.usuario WHERE id = usuario_id));
