import { Module } from '@nestjs/common';
import { RecoleccionesService } from './application/recolecciones.service';
import { RecoleccionesController } from './api/recolecciones.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PinataModule } from '../pinata/pinata.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { UbicacionesModule } from '../common/ubicaciones/ubicaciones.module';
import { RecoleccionElegibilidadService } from './application/recoleccion-elegibilidad.service';
import { PlantasModule } from '../plantas/plantas.module';
import { RecoleccionHistorialService } from './application/recoleccion-historial.service';
import { RecoleccionSnapshotsService } from './application/recoleccion-snapshots.service';
import { RecoleccionAuthService } from './application/recoleccion-auth.service';
import { RecoleccionBlockchainService } from './application/recoleccion-blockchain.service';
import { RecoleccionCodigosService } from './application/recoleccion-codigos.service';
import { RecoleccionCompletitudService } from './application/recoleccion-completitud.service';
import { RecoleccionConsultasService } from './application/recoleccion-consultas.service';
import { RecoleccionCreationService } from './application/recoleccion-creation.service';
import { RecoleccionDraftService } from './application/recoleccion-draft.service';
import { RecoleccionEvidenciasService } from './application/recoleccion-evidencias.service';
import { RecoleccionUbicacionService } from './application/recoleccion-ubicacion.service';
import { RecoleccionValidacionService } from './application/recoleccion-validacion.service';

@Module({
  imports: [SupabaseModule, PinataModule, BlockchainModule, UbicacionesModule, PlantasModule],
  controllers: [RecoleccionesController],
  providers: [
    RecoleccionesService,
    RecoleccionElegibilidadService,
    RecoleccionHistorialService,
    RecoleccionSnapshotsService,
    RecoleccionAuthService,
    RecoleccionBlockchainService,
    RecoleccionCodigosService,
    RecoleccionCompletitudService,
    RecoleccionConsultasService,
    RecoleccionCreationService,
    RecoleccionDraftService,
    RecoleccionEvidenciasService,
    RecoleccionUbicacionService,
    RecoleccionValidacionService,
  ],
  exports: [
    RecoleccionesService,
    RecoleccionElegibilidadService,
    RecoleccionHistorialService,
    RecoleccionSnapshotsService,
  ],
})
export class RecoleccionesModule {}
