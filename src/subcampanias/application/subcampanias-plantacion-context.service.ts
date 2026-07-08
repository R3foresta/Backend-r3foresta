import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { RolEnSubcampania } from '../domain/enums/rol-en-subcampania.enum';
import { REGLAS_PLANTACION_INICIAL } from '../domain/policies/reglas-plantacion.policy';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

type CampaniaEmbed = { id: number; nombre: string } | null;

type SubcampaniaRow = {
  id: number;
  campania_id: number;
  nombre: string;
  estado: string;
  fase_mantenimiento: string;
  zona_id: number;
  meta_total_arboles: number;
  total_plantado_inicial: number;
  tolerancia_gps_metros: number;
  nombre_zona_snapshot: string | null;
  codigo_trazabilidad: string;
  campania: CampaniaEmbed | CampaniaEmbed[];
};

type EquipoRow = {
  usuario_id: number;
  rol: string;
  usuario:
    | { id: number; nombre: string | null }
    | { id: number; nombre: string | null }[]
    | null;
};

type PlantaEmbed = {
  id: number;
  especie: string | null;
  nombre_cientifico: string | null;
  nombre_comun_principal: string | null;
} | null;

type MetaEspecieRow = {
  planta_id: number;
  cantidad_objetivo: number;
  planta: PlantaEmbed | PlantaEmbed[];
};

type LoteEmbed = {
  id: number;
  codigo_trazabilidad: string | null;
  planta_id: number;
  vivero:
    | { id: number; nombre: string | null }
    | { id: number; nombre: string | null }[]
    | null;
  planta: PlantaEmbed | PlantaEmbed[];
} | null;

type AsignacionRow = {
  id: number;
  lote_vivero_id: number;
  cantidad_asignada: number;
  cantidad_consumida: number;
  cantidad_devuelta: number;
  cantidad_mermada: number;
  saldo_asignado_disponible: number;
  fecha_asignacion: string;
  lote: LoteEmbed | LoteEmbed[];
};

const ROLES_GLOBALES_OPERATIVOS = ['ADMIN', 'VALIDADOR', 'GENERAL'];

/**
 * GET /subcampanias/:id/plantacion/context
 *
 * Entrega en una sola llamada todo lo necesario para registrar una plantación
 * inicial desde campo: subcampaña, permisos del usuario, equipo, plan por
 * especie con avance, stock asignado disponible (con orden de consumo FIFO
 * resuelto) y las reglas operativas — sin que el frontend tenga que resolver
 * asignaciones buscando lote por lote.
 */
