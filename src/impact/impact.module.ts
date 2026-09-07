import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImpactController } from './impact.controller';
import { ImpactService } from './impact.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ImpactController],
  providers: [ImpactService],
})
export class ImpactModule {}
