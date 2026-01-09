import { Module } from '@nestjs/common';
import { RecoleccionesService } from './recolecciones.service';
import { RecoleccionesController } from './recolecciones.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PinataModule } from '../pinata/pinata.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [SupabaseModule, PinataModule, BlockchainModule],
  controllers: [RecoleccionesController],
  providers: [RecoleccionesService],
  exports: [RecoleccionesService],
})
export class RecoleccionesModule {}
