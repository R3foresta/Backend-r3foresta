import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

type SaldosVistaRow = {
  lote_id: number;
  saldo_vivo_actual: number | null;
  saldo_asignado_total: number;
  saldo_vivo_disponible_asignacion: number | null;
};

type SaldosBaseRow = {
  lote_id: number;
  saldo_vivo_actual: number | null;
  saldo_asignado_total: number;
  saldo_vivo_disponible_asignacion: number | null;
};

type AsignacionRow = {
  id: number;
  subcampania_id: number;
  proposito: string;
  cantidad_asignada: number;
  cantidad_consumida: number;
  cantidad_devuelta: number;
  cantidad_mermada: number;
  saldo_asignado_disponible: number;
};

@Injectable()
export class ViveroSaldosService {
  private readonly logger = new Logger(ViveroSaldosService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async obtenerSaldos(loteId: number) {
    const supabase = this.supabaseService.getClient();
    const saldos = await this.cargarSaldosBase(loteId);

    const { data: asignacionesData, error: asignacionesError } = await supabase
      .from('asignacion_vivero_subcampania')
      .select(
        'id, subcampania_id, proposito, cantidad_asignada, cantidad_consumida, cantidad_devuelta, cantidad_mermada, saldo_asignado_disponible',
      )
      .eq('lote_vivero_id', loteId)
      .eq('estado', 'ACTIVA')
      .order('fecha_asignacion', { ascending: true });

    if (asignacionesError) {
      this.logger.error('Error al leer asignaciones activas:', asignacionesError);
      throw new InternalServerErrorException('Error al obtener asignaciones del lote');
    }

    const asignaciones = (asignacionesData ?? []) as AsignacionRow[];

    const subcampaniaIds = [...new Set(asignaciones.map((a) => a.subcampania_id))];
    const subcampaniaNombres: Record<number, string> = {};

    if (subcampaniaIds.length > 0) {
      const { data: subData } = await supabase
        .from('subcampania')
        .select('id, nombre')
        .in('id', subcampaniaIds);

      if (subData) {
        for (const sub of subData as { id: number; nombre: string }[]) {
          subcampaniaNombres[sub.id] = sub.nombre;
        }
      }
    }

    return {
      success: true,
      data: {
        lote_id: Number(saldos.lote_id),
        saldo_vivo_actual:
          saldos.saldo_vivo_actual !== null ? Number(saldos.saldo_vivo_actual) : null,
        saldo_asignado_total: Number(saldos.saldo_asignado_total),
        saldo_vivo_disponible_asignacion:
          saldos.saldo_vivo_disponible_asignacion !== null
            ? Number(saldos.saldo_vivo_disponible_asignacion)
            : null,
        asignaciones_activas: asignaciones.map((a) => ({
          id: Number(a.id),
          subcampania_id: Number(a.subcampania_id),
          subcampania_nombre: subcampaniaNombres[a.subcampania_id] ?? null,
          proposito: a.proposito,
          cantidad_asignada: Number(a.cantidad_asignada),
          cantidad_consumida: Number(a.cantidad_consumida),
          cantidad_devuelta: Number(a.cantidad_devuelta),
          cantidad_mermada: Number(a.cantidad_mermada),
          saldo_asignado_disponible: Number(a.saldo_asignado_disponible),
        })),
      },
    };
  }

  // Lectura ligera del saldo disponible para validacion pre-despacho.
  async leerSaldoDisponible(loteId: number): Promise<number> {
    const saldos = await this.cargarSaldosBase(loteId);
    return saldos.saldo_vivo_disponible_asignacion !== null
      ? Number(saldos.saldo_vivo_disponible_asignacion)
      : 0;
  }

  assertCantidadNoExcedeSaldo(
    cantidad: number,
    saldoDisponible: number,
    loteId: number,
  ): void {
    if (cantidad > saldoDisponible) {
      throw new BadRequestException(
        `La cantidad solicitada (${cantidad}) excede el saldo vivo disponible para asignacion del lote ${loteId} (${saldoDisponible}). Para despachar mas, primero devuelva las reservas activas.`,
      );
    }
  }

  private async cargarSaldosBase(loteId: number): Promise<SaldosBaseRow> {
    const desdeVista = await this.intentarLeerDesdeVista(loteId);
    if (desdeVista) {
      return desdeVista;
    }

    return this.calcularSaldosDesdeTablas(loteId);
  }

  private async intentarLeerDesdeVista(
    loteId: number,
  ): Promise<SaldosBaseRow | null> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('v_lote_vivero_saldos')
      .select(
        'lote_id, saldo_vivo_actual, saldo_asignado_total, saldo_vivo_disponible_asignacion',
      )
      .eq('lote_id', loteId)
      .maybeSingle();

    if (!error) {
      if (!data) {
        throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
      }

      return data as SaldosVistaRow;
    }

    if (!this.esErrorPorVistaAusente(error)) {
      this.logger.error('Error al leer v_lote_vivero_saldos:', error);
      throw new InternalServerErrorException('Error al calcular saldos del lote');
    }

    this.logger.warn(
      `v_lote_vivero_saldos no existe o no esta visible en schema cache. Se calcula saldo del lote ${loteId} desde tablas base.`,
    );
    return null;
  }

  private async calcularSaldosDesdeTablas(
    loteId: number,
  ): Promise<SaldosBaseRow> {
    const supabase = this.supabaseService.getClient();

    const { data: loteData, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, saldo_vivo_actual')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al leer lote_vivero para saldos:', loteError);
      throw new InternalServerErrorException('Error al calcular saldos del lote');
    }

    if (!loteData) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const { data: asignacionesData, error: asignacionesError } = await supabase
      .from('asignacion_vivero_subcampania')
      .select('saldo_asignado_disponible')
      .eq('lote_vivero_id', loteId)
      .eq('estado', 'ACTIVA');

    if (asignacionesError) {
      this.logger.error(
        'Error al leer asignaciones activas para saldo fallback:',
        asignacionesError,
      );
      throw new InternalServerErrorException('Error al calcular saldos del lote');
    }

    const saldoVivoActual =
      loteData.saldo_vivo_actual !== null ? Number(loteData.saldo_vivo_actual) : null;
    const saldoAsignadoTotal = (asignacionesData ?? []).reduce(
      (acc, row) => acc + Number(row.saldo_asignado_disponible ?? 0),
      0,
    );

    return {
      lote_id: Number(loteData.id),
      saldo_vivo_actual: saldoVivoActual,
      saldo_asignado_total: saldoAsignadoTotal,
      saldo_vivo_disponible_asignacion:
        saldoVivoActual !== null ? saldoVivoActual - saldoAsignadoTotal : null,
    };
  }

  private esErrorPorVistaAusente(error: {
    code?: string;
    message?: string;
  }): boolean {
    return (
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      error.message?.includes("Could not find the table 'public.v_lote_vivero_saldos'") ===
        true ||
      error.message?.includes('relation "public.v_lote_vivero_saldos" does not exist') ===
        true
    );
  }
}
