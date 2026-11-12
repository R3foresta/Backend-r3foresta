import { Module } from '@nestjs/common';
import { ActorModule } from '../auth/actor.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ViveroAuthService } from './application/vivero-auth.service';
import { ViveroAccesosService } from './application/vivero-accesos.service';
import { ViveroAccesosController } from './api/vivero-accesos.controller';
@Module({
  imports: [ActorModule, SupabaseModule],
  controllers: [ViveroAccesosController],
  providers: [ViveroAuthService, ViveroAccesosService],
  exports: [ViveroAuthService],
})
export class ViveroAccesoModule {}
