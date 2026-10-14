import { ActorModule } from '../auth/actor.module';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { OrganizacionesAuthService } from './organizaciones-auth.service';
import { OrganizacionesController } from './organizaciones.controller';
import { OrganizacionesLogoService } from './organizaciones-logo.service';
import { OrganizacionesService } from './organizaciones.service';

@Module({
  imports: [ActorModule, SupabaseModule],
  controllers: [OrganizacionesController],
  providers: [
    OrganizacionesService,
    OrganizacionesAuthService,
    OrganizacionesLogoService,
  ],
  exports: [OrganizacionesService],
})
export class OrganizacionesModule {}
