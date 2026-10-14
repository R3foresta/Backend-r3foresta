import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../supabase/supabase.service';
import { ActorRequest, VerifiedActorGuard } from './verified-actor.guard';

const ACTIVE_ACCOUNT = 'pa:active-account';
// El plan conserva su audiencia: lectura para cualquier cuenta activa.
export const ActiveAccountAudience = () => SetMetadata(ACTIVE_ACCOUNT, true);

@Injectable()
export class InternalActorGuard extends VerifiedActorGuard {
  constructor(
    jwt: JwtService,
    config: ConfigService,
    supabase: SupabaseService,
    private readonly reflector: Reflector,
  ) {
    super(jwt, config, supabase);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<ActorRequest>();
    if (
      !this.reflector.get<boolean>(ACTIVE_ACCOUNT, context.getHandler()) &&
      !['ADMIN', 'GENERAL', 'VALIDADOR'].includes(request.actor.rol)
    ) {
      throw new ForbiddenException(
        'Esta operación requiere una cuenta interna.',
      );
    }
    // Adaptador para los controllers legados: identidad y rol vienen de DB/JWT.
    request.headers['x-auth-id'] = request.actor.auth_id;
    request.headers['x-user-role'] = request.actor.rol;
    return true;
  }
}
