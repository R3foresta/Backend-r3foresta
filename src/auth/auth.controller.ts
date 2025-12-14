import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * GET /auth/challenge
   * Genera un challenge para WebAuthn
   */
  @Get('challenge')
  getChallenge() {
    return this.authService.generateChallenge();
  }

  /**
   * POST /auth/register
   * Registra un nuevo usuario con passkey
   */
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    const origin = req.headers.origin || 'http://localhost:5173';
    return this.authService.register(registerDto, origin);
  }

  /**
   * POST /auth/login
   * Autentica al usuario con passkey
   */
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const origin = req.headers.origin || 'http://localhost:5173';
    return this.authService.login(loginDto, origin);
  }
}
