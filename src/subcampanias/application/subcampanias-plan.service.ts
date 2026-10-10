import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { GuardarPlanDto } from '../api/dto/guardar-plan.dto';
import { EstadoSubcampania } from '../domain/enums/estado-subcampania.enum';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

type PlanSnapshot = {
  subcampania_id: number;
  estado: EstadoSubcampania;
  meta_total_arboles: number;
  plan_revision: number;
  metas: GuardarPlanDto['metas'];
};

type RpcResult = {
  data: PlanSnapshot | null;
  error: { code?: string; message?: string } | null;
};

@Injectable()
export class SubcampaniasPlanService {
  private readonly logger = new Logger(SubcampaniasPlanService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async obtener(id: number, authId: string) {
    await this.authService.getAuthenticatedUser(authId);
    return { success: true, data: await this.leerSnapshot(id) };
  }

  private async leerSnapshot(id: number): Promise<PlanSnapshot> {
    // Una sola sentencia entrega meta, versión y especies del mismo snapshot.
    const result = (await this.supabaseService
      .getAdminClient()
      .rpc('fn_subcampania_obtener_plan', {
        p_subcampania_id: id,
      })) as unknown as RpcResult;
    if (!result.error && !result.data) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }
    return this.leerResultado(result);
  }

  async guardar(id: number, dto: GuardarPlanDto, authId: string) {
    const usuario = await this.authService.getAuthenticatedUser(authId);
    this.authService.assertAdmin(usuario.rol);
    this.validarPlan(dto);

    // El cliente BORRADOR histórico no envía versión. La fijamos al inicio
    // de su petición para que dos guardados solapados no se sobrescriban.
    // Los clientes nuevos deben enviar la versión que leyeron en el editor.
    let revisionEsperada = dto.revision_esperada;
    if (
      revisionEsperada === undefined &&
      dto.meta_total_arboles === undefined
    ) {
      const snapshot = await this.leerSnapshot(id);
      revisionEsperada = snapshot.plan_revision;
    }

    // Estado, versión y protecciones se comprueban dentro del bloqueo
    // compartido con asignación/plantación. El historial es parte del guardado.
    const result = (await this.supabaseService
      .getAdminClient()
      .rpc('fn_subcampania_revisar_plan', {
        p_subcampania_id: id,
        p_meta_total_arboles: dto.meta_total_arboles ?? null,
        p_metas: dto.metas,
        p_actor_user_id: usuario.id,
        p_revision_esperada: revisionEsperada ?? null,
      })) as unknown as RpcResult;
    return {
      success: true,
      data: {
        message: 'Plan de metas guardado correctamente.',
        ...this.leerResultado(result),
      },
    };
  }

  private leerResultado(result: RpcResult): PlanSnapshot {
    if (result.error) {
      const { code, message } = result.error;
      const detalle = message ?? 'No se pudo guardar o leer el plan.';
      switch (code) {
        case 'PT404':
          throw new NotFoundException(detalle);
        case 'PT403':
          throw new ForbiddenException(detalle);
        case 'PT409':
          throw new ConflictException(detalle);
        case 'PT422':
        case '23505':
        case '23514':
        case '22003':
          throw new UnprocessableEntityException(detalle);
        case '23503':
        case '22P02':
          throw new BadRequestException(detalle);
        default:
          this.logger.error(
            'Error en la operación atómica del plan:',
            result.error,
          );
          throw new InternalServerErrorException(
            code === 'PGRST202' || code === '42883'
              ? 'La migración de revisión atómica de planes no está aplicada.'
              : 'No se pudo completar la operación atómica del plan.',
          );
      }
    }
    if (!result.data) {
      throw new InternalServerErrorException(
        'La operación del plan no devolvió datos.',
      );
    }
    return result.data;
  }

  private validarPlan(dto: GuardarPlanDto): void {
    if (
      dto.meta_total_arboles !== undefined &&
      (!Number.isSafeInteger(dto.meta_total_arboles) ||
        dto.meta_total_arboles <= 0 ||
        dto.meta_total_arboles > 2147483647)
    ) {
      throw new UnprocessableEntityException(
        'meta_total_arboles debe ser un entero positivo.',
      );
    }
    if (
      dto.revision_esperada !== undefined &&
      (!Number.isSafeInteger(dto.revision_esperada) ||
        dto.revision_esperada < 0)
    ) {
      throw new UnprocessableEntityException(
        'revision_esperada debe ser un entero no negativo.',
      );
    }
    if (!Array.isArray(dto.metas) || dto.metas.length === 0) {
      throw new UnprocessableEntityException(
        'El plan requiere al menos una especie.',
      );
    }

    const plantaIds = new Set<number>();
    let cantidadTotal = 0;
    let porcentajeCentesimas = 0;
    for (const meta of dto.metas) {
      if (
        !meta ||
        !Number.isSafeInteger(meta.planta_id) ||
        meta.planta_id <= 0 ||
        !Number.isSafeInteger(meta.cantidad_objetivo) ||
        meta.cantidad_objetivo <= 0 ||
        meta.cantidad_objetivo > 2147483647 ||
        !Number.isFinite(meta.porcentaje_objetivo) ||
        meta.porcentaje_objetivo <= 0 ||
        meta.porcentaje_objetivo > 100 ||
        Math.abs(
          meta.porcentaje_objetivo * 100 -
            Math.round(meta.porcentaje_objetivo * 100),
        ) > 1e-8
      ) {
        throw new UnprocessableEntityException(
          'Cada especie requiere id y objetivo positivos y un porcentaje con hasta dos decimales entre 0 y 100.',
        );
      }
      if (plantaIds.has(meta.planta_id)) {
        throw new UnprocessableEntityException(
          'Cada planta_id solo puede aparecer una vez en el plan.',
        );
      }
      plantaIds.add(meta.planta_id);
      cantidadTotal += meta.cantidad_objetivo;
      porcentajeCentesimas += Math.round(meta.porcentaje_objetivo * 100);
    }
    if (porcentajeCentesimas !== 10000) {
      throw new UnprocessableEntityException(
        'Los porcentajes del plan deben sumar 100.',
      );
    }
    if (
      dto.meta_total_arboles !== undefined &&
      cantidadTotal !== dto.meta_total_arboles
    ) {
      throw new UnprocessableEntityException(
        'Las cantidades objetivo deben sumar meta_total_arboles.',
      );
    }
  }
}
