import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { ParticipacionImagenService } from '../../participacion/cargas/participacion-imagen.service';
import { SeedBankService } from '../application/seed-bank.service';
import { SeedBankController } from './seed-bank.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [SeedBankController],
  providers: [SeedBankService, ParticipacionImagenService],
})
export class SeedBankModule {}
