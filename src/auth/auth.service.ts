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

    console.log('\n🔵 ============ INTENTO DE REGISTRO ============');
    console.log('📥 Datos recibidos desde el frontend:');
    console.log('   • Usuario:', username);
    console.log('   • Email:', email || 'No proporcionado');
    console.log('   • Origin:', origin);
    console.log('   • Challenge válido:', challenge ? 'Sí' : 'No');

    // Verificar challenge
    if (!this.verifyChallenge(challenge)) {
      console.log('❌ Challenge inválido o expirado');
      throw new BadRequestException('Challenge inválido o expirado');
    }

    try {
      console.log('🔐 Verificando credenciales WebAuthn...');
      // Verificar el registro con WebAuthn
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const verified = await server.verifyRegistration(registration, {
        challenge,
        origin,
      });

      console.log('✅ Credenciales WebAuthn verificadas correctamente');
      console.log(
        '   • Credential ID:',
        verified.credential.id.substring(0, 20) + '...',
      );
      console.log('   • Algoritmo:', verified.credential.algorithm);

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

      console.log('💾 Creando usuario en el sistema...');
      // Crear usuario
      const user = await this.usersService.createUser({
        username,
        email,
        credential,
      });

      console.log('✅ Usuario creado exitosamente');
      console.log('   • ID de usuario:', user.id);
      console.log('   • Total de credenciales:', user.credentials.length);
      console.log('💾 ✅ DATOS GUARDADOS EN SUPABASE');
      console.log('🔵 ============================================\n');

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
      console.log('❌ ERROR EN REGISTRO:', (error as Error).message);
      console.log('🔵 ============================================\n');
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

    console.log('\n🟢 ============ INTENTO DE LOGIN ============');
    console.log('📥 Solicitud de autenticación recibida');
    console.log('   • Origin:', origin);
    console.log('   • Challenge válido:', challenge ? 'Sí' : 'No');
    console.log('📋 Objeto authentication completo:');
    console.log(JSON.stringify(authentication, null, 2));

    // Verificar challenge
    if (!this.verifyChallenge(challenge)) {
      console.log('❌ Challenge inválido o expirado');
      console.log('🟢 ==========================================\n');
      throw new BadRequestException('Challenge inválido o expirado');
    }

    try {
      // Extraer credentialId - puede venir como 'credentialId' o 'id'
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const credentialId = (authentication.credentialId ||
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        authentication.id) as string;

      console.log('🔍 Extrayendo Credential ID...');
      console.log('   • credentialId completo:', credentialId);
      console.log(
        '   • credentialId preview:',
        credentialId
          ? credentialId.substring(0, Math.min(20, credentialId.length)) + '...'
          : 'UNDEFINED',
      );

      if (!credentialId) {
        console.log(
          '❌ ERROR: No se pudo extraer credentialId del objeto authentication',
        );
        console.log(
          '   • authentication.credentialId:',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          authentication.credentialId,
        );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.log('   • authentication.id:', authentication.id);
        console.log('🟢 ==========================================\n');
        throw new BadRequestException(
          'No se encontró credentialId en la solicitud de autenticación',
        );
      }

      console.log('🔎 Buscando usuario en persistencia...');
      // Buscar usuario por credentialId
      const result = await this.usersService.findByCredentialId(credentialId);

      if (!result) {
        console.log('❌ Credencial NO encontrada en la persistencia');
        console.log('💡 Sugerencia: Asegúrate de haberte registrado primero');
        console.log('🟢 ==========================================\n');
        throw new UnauthorizedException('Credencial no encontrada');
      }

      const { user, credential } = result;
      console.log('✅ Usuario encontrado en la persistencia:');
      console.log('   • Usuario:', user.username);
      console.log('   • ID:', user.id);
      console.log('   • Email:', user.email || 'No tiene');
      console.log(
        '   • Registrado:',
        credential.createdAt.toLocaleString('es-ES'),
      );
      console.log(
        '   • Último login:',
        user.lastLogin ? user.lastLogin.toLocaleString('es-ES') : 'Primera vez',
      );

      console.log('🔐 Verificando autenticación WebAuthn...');
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

      console.log('✅ Autenticación WebAuthn verificada correctamente');
      console.log('   • Counter anterior:', credential.counter);
      console.log('   • Counter nuevo:', verified.counter);

      // Actualizar contador y último login
      this.usersService.updateCredentialCounter(
        user.id,
        credentialId,
        verified.counter,
      );
      this.usersService.updateLastLogin(user.id);

      console.log('💾 ✅ DATOS ACTUALIZADOS EN PERSISTENCIA');
      console.log('🎉 LOGIN EXITOSO para:', user.username);
      console.log('🟢 ==========================================\n');

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
      console.log('❌ ERROR EN LOGIN:', (error as Error).message);
      console.log('🟢 ==========================================\n');
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

  /**
   * Prueba la conexión con Supabase y devuelve todos los usuarios
   */
  async testSupabaseConnection() {
    try {
      const allUsers = await this.usersService.getAllUsers();
      return {
        success: true,
        message: '✅ Conexión con Supabase funcionando correctamente',
        totalUsuarios: allUsers.length,
        usuarios: allUsers.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          auth_id: u.auth_id,
          rol: u.rol,
          created_at: u.created_at,
        })),
      };
    } catch (error) {
      return {
        success: false,
        message: '❌ Error al conectar con Supabase',
        error: (error as Error).message,
      };
    }
  }
}
