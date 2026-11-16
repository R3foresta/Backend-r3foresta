import { Credential } from './credential.entity';

export class User {
  id: string;
  username: string;
  email?: string | null;
  credentials: Credential[];
  createdAt: Date;
  lastLogin?: Date;
}
