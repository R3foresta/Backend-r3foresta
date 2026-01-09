import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private readonly pinataJwt: string;
  private readonly gatewayUrl: string;

  constructor(private configService: ConfigService) {
    // Obtener credenciales desde variables de entorno
    const pinataJwt = this.configService.get<string>('PINATA_JWT');
    const gatewayUrl = this.configService.get<string>('GATEWAY_URL');

    // Validar que existen las credenciales
    if (!pinataJwt) {
      throw new Error('PINATA_JWT no está configurado');
    }
    if (!gatewayUrl) {
      throw new Error('GATEWAY_URL no está configurado');
    }

    this.pinataJwt = pinataJwt;
    this.gatewayUrl = gatewayUrl;

    this.logger.log('✅ Pinata configurado correctamente');
  }

  /**
   * Sube un objeto JSON como archivo a Pinata
   * @param jsonData - Objeto JSON a subir
   * @param filename - Nombre del archivo (por defecto: 'data.json')
   * @returns Información del archivo subido
   */
  async uploadJson(jsonData: any, filename: string = 'data.json') {
    try {
      this.logger.log(`Subiendo JSON como archivo: ${filename}`);

      // 🔑 PASO CLAVE: Subir JSON usando la API REST de Pinata
      const response = await fetch(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.pinataJwt}`,
          },
          body: JSON.stringify({
            pinataContent: jsonData,
            pinataMetadata: {
              name: filename,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Pinata API error: ${response.status} - ${errorText}`,
        );
      }

      const upload = await response.json();

      // Logs informativos
      this.logger.log(`✅ JSON subido exitosamente!`);
      this.logger.log(`🔓 Accesible públicamente en IPFS`);
      this.logger.log(`📦 CID: ${upload.IpfsHash}`);
      this.logger.log(
        `🌐 Ver contenido: https://${this.gatewayUrl}/ipfs/${upload.IpfsHash}`,
      );

      // Construir respuesta completa
      return {
        success: true,
        cid: upload.IpfsHash,
        name: filename,
        size: upload.PinSize,
        ipfs_url: `ipfs://${upload.IpfsHash}`,
        gateway_url: `https://${this.gatewayUrl}/ipfs/${upload.IpfsHash}`,
        public_url: `https://ipfs.io/ipfs/${upload.IpfsHash}`,
        access: 'PUBLIC',
        message: 'JSON subido exitosamente a IPFS (acceso público para NFT)',
        nft_ready: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Error al subir JSON: ${errorMessage}`, errorStack);
      throw new Error(`Error al subir JSON a Pinata: ${errorMessage}`);
    }
  }
}
