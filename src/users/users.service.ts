import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { parsePerfil } from './perfil-v1.dto';
import { PerfilV1Service } from './perfil-v1.service';
import { User } from './entities/user.entity';
import { Credential } from './entities/credential.entity';
import { SupabaseService } from '../supabase/supabase.service';
import type { VerifiedActor } from '../auth/verified-actor.guard';

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly perfil: PerfilV1Service,
  ) {}

  /**
   * Persiste la cuenta y la passkey ya verificada en una sola transacción.
   */
  async createUser(userData: {
    username: string;
    email?: string;
    credential: Credential;
  }): Promise<User> {
    const supabase = this.supabaseService.getAdminClient();

    // El vínculo BIGINT usuario/credencial se resuelve íntegramente en SQL.
    const { data: newUser, error } = (await supabase.rpc(
      'pa_usuario_registrar',
      {
        p_auth_id: this.generateId(),
        p_username: userData.username,
        p_correo: userData.email ?? null,
        p_credential_id: userData.credential.credentialId,
        p_public_key: userData.credential.publicKey,
        p_algorithm: userData.credential.algorithm,
        p_counter: userData.credential.counter,
        p_transports: userData.credential.transports || [],
      },
    )) as {
      data: {
        auth_id: string;
        username: string;
        correo: string | null;
        created_at: string;
      } | null;
      error: { code?: string; message: string } | null;
    };

    if (error?.code === '23505') {
      throw new ConflictException(
        error.message === 'USUARIO_YA_EXISTE'
          ? 'El usuario ya existe'
          : 'Los datos de registro ya están en uso.',
      );
    }
    if (error || !newUser) {
      throw new InternalServerErrorException(
        'No se pudo completar el registro.',
      );
    }

    return {
      id: newUser.auth_id, // Usamos auth_id como id para el JWT
      username: newUser.username,
      email: newUser.correo,
      credentials: [userData.credential],
      createdAt: new Date(newUser.created_at),
    };
  }

  /**
   * Busca un usuario por su credentialId en Supabase
   */
  async findByCredentialId(
    credentialId: string,
  ): Promise<{ user: User; credential: Credential } | null> {
    const supabase = this.supabaseService.getAdminClient();

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
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('usuario_credencial')
      .update({
        counter: counter,
        last_used_at: new Date().toISOString(),
      })
      .eq('credential_id', credentialId);

    if (error) {
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
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('usuario')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
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
  async getOwnLegacyProfile(
    actor: VerifiedActor,
  ): Promise<Record<string, unknown>> {
    const supabase = this.supabaseService.getAdminClient();

    const result = (await supabase
      .from('usuario')
      .select(
        'username, auth_id, nombre, apellido, correo, doc_identidad, wallet_address, organizacion, contacto, rol, created_at, foto_perfil_url, activo',
      )
      .eq('id', actor.usuario_id)
      .eq('auth_id', actor.auth_id)
      .single()) as {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };
    const { data: user, error } = result;

    if (error || !user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.activo !== true) throw new ForbiddenException('CUENTA_INACTIVA');
    const legacy = { ...user };
    delete legacy.activo;
    // El consumidor PWA admite string|number: mantener número solo si es seguro.
    const id =
      BigInt(actor.usuario_id) <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(actor.usuario_id)
        : actor.usuario_id;
    const { data: perfil } = await this.perfil.leer(actor);
    return {
      ...legacy,
      id,
      organizacion: perfil.afiliacion?.nombre ?? null,
      afiliacion: perfil.afiliacion,
    };
  }

  async listarParaSelector(filtros: { q?: string; rol?: string }): Promise<
    {
      id: number;
      nombre: string;
      rol: string;
      foto_perfil_url: string | null;
    }[]
  > {
    const supabase = this.supabaseService.getAdminClient();

    let query = supabase
      .from('usuario')
      .select('id, nombre, rol, foto_perfil_url')
      .order('nombre', { ascending: true });

    if (filtros.rol) {
      query = query.eq('rol', filtros.rol.toUpperCase());
    }
    if (filtros.q) {
      query = query.ilike('nombre', `%${filtros.q}%`);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return (
      (data ?? []) as {
        id: number;
        nombre: string;
        rol: string;
        foto_perfil_url: string | null;
      }[]
    ).map((usuario) => {
      const id = Number(usuario.id);
      if (!Number.isSafeInteger(id) || id <= 0)
        throw new InternalServerErrorException(
          'ID fuera del rango seguro del selector legado.',
        );
      return {
        id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        foto_perfil_url: usuario.foto_perfil_url ?? null,
      };
    });
  }

  /**
   * Completa el registro del usuario con datos del formulario
   */
  async registerForm(
    actor: VerifiedActor,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new UnprocessableEntityException('ENTRADA_INVALIDA');
    }
    const dto = body as Record<string, unknown>;
    if ('rol' in dto) {
      throw new UnprocessableEntityException({
        codigo: 'CAMPO_NO_PERMITIDO',
        message: 'rol no es editable.',
      });
    }
    const allowed = [
      'nombre',
      'apellido',
      'organizacion',
      'doc_identidad',
      'wallet_address',
      'contacto',
    ];
    if (Object.keys(dto).some((key) => !allowed.includes(key))) {
      throw new UnprocessableEntityException({
        codigo: 'CAMPO_NO_PERMITIDO',
        message: 'Campo no permitido.',
      });
    }
    const core: Record<string, unknown> = {};
    if ('nombre' in dto) core.nombre = dto.nombre;
    if ('apellido' in dto) core.apellido = dto.apellido;
    if ('organizacion' in dto) {
      core.afiliacion =
        dto.organizacion === null || dto.organizacion === ''
          ? null
          : { tipo: 'OTRA', nombre: dto.organizacion };
    }
    const historical: Record<string, string | null> = {};
    for (const key of ['doc_identidad', 'wallet_address', 'contacto']) {
      if (key in dto) {
        const value = dto[key];
        if (
          value !== null &&
          (typeof value !== 'string' || value.length > 255)
        ) {
          throw new UnprocessableEntityException({
            codigo: 'ENTRADA_INVALIDA',
            message: `${key} inválido.`,
          });
        }
        const text = typeof value === 'string' ? value.trim() : null;
        if (
          key === 'wallet_address' &&
          text &&
          !/^0x[0-9a-fA-F]{40}$/.test(text)
        ) {
          throw new UnprocessableEntityException({
            codigo: 'ENTRADA_INVALIDA',
            message: 'wallet_address inválido.',
          });
        }
        if (key === 'contacto' && text && !/^\+\d{7,15}$/.test(text)) {
          throw new UnprocessableEntityException({
            codigo: 'ENTRADA_INVALIDA',
            message: 'contacto inválido.',
          });
        }
        historical[key] = text || null;
      }
    }
    if (!Object.keys(core).length && !Object.keys(historical).length) {
      throw new UnprocessableEntityException('ENTRADA_INVALIDA');
    }
    await this.perfil.actualizarLegado(
      actor,
      Object.keys(core).length ? parsePerfil(core) : {},
      historical,
    );
    return this.getOwnLegacyProfile(actor);
  }

  // Método para actualizar la foto de perfil
  async updateProfilePhoto(
    actor: VerifiedActor,
    file: Express.Multer.File,
  ): Promise<any> {
    const supabaseAdmin = this.supabaseService.getAdminClient();

    const fileExt = file.originalname.split('.').pop();
    const fileName = `profile-picture.${fileExt}`;
    const folderPath = actor.auth_id;
    const filePath = `${folderPath}/${fileName}`;

    // 🧹 PASO 1: Eliminar cualquier foto anterior en la carpeta del usuario
    // Listamos los archivos en la carpeta del usuario
    const { data: existingFiles, error: listError } =
      await supabaseAdmin.storage.from('imagenes-perfil').list(folderPath);

    if (!listError && existingFiles && existingFiles.length > 0) {
      // Creamos un array con las rutas completas de los archivos a eliminar
      const filesToRemove = existingFiles.map((f) => `${folderPath}/${f.name}`);

      // Los eliminamos
      await supabaseAdmin.storage.from('imagenes-perfil').remove(filesToRemove);
    }

    // 🚀 PASO 2: Subida al bucket usando el cliente Admin (bypasa RLS)
    const { error: uploadError } = await supabaseAdmin.storage
      .from('imagenes-perfil')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
        cacheControl: '0', // 👈 Fuerza a no cachear la imagen en el CDN de Supabase
      });

    if (uploadError) {
      throw new BadRequestException(
        `Error al subir imagen: ${uploadError.message}`,
      );
    }

    // Obtener URL (puede ser del cliente normal porque es público)
    const supabase = this.supabaseService.getAdminClient();
    const {
      data: { publicUrl },
    } = supabase.storage.from('imagenes-perfil').getPublicUrl(filePath);

    // 👇 Añadimos un query param "?v=timestamp" para obligar al navegador a recargar y no usar de su caché local
    const finalUrl = `${publicUrl}?v=${new Date().getTime()}`;

    const result = (await supabase.rpc('pa_perfil_foto_actualizar', {
      p_usuario_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_foto_url: finalUrl,
    })) as {
      data: unknown;
      error: { message: string } | null;
    };
    const { error: dbError } = result;

    if (dbError?.message.includes('CUENTA_INACTIVA'))
      throw new ForbiddenException('CUENTA_INACTIVA');
    if (dbError) throw new BadRequestException('Error al guardar en DB');

    return this.getOwnLegacyProfile(actor);
  }
}
