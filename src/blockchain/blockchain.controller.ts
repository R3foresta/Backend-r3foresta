import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { MintNFTDto } from './dto/mint-nft.dto';

@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  /**
   * 🎨 POST /api/blockchain/mint
   * Acuñar un nuevo NFT
   *
   * Body:
   * {
   *   "to": "0x2440783D1d86D91118E7e19F62889dDc96775868",
   *   "uri": "ipfs://bafkreidrjxlor..."
   * }
   */
  @Post('mint')
  async mintNFT(@Body() mintDto: MintNFTDto) {
    try {
      return await this.blockchainService.mintNFT(mintDto.to, mintDto.uri);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage || 'Error al acuñar NFT',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 👁️ GET /api/blockchain/token/:tokenId/uri
   * Obtener la URI de metadata de un token
   */
  @Get('token/:tokenId/uri')
  async getTokenURI(@Param('tokenId') tokenId: string) {
    try {
      const uri = await this.blockchainService.getTokenURI(Number(tokenId));
      return {
        tokenId: tokenId,
        uri: uri,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 👤 GET /api/blockchain/token/:tokenId/owner
   * Obtener el dueño de un token
   */
  @Get('token/:tokenId/owner')
  async getTokenOwner(@Param('tokenId') tokenId: string) {
    try {
      const owner = await this.blockchainService.getTokenOwner(Number(tokenId));
      return {
        tokenId: tokenId,
        owner: owner,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 📊 GET /api/blockchain/balance/:address
   * Obtener balance de NFTs de una dirección
   */
  @Get('balance/:address')
  async getBalance(@Param('address') address: string) {
    try {
      const balance = await this.blockchainService.getBalanceOf(address);
      return {
        address: address,
        balance: balance,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 💰 GET /api/blockchain/wallet
   * Obtener información de la wallet del backend
   */
  @Get('wallet')
  async getWalletInfo() {
    try {
      return await this.blockchainService.getWalletBalance();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * ℹ️ GET /api/blockchain/contract-info
   * Obtener información del contrato
   */
  @Get('contract-info')
  async getContractInfo() {
    try {
      return await this.blockchainService.getContractInfo();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
