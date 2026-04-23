import { Module } from '@nestjs/common';
import { RecoleccionesService } from './recolecciones.service';
import { RecoleccionesController } from './recolecciones.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PinataModule } from '../pinata/pinata.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { UbicacionesModule } from '../common/ubicaciones/ubicaciones.module';
import { RecoleccionElegibilidadService } from './recoleccion-elegibilidad.service';
import { RecoleccionSnapshotsService } from './recoleccion-snapshots.service';

@Module({
  imports: [SupabaseModule, PinataModule, BlockchainModule, UbicacionesModule],
  controllers: [RecoleccionesController],
  providers: [
    RecoleccionesService,
    RecoleccionElegibilidadService,
    RecoleccionSnapshotsService,
  ],
  exports: [
    RecoleccionesService,
    RecoleccionElegibilidadService,
    RecoleccionSnapshotsService,
  ],
})
export class RecoleccionesModule {}
