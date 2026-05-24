import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import TokenJhamABI from './TokenJhamABI.json';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly contract: ethers.Contract;

  constructor(private configService: ConfigService) {
    // Validar variables de entorno
    this.validateEnvironmentVariables();

    // 1️⃣ CREAR PROVIDER (conexión a blockchain)
    const rpcUrl = this.configService.get<string>('RPC_URL');
    if (!rpcUrl) {
      throw new Error('RPC_URL no está configurado en .env');
    }
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // 2️⃣ CREAR WALLET (auto-custodia con clave privada)
    const privateKey = this.configService.get<string>('PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('PRIVATE_KEY no está configurado en .env');
    }
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    // 3️⃣ CREAR CONTRATO
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');
    if (!contractAddress) {
      throw new Error('CONTRACT_ADDRESS no está configurado en .env');
    }
    this.contract = new ethers.Contract(
      contractAddress,
      TokenJhamABI,
      this.wallet, // El wallet firmará las transacciones
    );

    this.logger.log('✅ Blockchain Service inicializado');
    this.logger.log(`📍 Wallet: ${this.wallet.address}`);
    this.logger.log(`📄 Contrato: ${contractAddress}`);
  }

  private validateEnvironmentVariables() {
    const requiredVars = ['RPC_URL', 'PRIVATE_KEY', 'CONTRACT_ADDRESS'];

    for (const varName of requiredVars) {
      if (!this.configService.get<string>(varName)) {
        throw new Error(`❌ ${varName} no está configurado en .env`);
      }
    }
  }

  /**
   * 🎨 MINT NFT - Acuñar un nuevo token
   * Función principal que llama a safeMint del contrato
   *
   * @param to - Dirección del destinatario del NFT
   * @param uri - URI del metadata en IPFS (ej: ipfs://bafkrei...)
   * @returns Información de la transacción y tokenId generado
   */
  async mintNFT(to: string, uri: string) {
    try {
      this.logger.log(`🎨 Iniciando mint de NFT...`);
      this.logger.log(`📍 Destinatario: ${to}`);
      this.logger.log(`🔗 URI: ${uri}`);

      // Verificar que la wallet tenga fondos
      await this.checkWalletBalance();

      // ✅ VERIFICAR QUE LA WALLET SEA EL OWNER DEL CONTRATO
      await this.verifyOwnership();

      // Llamar a la función safeMint del contrato
      // ethers.js automáticamente:
      //   - Estima el gas necesario
      //   - Construye la transacción
      //   - FIRMA con la PRIVATE_KEY
      //   - Envía al RPC
      const tx = await this.contract.safeMint(to, uri);

      this.logger.log(`🔄 Transacción enviada: ${tx.hash}`);
      this.logger.log(`⏳ Esperando confirmación...`);

      // Esperar a que la transacción sea minada
      const receipt = await tx.wait();

      this.logger.log(`✅ NFT acuñado exitosamente!`);
      this.logger.log(`📦 Bloque: ${receipt.blockNumber}`);
      this.logger.log(`⛽ Gas usado: ${receipt.gasUsed.toString()}`);

      // Extraer el tokenId del evento Transfer
      // El evento Transfer emite: (from, to, tokenId)
      const transferEvent = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === 'Transfer',
      );

      let tokenId = null;
      if (transferEvent) {
        tokenId = transferEvent.args[2].toString(); // El tercer argumento es el tokenId
        this.logger.log(`🎫 Token ID: ${tokenId}`);
      }

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        tokenId: tokenId,
        to: to,
        uri: uri,
        message: 'NFT acuñado exitosamente',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`❌ Error al acuñar NFT: ${errorMessage}`, errorStack);

      // Mejorar mensaje de error para problemas comunes
      if (errorMessage.includes('execution reverted')) {
        throw new Error(
          `❌ El contrato rechazó la transacción. Posibles causas:\n` +
            `1. La wallet del backend (${this.wallet.address}) NO es el owner del contrato.\n` +
            `2. El contrato está pausado.\n` +
            `3. La dirección de destino es inválida.\n` +
            `Verifica con GET /api/blockchain/contract-info quién es el owner.`,
        );
      }

      throw new Error(`Error al acuñar NFT: ${errorMessage}`);
    }
  }

  /**
   * 👁️ OBTENER URI DE TOKEN
   * Lee la URI de metadata de un token específico
   *
   * @param tokenId - ID del token
   * @returns URI del token
   */
  async getTokenURI(tokenId: number): Promise<string> {
    try {
      const uri = await this.contract.tokenURI(tokenId);
      return uri;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error al obtener URI del token: ${errorMessage}`);
    }
  }

  /**
   * 👤 OBTENER DUEÑO DE TOKEN
   * Consulta quién es el dueño actual de un token
   *
   * @param tokenId - ID del token
   * @returns Dirección del dueño
   */
  async getTokenOwner(tokenId: number): Promise<string> {
    try {
      const owner = await this.contract.ownerOf(tokenId);
      return owner;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error al obtener dueño del token: ${errorMessage}`);
    }
  }

  /**
   * 📊 OBTENER BALANCE DE NFTs
   * Consulta cuántos NFTs tiene una dirección
   *
   * @param address - Dirección a consultar
   * @returns Cantidad de tokens
   */
  async getBalanceOf(address: string): Promise<number> {
    try {
      const balance = await this.contract.balanceOf(address);
      return Number(balance);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error al obtener balance: ${errorMessage}`);
    }
  }

  /**
   * 💰 OBTENER BALANCE DE LA WALLET
   * Verifica cuántos tokens nativos tiene la wallet del backend
   *
   * @returns Balance en formato legible
   */
  async getWalletBalance() {
    try {
      const balance = await this.provider.getBalance(this.wallet.address);
      return {
        address: this.wallet.address,
        balance: ethers.formatEther(balance),
        balanceWei: balance.toString(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error al obtener balance: ${errorMessage}`);
    }
  }

  /**
   * ✅ VERIFICAR SI LA WALLET TIENE FONDOS
   * Comprueba si hay suficiente gas para transacciones
   */
  private async checkWalletBalance(): Promise<void> {
    const balance = await this.provider.getBalance(this.wallet.address);
    if (balance === 0n) {
      throw new Error(
        '❌ La wallet no tiene fondos. Envía tokens nativos para pagar el gas.',
      );
    }
    this.logger.log(
      `💰 Balance de la wallet: ${ethers.formatEther(balance)} tokens`,
    );
  }

  /**
   * 🔐 VERIFICAR QUE LA WALLET SEA EL OWNER DEL CONTRATO
   * Comprueba que la wallet del backend pueda acuñar NFTs
   */
  private async verifyOwnership(): Promise<void> {
    try {
      const contractOwner = await this.contract.owner();
      const walletAddress = this.wallet.address;

      this.logger.log(`🔍 Owner del contrato: ${contractOwner}`);
      this.logger.log(`🔍 Wallet del backend: ${walletAddress}`);

      if (contractOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error(
          `❌ PERMISO DENEGADO: La wallet del backend (${walletAddress}) NO es el owner del contrato.\n` +
            `El owner actual es: ${contractOwner}\n\n` +
            `SOLUCIÓN:\n` +
            `1. Cambia PRIVATE_KEY en .env por la clave privada del owner del contrato, O\n` +
            `2. Transfiere la ownership del contrato a ${walletAddress} usando transferOwnership()`,
        );
      }

      this.logger.log(`✅ Verificación de ownership exitosa`);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes('PERMISO DENEGADO')
      ) {
        throw error; // Re-lanzar el error de ownership
      }
      // Si falla la verificación por otro motivo, continuar (tal vez el contrato no tiene owner())
      this.logger.warn(
        `⚠️ No se pudo verificar ownership: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * ℹ️ OBTENER INFORMACIÓN DEL CONTRATO
   * Devuelve información básica del contrato NFT
   */
  async getContractInfo() {
    try {
      const name = await this.contract.name();
      const symbol = await this.contract.symbol();
      const owner = await this.contract.owner();
      const paused = await this.contract.paused();

      return {
        name,
        symbol,
        owner,
        paused,
        address: await this.contract.getAddress(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error al obtener info del contrato: ${errorMessage}`);
    }
  }

  /**
   * 📍 OBTENER DIRECCIÓN DE LA WALLET
   */
  getWalletAddress(): string {
    return this.wallet.address;
  }
}
