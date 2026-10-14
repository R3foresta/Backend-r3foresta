import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

export type VerifiedActor = {
  auth_id: string;
  usuario_id: string;
  rol: string;
};

export type ActorRequest = Request & { actor: VerifiedActor };

export async function verifyBearerIdentity(
  request: Request,
  jwt: JwtService,
  config: ConfigService,
): Promise<string> {
  const token = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token)
    throw new UnauthorizedException(
      'Se requiere Authorization: Bearer <token>.',
    );
  const secret = config.get<string>('JWT_SECRET');
  if (!secret?.trim())
    throw new InternalServerErrorException('JWT_SECRET no está configurado.');
  let payload: { sub?: unknown; exp?: unknown };
  try {
    payload = await jwt.verifyAsync(token, { secret, algorithms: ['HS256'] });
  } catch {
    throw new UnauthorizedException('Token inválido o expirado.');
  }
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub.trim() ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp)
  ) {
    throw new UnauthorizedException('Token sin identidad o expiración válida.');
  }
  const header = request.headers['x-auth-id'];
  if (
    header !== undefined &&
    (typeof header !== 'string' || header.trim() !== payload.sub)
  ) {
    throw new UnauthorizedException(
      'x-auth-id no coincide con la sesión autenticada.',
    );
  }
  return payload.sub;
}

@Injectable()
export class VerifiedActorGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    request.res?.setHeader('Cache-Control', 'private, no-store');
    request.res?.setHeader('Vary', 'Authorization');
    const authId = await verifyBearerIdentity(request, this.jwt, this.config);
    const result = (await this.supabase
      .getAdminClient()
      .rpc('pa_actor_verificar', { p_auth_id: authId })) as {
      data: unknown;
      error: { message: string } | null;
    };
    const { data, error } = result;
    if (error)
      throw new InternalServerErrorException('No se pudo verificar la cuenta.');
    const actor = data as {
      usuario_id?: unknown;
      rol?: unknown;
      activo?: unknown;
    } | null;
    if (!actor || typeof actor.usuario_id !== 'string')
      throw new UnauthorizedException('La cuenta de la sesión no existe.');
    if (actor.activo !== true) throw new ForbiddenException('CUENTA_INACTIVA');
    request.actor = {
      auth_id: authId,
      usuario_id: actor.usuario_id,
      rol: String(actor.rol),
    };
    return true;
  }
}
