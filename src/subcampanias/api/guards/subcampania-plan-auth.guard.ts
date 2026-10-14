import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { verifyBearerIdentity } from '../../../auth/verified-actor.guard';

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
    request.res?.setHeader('Cache-Control', 'private, no-store');
    request.res?.setHeader('Vary', 'Authorization');
    request.planAuthId = await verifyBearerIdentity(
      request,
      this.jwtService,
      this.configService,
    );
    return true;
  }
}
