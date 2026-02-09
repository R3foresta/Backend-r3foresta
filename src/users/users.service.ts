import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { RegisterFormDto } from './dto/register-form.dto';
import { User } from './entities/user.entity';
import { Credential } from './entities/credential.entity';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UsersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Crea un nuevo usuario en Supabase
   */
  async createUser(userData: {
    username: string;
    email?: string;
    credential: Credential;
  }): Promise<User> {
    const supabase = this.supabaseService.getClient();

    // Verificar si el usuario ya existe
    const { data: existingUser } = await supabase
      .from('usuario')
      .select('id')
      .eq('username', userData.username)
      .single();

    if (existingUser) {
      throw new ConflictException('El usuario ya existe');
    }

    // Generar auth_id único
    const authId = this.generateId();

    // Insertar usuario en la tabla usuario
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: newUser, error: userError } = await supabase
      .from('usuario')
      .insert({
        username: userData.username,
        correo: userData.email,
        auth_id: authId,
        nombre: userData.username, // Por defecto usa el username como nombre
        rol: 'GENERAL',
      })
      .select()
      .single();

    if (userError) {
      console.error('❌ Error al crear usuario en Supabase:', userError);
      throw new Error(`Error al crear usuario: ${userError.message}`);
    }

    console.log('✅ Usuario insertado en Supabase tabla usuario:');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('   • ID DB:', newUser.id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('   • Username:', newUser.username);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('   • Auth ID:', newUser.auth_id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('   • Email:', newUser.correo);

    // Insertar credencial en la tabla usuario_credencial
    const { error: credError } = await supabase
      .from('usuario_credencial')
      .insert({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        usuario_id: newUser.id,
        credential_id: userData.credential.credentialId,
        public_key: userData.credential.publicKey,
        algorithm: userData.credential.algorithm,
        counter: userData.credential.counter,
        transports: userData.credential.transports || [],
      });

    if (credError) {
      console.error('❌ Error al crear credencial en Supabase:', credError);
      // Eliminar usuario si falla la credencial
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await supabase.from('usuario').delete().eq('id', newUser.id);
      throw new Error(`Error al crear credencial: ${credError.message}`);
    }

    console.log('💾 ✅ DATOS GUARDADOS EN SUPABASE');
    console.log('   • Tabla usuario: ✓');
    console.log('   • Tabla usuario_credencial: ✓');

    // Retornar el usuario en el formato esperado
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      id: newUser.auth_id, // Usamos auth_id como id para el JWT
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      username: newUser.username,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      email: newUser.correo,
      credentials: [userData.credential],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      createdAt: new Date(newUser.created_at),
    };
  }

  /**
   * Busca un usuario por su credentialId en Supabase
   */
  async findByCredentialId(
    credentialId: string,
  ): Promise<{ user: User; credential: Credential } | null> {
    const supabase = this.supabaseService.getClient();

    // Buscar credencial y hacer join con usuario
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: credData, error } = await supabase
      .from('usuario_credencial')
      .select(
        `
        *,
        usuario:usuario_id (
          id,
          username,
          correo,
          auth_id,
          created_at
        )
      `,
      )
      .eq('credential_id', credentialId)
      .single();

    if (error || !credData) {
      console.log('❌ No se encontró credencial con ID:', credentialId);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const usuarioData = credData.usuario;

    const user: User = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      id: usuarioData.auth_id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      username: usuarioData.username,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      email: usuarioData.correo,
      credentials: [],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      createdAt: new Date(usuarioData.created_at),
    };

    const credential: Credential = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      credentialId: credData.credential_id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      publicKey: credData.public_key,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      algorithm: credData.algorithm,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      counter: credData.counter,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      transports: credData.transports,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      createdAt: new Date(credData.created_at),
    };

    return { user, credential };
  }

  /**
   * Actualiza el counter de una credencial en Supabase
   */
  async updateCredentialCounter(
    userId: string,
    credentialId: string,
    counter: number,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('usuario_credencial')
      .update({
        counter: counter,
        last_used_at: new Date().toISOString(),
      })
      .eq('credential_id', credentialId);

    if (error) {
      console.error('❌ Error al actualizar counter:', error);
      throw new NotFoundException('Error al actualizar credencial');
    }
  }

  /**
   * Actualiza el último login del usuario en Supabase
   * Nota: El last_used_at ya se actualiza en usuario_credencial, que es suficiente
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateLastLogin(userId: string): Promise<void> {
    // La fecha del último login ya se actualiza en usuario_credencial.last_used_at
    // No es necesario actualizar nada adicional en la tabla usuario
    // Si necesitas esta funcionalidad, agrega la columna updated_at a la tabla usuario
  }

  /**
   * Obtiene todos los usuarios de Supabase (para testing)
   */
  async getAllUsers(): Promise<any[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('usuario')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error al obtener usuarios:', error);
      throw new Error(`Error al obtener usuarios: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Genera un ID único para auth_id
   */
  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtiene un usuario por su auth_id
   */
  async getUserByAuthId(authId: string): Promise<any> {
    const supabase = this.supabaseService.getClient();

    const { data: user, error } = await supabase
      .from('usuario')
      .select('*')
      .eq('auth_id', authId)
      .single();

    if (error || !user) {
      console.error('❌ Error al obtener usuario:', error);
      throw new NotFoundException('Usuario no encontrado');
    }

    // Retornar usuario (sin datos muy sensibles si hubiera)
    return user;
  }

  /**
   * Completa el registro del usuario con datos del formulario
   */
  async registerForm(authId: string, dto: RegisterFormDto): Promise<any> {
    const supabase = this.supabaseService.getClient();

    // 1. Verificar conflictos
    // Check doc_identidad
    const { data: existingDoc } = await supabase
      .from('usuario')
      .select('id')
      .eq('doc_identidad', dto.doc_identidad)
      .neq('auth_id', authId)
      .maybeSingle();

    if (existingDoc) {
      throw new ConflictException('El documento de identidad ya está registrado');
    }

    // Check wallet_address if present
    if (dto.wallet_address) {
      const { data: existingWallet } = await supabase
        .from('usuario')
        .select('id')
        .eq('wallet_address', dto.wallet_address)
        .neq('auth_id', authId)
        .maybeSingle();
      if (existingWallet) {
        throw new ConflictException('La dirección de wallet ya está registrada');
      }
    }

    // 2. Actualizar usuario
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: updatedUser, error } = await supabase
      .from('usuario')
      .update({
        nombre: dto.nombre,
        apellido: dto.apellido,
        doc_identidad: dto.doc_identidad,
        wallet_address: dto.wallet_address || null,
        organizacion: dto.organizacion || null,
        contacto: dto.contacto || null,
        rol: dto.rol || 'GENERAL',
      })
      .eq('auth_id', authId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error al actualizar usuario:', error);
      throw new BadRequestException(
        `Error al actualizar usuario: ${error.message}`,
      );
    }

    console.log('✅ Formulario de registro completado para:', authId);

    // 3. Retornar usuario
    return updatedUser;
  }
}
