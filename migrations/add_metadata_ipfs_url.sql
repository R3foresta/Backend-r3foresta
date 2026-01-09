-- Agregar columna metadata_ipfs_url a la tabla recoleccion
-- Esta columna almacenará la URL de IPFS donde está el JSON metadata del NFT

ALTER TABLE recoleccion 
ADD COLUMN IF NOT EXISTS metadata_ipfs_url TEXT;

COMMENT ON COLUMN recoleccion.metadata_ipfs_url IS 'URL de IPFS donde está almacenado el metadata en formato JSON para NFT (ej: ipfs://bafkrei...)';
