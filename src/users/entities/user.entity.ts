import { Credential } from './credential.entity';

export class User {
  id: string;
  username: string;
  email?: string;
  credentials: Credential[];
  createdAt: Date;
  lastLogin?: Date;
}
