export class Credential {
  credentialId: string;
  publicKey: string;
  algorithm: string;
  counter: number;
  transports?: string[];
  createdAt: Date;
}
