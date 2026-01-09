import { IsNotEmpty, IsString, IsEthereumAddress } from 'class-validator';

export class MintNFTDto {
  @IsNotEmpty({ message: 'La dirección del destinatario es obligatoria' })
  @IsEthereumAddress({ message: 'La dirección debe ser una dirección Ethereum válida' })
  to: string;

  @IsNotEmpty({ message: 'La URI del metadata es obligatoria' })
  @IsString()
  uri: string;
}