@Injectable()
export class SubcampaniasPlantacionContextService {
  private readonly logger = new Logger(
    SubcampaniasPlantacionContextService.name,
  );

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async obtener(subcampaniaId: number, authId: string) {
    const supabase = this.supabaseService.getClient();

    // 1. Subcampaña existe y no está eliminada (404).
    const { data: subData, error: subError } = await supabase
      .from('subcampania')
      .select(
        'id, campania_id, nombre, estado, fase_mantenimiento, zona_id, meta_total_arboles, total_plantado_inicial, tolerancia_gps_metros, nombre_zona_snapshot, codigo_trazabilidad, campania:campania_id(id, nombre)',
      )
      .eq('id', subcampaniaId)
      .is('deleted_at', null)
      .single();

    if (subError || !subData) {
      throw new NotFoundException(
        `Subcampaña con id ${subcampaniaId} no encontrada`,
      );
    }
    const sub = subData as unknown as SubcampaniaRow;

    // 2. Usuario existe (404) y tiene rol global mínimo (403).
    const usuario = await this.authService.getUserByAuthId(authId);
    const rolGlobal = String(usuario.rol ?? '').toUpperCase();
    if (!ROLES_GLOBALES_OPERATIVOS.includes(rolGlobal)) {
      throw new ForbiddenException(
        'No tienes permisos para registrar plantaciones.',
      );
    }

    // 3. Pertenencia al equipo como COORDINADOR u OPERARIO (403).
    //    Aplica también a ADMIN: sin fila en SUBCAMPANIA_EQUIPO no registra.
    const { data: equipoData, error: equipoError } = await supabase
      .from('subcampania_equipo')
      .select(
        'usuario_id, rol, usuario!subcampania_equipo_usuario_fk(id, nombre)',
      )
      .eq('subcampania_id', subcampaniaId);

    if (equipoError) {
      this.logger.error('Error al leer equipo de subcampania:', equipoError);
      throw new InternalServerErrorException(
        'Error al leer el equipo de la subcampaña.',
      );
    }

    const equipoRows = (equipoData ?? []) as unknown as EquipoRow[];
    const miembro = equipoRows.find(
      (m) => Number(m.usuario_id) === Number(usuario.id),
    );
    const rolesOperativos = [
      RolEnSubcampania.COORDINADOR as string,
      RolEnSubcampania.OPERARIO as string,
    ];
    if (!miembro || !rolesOperativos.includes(String(miembro.rol))) {
      throw new ForbiddenException(
        `El usuario no pertenece al equipo (COORDINADOR|OPERARIO) de la subcampaña ${subcampaniaId}.`,
      );
    }

    // 4. La subcampaña debe estar ACTIVA para permitir registro (409).
    if (sub.estado !== (EstadoSubcampania.ACTIVA as string)) {
      throw new ConflictException(
        `La subcampaña no está ACTIVA (estado actual: ${sub.estado}). No se puede registrar plantación.`,
      );
    }

    // 5. Datos operativos en paralelo.
    const [poligonoResult, planResult, asignacionesResult, registrosResult] =
      await Promise.all([
        supabase.rpc('fn_subcampania_poligono_geojson', {
          p_id: subcampaniaId,
        }),
        supabase
          .from('subcampania_meta_especie')
          .select(
            'planta_id, cantidad_objetivo, planta:planta_id(id, especie, nombre_cientifico, nombre_comun_principal)',
          )
          .eq('subcampania_id', subcampaniaId)
          .order('planta_id', { ascending: true }),
        // Solo asignaciones ACTIVA con proposito PLANTACION_INICIAL, en el
        // orden de consumo del contrato: fecha_asignacion ASC, asignacion_id ASC.
        supabase
          .from('asignacion_vivero_subcampania')
          .select(
            'id, lote_vivero_id, cantidad_asignada, cantidad_consumida, cantidad_devuelta, cantidad_mermada, saldo_asignado_disponible, fecha_asignacion, lote:lote_vivero_id(id, codigo_trazabilidad, planta_id, vivero:vivero_id(id, nombre), planta:planta_id(id, especie, nombre_cientifico, nombre_comun_principal))',
          )
          .eq('subcampania_id', subcampaniaId)
          .eq('proposito', 'PLANTACION_INICIAL')
          .eq('estado', 'ACTIVA')
          .order('fecha_asignacion', { ascending: true })
          .order('id', { ascending: true }),
        supabase
          .from('registro_plantacion')
          .select('id')
          .eq('subcampania_id', subcampaniaId)
          .eq('es_reposicion', false),
      ]);

    if (planResult.error) {
      this.logger.error('Error al leer plan por especie:', planResult.error);
      throw new InternalServerErrorException(
        'Error al leer el plan por especie.',
      );
    }
    if (asignacionesResult.error) {
      this.logger.error(
        'Error al leer asignaciones:',
        asignacionesResult.error,
      );
      throw new InternalServerErrorException(
        'Error al leer las asignaciones de la subcampaña.',
      );
    }
    if (registrosResult.error) {
      this.logger.error(
        'Error al leer registros de plantacion:',
        registrosResult.error,
      );
      throw new InternalServerErrorException(
        'Error al leer los registros de plantación.',
      );
    }

    const poligono: unknown = poligonoResult.data ?? null;
    const metas = (planResult.data ?? []) as unknown as MetaEspecieRow[];
    const asignaciones = (
      (asignacionesResult.data ?? []) as unknown as AsignacionRow[]
    ).filter((a) => Number(a.saldo_asignado_disponible) > 0);

    // 6. Plantado inicial acumulado por especie (mismo cálculo que la RPC 053:
    //    detalles de registros con es_reposicion = FALSE).
    const registroRows = (registrosResult.data ?? []) as { id: number }[];
    const registroIds = registroRows.map((r) => Number(r.id));
    const plantadoPorEspecie = new Map<number, number>();
    if (registroIds.length > 0) {
      const { data: detalles, error: detallesError } = await supabase
        .from('registro_plantacion_detalle')
        .select('planta_id, cantidad')
        .in('registro_plantacion_id', registroIds);

      if (detallesError) {
        this.logger.error(
          'Error al leer detalles de plantacion:',
          detallesError,
        );
        throw new InternalServerErrorException(
          'Error al calcular el avance por especie.',
        );
      }
      const detalleRows = (detalles ?? []) as {
        planta_id: number;
        cantidad: number;
      }[];
      for (const d of detalleRows) {
        const plantaId = Number(d.planta_id);
        plantadoPorEspecie.set(
          plantaId,
          (plantadoPorEspecie.get(plantaId) ?? 0) + Number(d.cantidad),
        );
      }
    }

    // 7. Pre-condiciones operativas (422).
    const motivos: string[] = [];
    if (metas.length === 0) {
      motivos.push('no tiene plan por especie (SUBCAMPANIA_META_ESPECIE)');
    }
    if (!poligono) {
      motivos.push('no tiene un polígono evaluable');
    }
    if (asignaciones.length === 0) {
      motivos.push(
        'no tiene stock asignado disponible (asignaciones ACTIVA con propósito PLANTACION_INICIAL)',
      );
    }
    if (motivos.length > 0) {
      throw new UnprocessableEntityException(
        `La subcampaña no está lista para registrar plantación: ${motivos.join('; ')}.`,
      );
    }

    // 8. Armar respuesta.
    const campania = this.unwrap(sub.campania);
    const zonaNombre =
      sub.nombre_zona_snapshot ?? (await this.buscarZonaNombre(sub.zona_id));

    const equipo = equipoRows.map((m) => {
      const u = this.unwrap(m.usuario);
      return {
        usuario_id: Number(m.usuario_id),
        nombre_usuario: u?.nombre ?? null,
        rol: m.rol,
      };
    });

    const planPorEspecie = metas.map((meta) => {
      const planta = this.unwrap(meta.planta);
      const objetivo = Number(meta.cantidad_objetivo);
      const plantado = plantadoPorEspecie.get(Number(meta.planta_id)) ?? 0;
      return {
        planta_id: Number(meta.planta_id),
        nombre_comun_principal:
          planta?.nombre_comun_principal ?? planta?.especie ?? null,
        nombre_cientifico: planta?.nombre_cientifico ?? null,
        cantidad_objetivo: objetivo,
        plantado_inicial: plantado,
        pendiente_meta: Math.max(0, objetivo - plantado),
      };
    });

    const stockPorEspecie = this.agruparStockPorEspecie(asignaciones);

    return {
      success: true,
      data: {
        subcampania: {
          id: Number(sub.id),
          codigo_trazabilidad: sub.codigo_trazabilidad,
          nombre: sub.nombre,
          estado: sub.estado,
          fase_mantenimiento: sub.fase_mantenimiento,
          campania_id: Number(sub.campania_id),
          campania_nombre: campania?.nombre ?? null,
          zona_id: Number(sub.zona_id),
          zona_nombre: zonaNombre,
          meta_total_arboles: Number(sub.meta_total_arboles),
          total_plantado_inicial: Number(sub.total_plantado_inicial),
          tolerancia_gps_metros: Number(sub.tolerancia_gps_metros),
          poligono,
        },
        usuario: {
          id: Number(usuario.id),
          nombre: usuario.nombre,
          rol_global: rolGlobal,
          rol_en_subcampania: String(miembro.rol),
          // Todas las condiciones bloqueantes se responden como 403/409/422;
          // si llegamos aquí el usuario puede registrar.
          puede_registrar: true,
          motivo_bloqueo: null as string | null,
        },
        equipo,
        plan_por_especie: planPorEspecie,
        stock_por_especie: stockPorEspecie,
        reglas: { ...REGLAS_PLANTACION_INICIAL },
      },
    };
  }

