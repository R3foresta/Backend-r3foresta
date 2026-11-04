import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PerfilV1Controller } from './perfil-v1.controller';
import { PerfilV1Service } from './perfil-v1.service';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { UsuariosAdministracionController } from './usuarios-administracion.controller';
import { UsuariosAdministracionService } from './application/usuarios-administracion.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret?.trim()) throw new Error('JWT_SECRET no está configurado.');
        return { secret, signOptions: { expiresIn: '7d' } };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [
    UsersController,
    PerfilV1Controller,
    UsuariosAdministracionController,
  ],
  providers: [
    UsersService,
    PerfilV1Service,
    UsuariosAdministracionService,
    VerifiedActorGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
