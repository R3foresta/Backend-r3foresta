import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import {
  ActivacionPolicy,
  ActivacionPolicyError,
} from '../domain/policies/activacion.policy';
import {
  TransicionEstadoPolicy,
  TransicionEstadoPolicyError,
} from '../domain/policies/transicion-estado.policy';
import { SubcampaniasAuthService } from './subcampanias-auth.service';
import {
  SubcampaniasHistorialService,
  TipoHistorialSubcampania,
} from './subcampanias-historial.service';

type SubcampaniaActivacionRow = {
  id: number;
  campania_id: number;
  estado: EstadoSubcampania;
  meta_total_arboles: number | null;
  poligono_geom: object | string | null;
  zona_id: number;
};

type UsuarioResumenRow = {
  id: number;
  nombre: string | null;
};

type CoordinadorRow = {
  usuario_id: number;
  usuario: UsuarioResumenRow | UsuarioResumenRow[] | null;
};

type ZonaRow = {
  nombre: string | null;
};

type NombreRelacionRow = {
  nombre: string | null;
};

type CampaniaOrganizacionRow = {
  organizacion: NombreRelacionRow | NombreRelacionRow[] | null;
};

type PlantaReservaRow = {
  id: number;
  especie: string | null;
  nombre_cientifico: string | null;
};

type LoteReservaRow = {
  planta_id: number;
  planta: PlantaReservaRow | PlantaReservaRow[] | null;
};

type ReservaComposicionRow = {
  saldo_asignado_disponible: number;
  lote_vivero: LoteReservaRow | LoteReservaRow[] | null;
};

@Injectable()
export class SubcampaniasActivacionService {
  private readonly logger = new Logger(SubcampaniasActivacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
    private readonly historialService: SubcampaniasHistorialService,
  ) {}

