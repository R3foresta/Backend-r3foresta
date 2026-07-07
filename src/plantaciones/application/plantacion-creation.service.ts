import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegistrarPlantacionDto } from '../api/dto/registrar-plantacion.dto';
import {
  CoresponsablesPolicy,
  CoresponsablesPolicyError,
} from '../domain/policies/coresponsables.policy';
import {
  DetallesPlantacionPolicy,
  DetallesPlantacionPolicyError,
} from '../domain/policies/detalles.policy';
import {
  ReposicionPolicy,
  ReposicionPolicyError,
} from '../domain/policies/reposicion.policy';
import { PlantacionAuthService } from './plantacion-auth.service';

type ConsumoAsignacionRow = {
  asignacion_id: number;
  lote_vivero_id: number;
  cantidad_consumida: number;
  saldo_asignado_antes: number;
  saldo_asignado_despues: number;
  estado_final: string | null;
};

type RpcRegistrarPlantacionResult = {
  registro_plantacion_id: number;
  codigo_trazabilidad: string;
  cantidad_total_plantada: number;
  gps_dentro_poligono: boolean;
  gps_distancia_a_poligono_m: number | null;
  consumos: ConsumoAsignacionRow[];
  coresponsable_ids_vinculados: number[];
  evidencia_ids_vinculadas: number[];
};

@Injectable()
export class PlantacionCreationService {
  private readonly logger = new Logger(PlantacionCreationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: PlantacionAuthService,
  ) {}

  async registrar(dto: RegistrarPlantacionDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const esReposicion = dto.es_reposicion ?? false;
    const registroOrigenId = dto.registro_plantacion_origen_id ?? null;

    try {
      ReposicionPolicy.assertCoherencia(esReposicion, registroOrigenId);
      DetallesPlantacionPolicy.assertValidos(dto.detalles);
    } catch (err) {
      if (
        err instanceof ReposicionPolicyError ||
        err instanceof DetallesPlantacionPolicyError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    let coresponsableIds: number[];
    try {
      coresponsableIds = CoresponsablesPolicy.normalizar(
        dto.coresponsable_ids,
        usuario.id,
      );
    } catch (err) {
      if (err instanceof CoresponsablesPolicyError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .rpc('fn_m3_registrar_plantacion', {
        p_subcampania_id: dto.subcampania_id,
        p_es_reposicion: esReposicion,
        p_registro_plantacion_origen_id: registroOrigenId,
        p_fecha_plantacion: dto.fecha_plantacion,
        p_responsable_id: usuario.id,
        p_latitud: dto.latitud,
        p_longitud: dto.longitud,
        p_observaciones: dto.observaciones ?? null,
        p_coresponsable_ids: coresponsableIds,
        p_detalles: dto.detalles.map((d) => ({
          asignacion_id: d.asignacion_id,
          lote_vivero_id: d.lote_vivero_id,
          planta_id: d.planta_id,
          cantidad: d.cantidad,
        })),
        p_evidencia_ids: dto.evidencia_ids,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar plantacion:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar la plantacion.',
      );
    }

    const row = data as RpcRegistrarPlantacionResult;

    return {
      success: true,
      data: {
        message: 'Plantacion registrada correctamente.',
        registro_plantacion_id: Number(row.registro_plantacion_id),
        codigo_trazabilidad: row.codigo_trazabilidad,
        cantidad_total_plantada: Number(row.cantidad_total_plantada),
        gps_dentro_poligono: row.gps_dentro_poligono,
        gps_distancia_a_poligono_m:
          row.gps_distancia_a_poligono_m !== null
            ? Number(row.gps_distancia_a_poligono_m)
            : null,
        // Contrato fisico M2-M3: plantar consume asignaciones, no genera
        // despachos M2 ni toca el saldo del lote (RN-VIV-52).
        consumos: (row.consumos ?? []).map((c) => ({
          asignacion_id: Number(c.asignacion_id),
          lote_vivero_id: Number(c.lote_vivero_id),
          cantidad_consumida: Number(c.cantidad_consumida),
          saldo_asignado_antes: Number(c.saldo_asignado_antes),
          saldo_asignado_despues: Number(c.saldo_asignado_despues),
          estado_final: c.estado_final ?? null,
        })),
        coresponsable_ids_vinculados: (
          row.coresponsable_ids_vinculados ?? []
        ).map(Number),
        evidencia_ids_vinculadas: (row.evidencia_ids_vinculadas ?? []).map(
          Number,
        ),
      },
    };
  }
}
