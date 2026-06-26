import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubcampaniasModule } from '../subcampanias/subcampanias.module';
import { CampaniasController } from './api/campanias.controller';
import { CampaniasAuthService } from './application/campanias-auth.service';
import { CampaniasCodigosService } from './application/campanias-codigos.service';
import { CampaniasConsultasService } from './application/campanias-consultas.service';
import { CampaniasCreationService } from './application/campanias-creation.service';
import { CampaniasEdicionService } from './application/campanias-edicion.service';
import { CampaniasOrganizacionesService } from './application/campanias-organizaciones.service';
import { CampaniasService } from './application/campanias.service';

@Module({
  imports: [SupabaseModule, SubcampaniasModule],
  controllers: [CampaniasController],
  providers: [
    CampaniasService,
    CampaniasAuthService,
    CampaniasCodigosService,
    CampaniasCreationService,
    CampaniasConsultasService,
    CampaniasEdicionService,
    CampaniasOrganizacionesService,
  ],
  exports: [CampaniasService],
})
export class CampaniasModule {}
