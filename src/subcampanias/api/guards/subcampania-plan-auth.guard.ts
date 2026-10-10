import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export type PlanAuthenticatedRequest = Request & { planAuthId: string };

@Injectable()
export class SubcampaniaPlanAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<PlanAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) {
      throw new UnauthorizedException(
        'Se requiere Authorization: Bearer <token>.',
      );
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret?.trim()) {
      throw new InternalServerErrorException('JWT_SECRET no está configurado.');
    }

    let payload: { sub?: unknown; exp?: unknown };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
        exp?: unknown;
      }>(token, { secret, algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp)
    ) {
      throw new UnauthorizedException(
        'Token sin identidad o expiración válida.',
      );
    }

    const authId = payload.sub;
    const suppliedAuthId = request.headers['x-auth-id'];
    if (
      suppliedAuthId !== undefined &&
      (typeof suppliedAuthId !== 'string' || suppliedAuthId.trim() !== authId)
    ) {
      throw new UnauthorizedException(
        'x-auth-id no coincide con la sesión autenticada.',
      );
    }
    request.planAuthId = authId;
    return true;
  }
}
