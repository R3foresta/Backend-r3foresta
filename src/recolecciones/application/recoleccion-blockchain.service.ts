import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from '../../blockchain/blockchain.service';
import { PinataService } from '../../pinata/pinata.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';

@Injectable()
export class RecoleccionBlockchainService {
  private readonly logger = new Logger(RecoleccionBlockchainService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly pinataService: PinataService,
    private readonly blockchainService: BlockchainService,
    private readonly consultasService: RecoleccionConsultasService,
  ) {}

  async executeBlockchainFlow(
    recoleccionId: number,
    codigoTrazabilidad: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(
        `☁️  Blockchain flow: obteniendo datos de recolección ${recoleccionId}...`,
      );

      const findResult = await this.consultasService.findOne(recoleccionId);
      if (!findResult?.data) {
        this.logger.error('⚠️  No se pudo obtener la recolección para metadata');
        return;
      }

      const metadata = this.buildNFTMetadata(findResult.data);
      this.logger.log(
        `📦 Subiendo metadata a IPFS/Pinata para ${codigoTrazabilidad}...`,
      );
      const pinataResult = await this.pinataService.uploadJson(
        metadata,
        `${codigoTrazabilidad}.json`,
      );

      const publicUrl = pinataResult.public_url;
      this.logger.log(`✅ Metadata subido a IPFS: ${publicUrl}`);
      this.logger.log(`🔗 Minteando NFT en blockchain...`);
      const mintResult = await this.blockchainService.mintNFT(
        '0x2440783D1d86D91118E7e19F62889dDc96775868',
        publicUrl,
      );

      const blockchainUrl = `https://shannon-explorer.somnia.network/token/0x4bb21533f7803BBce74421f6bdfc4B6c57706EA2/instance/${mintResult.tokenId}`;

      this.logger.log(`✅ NFT acuñado. Token ID: ${mintResult.tokenId}`);
      this.logger.log(`🔗 URL Blockchain: ${blockchainUrl}`);

      const { error: updateError } = await supabase
        .from('recoleccion')
        .update({
          blockchain_url: blockchainUrl,
          token_id: String(mintResult.tokenId),
          transaction_hash: mintResult.transactionHash,
        })
        .eq('id', recoleccionId);

      if (updateError) {
        this.logger.error(
          '⚠️  No se pudo guardar datos de blockchain en BD:',
          updateError,
        );
      } else {
        this.logger.log('✅ Datos de blockchain guardados en la base de datos');
      }
    } catch (blockchainFlowError) {
      this.logger.error(
        `⚠️  Error en flujo blockchain para recolección ${recoleccionId}:`,
        blockchainFlowError,
      );
    }
  }

  private buildNFTMetadata(recoleccion: any) {
    const fotos: any[] = recoleccion.fotos ?? [];
    const fotoPrincipal =
      fotos.find((f: any) => f.es_principal) || fotos[0] || null;
    const imageUrl: string = fotoPrincipal?.url || '';
    const fechaStr = String(recoleccion.fecha ?? '').trim() || 'N/A';
    const horaStr =
      this.extractHoraFromTimestamp(recoleccion.created_at) ?? 'NO_REGISTRADA';
    const fragmentoHoraDescripcion =
      horaStr === 'NO_REGISTRADA' ? '' : ` a las ${horaStr}`;
    const rutaAdministrativa =
      recoleccion.ubicacion?.division?.ruta
        ?.map((item: { tipo: string; nombre: string }) => item.nombre)
        .join(', ') || '';
    const ubicacionCompleta = [
      recoleccion.ubicacion?.nombre,
      recoleccion.ubicacion?.referencia,
      rutaAdministrativa,
      recoleccion.ubicacion?.pais?.nombre,
    ]
      .filter(Boolean)
      .join(', ');
    const coordenadas = [
      recoleccion.ubicacion?.coordenadas?.lat,
      recoleccion.ubicacion?.coordenadas?.lon,
    ]
      .filter(
        (value: number | null | undefined) =>
          value !== null && value !== undefined,
      )
      .join(', ');
    const recoleccionRef = recoleccion.id ?? recoleccion.codigo_trazabilidad;
    const identidadPlanta = String(
      recoleccion.nombre_comercial_snapshot ?? '',
    ).trim();
    const nombreRecolector = String(
      recoleccion.nombre_recolector_snapshot ?? '',
    ).trim();

    if (!identidadPlanta) {
      throw new BadRequestException(
        `La recolección ${recoleccionRef} no tiene nombre_comercial_snapshot válido`,
      );
    }

    if (!nombreRecolector) {
      throw new BadRequestException(
        `La recolección ${recoleccionRef} no tiene nombre_recolector_snapshot válido`,
      );
    }

    const descripcion = `Recolección de ${recoleccion.tipo_material.toLowerCase()} de ${identidadPlanta} realizada por ${nombreRecolector} el ${fechaStr}${fragmentoHoraDescripcion} en ${ubicacionCompleta || coordenadas}. Cantidad: ${recoleccion.cantidad_inicial_canonica} ${recoleccion.unidad_canonica}. Método: ${recoleccion.metodo?.nombre || 'N/A'}. Estado de registro: ${recoleccion.estado_registro || 'N/A'}. Estado operativo: ${recoleccion.estado_operativo || 'N/A'}. Observaciones: ${recoleccion.observaciones || 'N/A'}.`;

    const attributes = [
      { trait_type: 'ID', value: recoleccion.codigo_trazabilidad },
      { trait_type: 'Usuario', value: nombreRecolector },
      { trait_type: 'Tipo', value: 'Recoleccion' },
      { trait_type: 'Fecha', value: fechaStr },
      { trait_type: 'Hora', value: horaStr },
      { trait_type: 'Especie', value: identidadPlanta },
      { trait_type: 'Tipo de material', value: recoleccion.tipo_material },
      {
        trait_type: 'Cantidad',
        value: `${recoleccion.cantidad_inicial_canonica} ${recoleccion.unidad_canonica}`,
      },
      { trait_type: 'Metodo', value: recoleccion.metodo?.nombre || 'N/A' },
      {
        trait_type: 'Estado de registro',
        value: recoleccion.estado_registro || 'N/A',
      },
      {
        trait_type: 'Estado operativo',
        value: recoleccion.estado_operativo || 'N/A',
      },
      { trait_type: 'Ubicacion', value: ubicacionCompleta },
      { trait_type: 'Coordenadas', value: coordenadas },
    ];

    fotos.forEach((foto: any, index: number) => {
      if (foto.url) {
        attributes.push({ trait_type: `Foto ${index + 1}`, value: foto.url });
      }
    });

    return {
      name: `${recoleccion.codigo_trazabilidad} - Recolección de ${identidadPlanta}`,
      description: descripcion,
      image: imageUrl,
      attributes,
    };
  }

  private extractHoraFromTimestamp(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized.includes('T')) {
      return null;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/La_Paz',
    });
  }
}
