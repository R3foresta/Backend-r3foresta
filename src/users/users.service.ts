import {
  Injectable,
  ConflictException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import { Credential } from './entities/credential.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UsersService implements OnModuleInit {
  // Simulación de base de datos (reemplazar con TypeORM/Mongoose)
  private users: Map<string, User> = new Map();
  private readonly dataFilePath = path.join(
    process.cwd(),
    'data',
    'users.json',
  );

  /**
   * Se ejecuta al inicializar el módulo - carga datos persistidos
   */
  onModuleInit() {
    this.loadUsers();
  }

  createUser(userData: {
    username: string;
    email?: string;
    credential: Credential;
  }): User {
    // Verificar si el usuario ya existe
    const existingUser = Array.from(this.users.values()).find(
      (u) => u.username === userData.username,
    );

    if (existingUser) {
      throw new ConflictException('El usuario ya existe');
    }

    // Crear nuevo usuario
    const userId = this.generateId();
    const newUser: User = {
      id: userId,
      username: userData.username,
      email: userData.email,
      credentials: [userData.credential],
      createdAt: new Date(),
    };

    this.users.set(userId, newUser);
    this.saveUsers(); // Guardar en archivo
    return newUser;
  }

  findByCredentialId(
    credentialId: string,
  ): { user: User; credential: Credential } | null {
    for (const user of this.users.values()) {
      const credential = user.credentials.find(
        (c) => c.credentialId === credentialId,
      );
      if (credential) {
        return { user, credential };
      }
    }
    return null;
  }

  updateCredentialCounter(
    userId: string,
    credentialId: string,
    counter: number,
  ): void {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const credential = user.credentials.find(
      (c) => c.credentialId === credentialId,
    );
    if (credential) {
      credential.counter = counter;
      this.saveUsers(); // Guardar cambios
    }
  }

  updateLastLogin(userId: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.lastLogin = new Date();
      this.saveUsers(); // Guardar cambios
    }
  }

  /**
   * Carga los usuarios desde el archivo JSON
   */
  private loadUsers(): void {
    try {
      // Crear directorio si no existe
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Leer archivo si existe
      if (fs.existsSync(this.dataFilePath)) {
        const data = fs.readFileSync(this.dataFilePath, 'utf-8');
        const usersArray = JSON.parse(data) as User[];

        // Convertir fechas de string a Date
        usersArray.forEach((user) => {
          user.createdAt = new Date(user.createdAt);
          if (user.lastLogin) {
            user.lastLogin = new Date(user.lastLogin);
          }
          user.credentials.forEach((cred) => {
            cred.createdAt = new Date(cred.createdAt);
          });
        });

        // Cargar en el Map
        this.users = new Map(usersArray.map((user) => [user.id, user]));
        console.log(`✅ Cargados ${usersArray.length} usuarios desde archivo`);
      } else {
        console.log(
          'ℹ️ No hay datos persistidos, iniciando con base de datos vacía',
        );
      }
    } catch (error) {
      console.error('❌ Error al cargar usuarios:', error);
      // Continuar con Map vacío si hay error
    }
  }

  /**
   * Guarda los usuarios en el archivo JSON
   */
  private saveUsers(): void {
    try {
      const usersArray = Array.from(this.users.values());
      const dataDir = path.dirname(this.dataFilePath);

      // Crear directorio si no existe
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Guardar en archivo
      fs.writeFileSync(
        this.dataFilePath,
        JSON.stringify(usersArray, null, 2),
        'utf-8',
      );
    } catch (error) {
      console.error('❌ Error al guardar usuarios:', error);
    }
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
