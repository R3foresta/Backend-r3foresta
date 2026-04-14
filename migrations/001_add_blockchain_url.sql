-- Agregar campo para URL de blockchain (NFT en explorer)
ALTER TABLE recoleccion 
ADD COLUMN IF NOT EXISTS blockchain_url TEXT;

-- Agregar campo para token_id del NFT
ALTER TABLE recoleccion 
ADD COLUMN IF NOT EXISTS token_id TEXT;

-- Agregar campo para transaction hash
ALTER TABLE recoleccion 
ADD COLUMN IF NOT EXISTS transaction_hash TEXT;

COMMENT ON COLUMN recoleccion.blockchain_url IS 'URL del NFT en el blockchain explorer';
COMMENT ON COLUMN recoleccion.token_id IS 'ID del token NFT acuñado';
COMMENT ON COLUMN recoleccion.transaction_hash IS 'Hash de la transacción de blockchain';