  /**
   * Agrupa asignaciones (ya ordenadas fecha_asignacion ASC, id ASC) por la
   * especie del lote. orden_consumo es 1-based dentro de cada especie: el
   * frontend consume automáticamente en ese orden, sin preguntar al operario.
   */
  private agruparStockPorEspecie(asignaciones: AsignacionRow[]) {
    type Grupo = {
      planta_id: number;
      nombre_comun_principal: string | null;
      nombre_cientifico: string | null;
      stock_asignado_disponible: number;
      asignaciones: Array<Record<string, unknown>>;
    };

    const grupos = new Map<number, Grupo>();

    for (const a of asignaciones) {
      const lote = this.unwrap(a.lote);
      const planta = lote ? this.unwrap(lote.planta) : null;
      const vivero = lote ? this.unwrap(lote.vivero) : null;
      const plantaId = Number(lote?.planta_id ?? planta?.id ?? 0);

      if (!grupos.has(plantaId)) {
        grupos.set(plantaId, {
          planta_id: plantaId,
          nombre_comun_principal:
            planta?.nombre_comun_principal ?? planta?.especie ?? null,
          nombre_cientifico: planta?.nombre_cientifico ?? null,
          stock_asignado_disponible: 0,
          asignaciones: [],
        });
      }

      const grupo = grupos.get(plantaId)!;
      const saldo = Number(a.saldo_asignado_disponible);
      grupo.stock_asignado_disponible += saldo;
      grupo.asignaciones.push({
        asignacion_id: Number(a.id),
        lote_vivero_id: Number(a.lote_vivero_id),
        codigo_lote: lote?.codigo_trazabilidad ?? null,
        vivero_nombre: vivero?.nombre ?? null,
        fecha_asignacion: this.soloFecha(a.fecha_asignacion),
        cantidad_asignada: Number(a.cantidad_asignada),
        cantidad_consumida: Number(a.cantidad_consumida),
        cantidad_devuelta: Number(a.cantidad_devuelta),
        cantidad_mermada: Number(a.cantidad_mermada),
        saldo_asignado_disponible: saldo,
        orden_consumo: grupo.asignaciones.length + 1,
      });
    }

    return Array.from(grupos.values());
  }

  private async buscarZonaNombre(zonaId: number): Promise<string | null> {
    const resultado = (await this.supabaseService
      .getClient()
      .from('division_administrativa')
      .select('id, nombre')
      .eq('id', zonaId)
      .maybeSingle()) as { data: { nombre?: string } | null };
    return resultado.data?.nombre ?? null;
  }

  private soloFecha(valor: string | null | undefined): string | null {
    if (!valor) return null;
    return String(valor).slice(0, 10);
  }

  private unwrap<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
}
