import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SupabaseModule } from '../supabase/supabase.module';
import { InternalActorGuard } from './internal-actor.guard';

@Module({
  imports: [ConfigModule, JwtModule.register({}), SupabaseModule],
  providers: [InternalActorGuard],
  // Nest resuelve los guards declarados por decorator también en cada módulo
  // consumidor; sus dependencias deben estar disponibles en ese contexto.
  exports: [InternalActorGuard, JwtModule, ConfigModule, SupabaseModule],
})
export class ActorModule {}
