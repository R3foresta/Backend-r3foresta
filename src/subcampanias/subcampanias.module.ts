import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubcampaniasController } from './api/subcampanias.controller';
import { SubcampaniasActivacionService } from './application/subcampanias-activacion.service';
import { SubcampaniasAuthService } from './application/subcampanias-auth.service';
import { SubcampaniasCancelacionService } from './application/subcampanias-cancelacion.service';
import { SubcampaniasCierreService } from './application/subcampanias-cierre.service';
import { SubcampaniasCodigosService } from './application/subcampanias-codigos.service';
import { SubcampaniasConsultasService } from './application/subcampanias-consultas.service';
import { SubcampaniasCreationService } from './application/subcampanias-creation.service';
import { SubcampaniasEdicionService } from './application/subcampanias-edicion.service';
import { SubcampaniasEquipoService } from './application/subcampanias-equipo.service';
import { SubcampaniasHistorialService } from './application/subcampanias-historial.service';
import { SubcampaniasPlanService } from './application/subcampanias-plan.service';
import { SubcampaniasPoligonoService } from './application/subcampanias-poligono.service';
import { SubcampaniasService } from './application/subcampanias.service';

@Module({
  imports: [SupabaseModule],
  controllers: [SubcampaniasController],
  providers: [
    SubcampaniasService,
    SubcampaniasAuthService,
    SubcampaniasCodigosService,
    SubcampaniasCreationService,
    SubcampaniasConsultasService,
    SubcampaniasEdicionService,
    SubcampaniasPoligonoService,
    SubcampaniasActivacionService,
    SubcampaniasCierreService,
    SubcampaniasCancelacionService,
    SubcampaniasEquipoService,
    SubcampaniasHistorialService,
    SubcampaniasPlanService,
  ],
  exports: [SubcampaniasService],
})
export class SubcampaniasModule {}
