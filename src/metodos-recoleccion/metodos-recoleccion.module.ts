import { Module } from '@nestjs/common';
import { MetodosRecoleccionService } from './metodos-recoleccion.service';
import { MetodosRecoleccionController } from './metodos-recoleccion.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [MetodosRecoleccionController],
  providers: [MetodosRecoleccionService],
  exports: [MetodosRecoleccionService],
})
export class MetodosRecoleccionModule {}
