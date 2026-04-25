import { Injectable, NotImplementedException } from '@nestjs/common';
import { FiltrarLotesViveroDto } from '../api/dto/filtrar-lotes-vivero.dto';
import { FiltrarTimelineLoteDto } from '../api/dto/filtrar-timeline-lote.dto';

@Injectable()
export class ViveroConsultasService {
  async listarLotes(filters: FiltrarLotesViveroDto) {
    throw new NotImplementedException(
      'Pendiente: listar lotes de vivero con filtros operativos.',
    );
  }

  async obtenerTimeline(loteId: number, filters: FiltrarTimelineLoteDto) {
    throw new NotImplementedException(
      'Pendiente: obtener timeline auditable del lote de vivero.',
    );
  }
}
