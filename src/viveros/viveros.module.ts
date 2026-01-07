import { Module } from '@nestjs/common';
import { ViverosService } from './viveros.service';
import { ViverosController } from './viveros.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ViverosController],
  providers: [ViverosService],
  exports: [ViverosService],
})
export class ViverosModule {}
