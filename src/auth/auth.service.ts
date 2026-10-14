import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { server } from '@passwordless-id/webauthn';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Credential } from '../users/entities/credential.entity';

@Injectable()
export class AuthService implements OnModuleDestroy {
  // Almacenamiento temporal de challenges (usar Redis en producción)
  private challenges: Map<string, { challenge: string; expiresAt: number }> =
    new Map();
  private readonly challengeCleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {
    // Limpiar challenges expirados cada 5 minutos
    this.challengeCleanupTimer = setInterval(
      () => this.cleanExpiredChallenges(),
      5 * 60 * 1000,
    );
    this.challengeCleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.challengeCleanupTimer);
  }

  /**
   * Genera un challenge aleatorio
   */
  generateChallenge(): { challenge: string; sessionId: string } {
    const challenge = server.randomChallenge();
    const sessionId = this.generateSessionId();

    // Guardar con expiración de 5 minutos
    this.challenges.set(sessionId, {
      challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return { challenge, sessionId };
  }

  /**
   * Verifica un challenge
   */
  private verifyChallenge(challenge: string): boolean {
    for (const [sessionId, data] of this.challenges.entries()) {
      if (data.challenge === challenge) {
        if (Date.now() > data.expiresAt) {
          this.challenges.delete(sessionId);
          return false;
        }
        this.challenges.delete(sessionId);
        return true;
      }
    }
    return false;
  }

  /**
   * Registra un nuevo usuario con passkey
   */
  async register(registerDto: RegisterDto, origin: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { username, email, registration, challenge } = registerDto;

    // Verificar challenge
    if (!this.verifyChallenge(challenge)) {
      throw new BadRequestException('Challenge inválido o expirado');
    }

    try {
      // Verificar el registro con WebAuthn
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const verified = await server.verifyRegistration(registration, {
        challenge,
        origin,
      });

      // Crear credencial
      const credential: Credential = {
        credentialId: verified.credential.id,
        publicKey: verified.credential.publicKey,
        algorithm: verified.credential.algorithm,
        counter: 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        transports: registration.transports as string[],
        createdAt: new Date(),
      };
      // Crear usuario
      const user = await this.usersService.createUser({
        username,
        email,
        credential,
      });

      // Generar JWT
      const token = this.generateJwt(user.id, user.username);

      return {
        success: true,
        auth_id: user.id, // auth_id en nivel principal
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          auth_id: user.id, // auth_id dentro de user
        },
        token,
        message: 'Usuario registrado exitosamente',
      };
    } catch (error) {
      throw new BadRequestException(
        (error as Error).message || 'Error al registrar usuario',
      );
    }
  }

  /**
   * Autentica al usuario con passkey
   */
  async login(loginDto: LoginDto, origin: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { authentication, challenge } = loginDto;

    // Verificar challenge
    if (!this.verifyChallenge(challenge)) {
      throw new BadRequestException('Challenge inválido o expirado');
    }

    try {
      // Extraer credentialId - puede venir como 'credentialId' o 'id'
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const credentialId = (authentication.credentialId ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        authentication.id) as string;

      if (!credentialId) {
        throw new BadRequestException(
          'No se encontró credentialId en la solicitud de autenticación',
        );
      }
      // Buscar usuario por credentialId
      const result = await this.usersService.findByCredentialId(credentialId);

      if (!result) {
        throw new UnauthorizedException('Credencial no encontrada');
      }

      const { user, credential } = result;
      // Verificar la autenticación con WebAuthn
      const verified = await server.verifyAuthentication(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        authentication,
        {
          id: credential.credentialId,
          publicKey: credential.publicKey,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          algorithm: credential.algorithm as any,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          transports: (credential.transports || []) as any,
        },
        {
          challenge,
          origin,
          userVerified: true,
          counter: credential.counter,
        },
      );

      // Actualizar contador y último login
      await this.usersService.updateCredentialCounter(
        user.id,
        credentialId,
        verified.counter,
      );
      await this.usersService.updateLastLogin(user.id);

      // Generar JWT
      const token = this.generateJwt(user.id, user.username);

      return {
        success: true,
        auth_id: user.id, // auth_id en nivel principal
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          auth_id: user.id, // auth_id dentro de user
        },
        token,
        message: 'Login exitoso',
      };
    } catch (error) {
      throw new UnauthorizedException(
        (error as Error).message || 'Error al autenticar',
      );
    }
  }

  /**
   * Genera un JWT token
   */
  private generateJwt(userId: string, username: string): string {
    const payload = { sub: userId, username };
    return this.jwtService.sign(payload);
  }

  /**
   * Genera un ID de sesión único
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Limpia challenges expirados
   */
  private cleanExpiredChallenges(): void {
    const now = Date.now();
    for (const [sessionId, data] of this.challenges.entries()) {
      if (now > data.expiresAt) {
        this.challenges.delete(sessionId);
      }
    }
  }
}