  async activar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: actualData, error: fetchError } = await supabase
      .from('subcampania')
      .select(
        'id, campania_id, estado, meta_total_arboles, poligono_geom, zona_id',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !actualData) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }

    const actual = actualData as SubcampaniaActivacionRow;
    const estadoActual = actual.estado;

    try {
      TransicionEstadoPolicy.assertTransicionValida(
        estadoActual,
        EstadoSubcampania.ACTIVA,
      );
    } catch (err) {
      if (err instanceof TransicionEstadoPolicyError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    const tienePoligono = actual.poligono_geom !== null;

    const { data: coordinadorData } = await supabase
      .from('subcampania_equipo')
      .select('usuario_id, usuario!subcampania_equipo_usuario_fk(id, nombre)')
      .eq('subcampania_id', id)
      .eq('rol', 'COORDINADOR')
      .maybeSingle();

    const coordinadorRow = coordinadorData as CoordinadorRow | null;
    const tieneCoordinador = !!coordinadorRow;
    const composicion = await this.obtenerComposicionReservada(id);
    const planEspecies = await this.obtenerPlan(id);
    const metaTotal = Number(actual.meta_total_arboles ?? 0);

    try {
      ActivacionPolicy.assertPuedeActivar({
        estadoActual,
        tienePoligono,
        tieneCoordinador,
        metaTotal,
        planEspecies,
      });
    } catch (err) {
      if (err instanceof ActivacionPolicyError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    const { data: zona } = await supabase
      .from('division_administrativa')
      .select('nombre')
      .eq('id', actual.zona_id)
      .single();

    const nombreZona = (zona as ZonaRow | null)?.nombre ?? null;
    const nombreCoordinador =
      this.unwrapRelation(coordinadorRow?.usuario)?.nombre ?? null;

    const { data: orgs } = await supabase
      .from('campania_organizacion')
      .select('organizacion(nombre)')
      .eq('campania_id', actual.campania_id);

    const nombresOrganizaciones = ((orgs ?? []) as CampaniaOrganizacionRow[])
      .map((o) => this.unwrapRelation(o.organizacion)?.nombre)
      .filter((n: string | null | undefined): n is string => !!n);

    const { data: updated, error } = await supabase
      .from('subcampania')
      .update({
        estado: EstadoSubcampania.ACTIVA,
        nombre_zona_snapshot: nombreZona,
        nombre_coordinador_snapshot: nombreCoordinador,
        nombres_organizaciones_snapshot: nombresOrganizaciones,
        updated_by: usuario.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, estado, nombre_zona_snapshot, nombre_coordinador_snapshot, nombres_organizaciones_snapshot, updated_at',
      )
      .single();

    if (error) {
      this.logger.error('Error al activar subcampania:', error);
      throw new BadRequestException(
        error.message || 'No se pudo activar la subcampaña.',
      );
    }

    const totalReservado = composicion.reduce(
      (acc, item) => acc + item.saldo_reservado,
      0,
    );

    await this.historialService.registrar({
      subcampaniaId: id,
      tipo: TipoHistorialSubcampania.SUBCAMPANIA_ACTIVADA,
      actorUserId: usuario.id,
      estadoOrigen: EstadoSubcampania.BORRADOR,
      estadoDestino: EstadoSubcampania.ACTIVA,
      metadata: {
        nombre_zona_snapshot: nombreZona,
        nombre_coordinador_snapshot: nombreCoordinador,
        nombres_organizaciones_snapshot: nombresOrganizaciones,
        meta_total_arboles: metaTotal,
        total_reservado_al_activar: totalReservado,
        especies_planificadas: planEspecies.length,
      },
    });

    return {
      success: true,
      data: {
        message: 'Subcampaña activada correctamente.',
        composicion_reservada: composicion,
        ...(updated as Record<string, unknown>),
      },
    };
  }

  private async obtenerPlan(subcampaniaId: number): Promise<
    {
      planta_id: number;
      porcentaje_objetivo: number;
      cantidad_objetivo: number;
    }[]
  > {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('subcampania_meta_especie')
      .select('planta_id, porcentaje_objetivo, cantidad_objetivo')
      .eq('subcampania_id', subcampaniaId);

    if (error) {
      this.logger.error('Error al leer plan de metas por especie:', error);
      throw new InternalServerErrorException(
        'Error al verificar el plan de metas por especie.',
      );
    }

    return (data ?? []).map((row: any) => ({
      planta_id: Number(row.planta_id),
      porcentaje_objetivo: Number(row.porcentaje_objetivo),
      cantidad_objetivo: Number(row.cantidad_objetivo),
    }));
  }

  private async obtenerComposicionReservada(subcampaniaId: number): Promise<
    {
      planta_id: number;
      especie: string | null;
      nombre_cientifico: string | null;
      saldo_reservado: number;
    }[]
  > {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('asignacion_vivero_subcampania')
      .select(
        'saldo_asignado_disponible, lote_vivero!inner(planta_id, planta:planta_id(id, especie, nombre_cientifico))',
      )
      .eq('subcampania_id', subcampaniaId)
      .eq('estado', 'ACTIVA');

    if (error) {
      this.logger.error(
        'Error al leer composicion reservada de subcampania:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al verificar reservas de la subcampaña',
      );
    }

    const porPlanta = new Map<
      number,
      {
        planta_id: number;
        especie: string | null;
        nombre_cientifico: string | null;
        saldo_reservado: number;
      }
    >();

    for (const row of (data ?? []) as ReservaComposicionRow[]) {
      const lote = this.unwrapRelation(row.lote_vivero);
      const planta = this.unwrapRelation(lote?.planta);
      const plantaId = Number(lote?.planta_id ?? planta?.id);
      if (!Number.isFinite(plantaId)) continue;

      const current = porPlanta.get(plantaId) ?? {
        planta_id: plantaId,
        especie: planta?.especie ?? null,
        nombre_cientifico: planta?.nombre_cientifico ?? null,
        saldo_reservado: 0,
      };
      current.saldo_reservado += Number(row.saldo_asignado_disponible ?? 0);
      porPlanta.set(plantaId, current);
    }

    return [...porPlanta.values()].filter((item) => item.saldo_reservado > 0);
  }

  private unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
}
