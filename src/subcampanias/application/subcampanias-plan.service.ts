import {
  BadRequestException,
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

type SubcampaniaLite = {
  id: number;
  estado: EstadoSubcampania;
  meta_total_arboles: number | null;
};

type MetaEspecieRow = {
  planta_id: number;
  porcentaje_objetivo: number;
  cantidad_objetivo: number;
};

@Injectable()
export class SubcampaniasPlanService {
  private readonly logger = new Logger(SubcampaniasPlanService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async obtener(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data: sub, error: subError } = await supabase
      .from('subcampania')
      .select('id, estado, meta_total_arboles')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (subError || !sub) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }

    const { data: metas, error } = await supabase
      .from('subcampania_meta_especie')
      .select(
        'planta_id, porcentaje_objetivo, cantidad_objetivo, planta:planta_id(id, especie, nombre_cientifico)',
      )
      .eq('subcampania_id', id)
      .order('planta_id', { ascending: true });

    if (error) {
      this.logger.error('Error al listar plan de metas:', error);
      throw new InternalServerErrorException(
        'Error al leer el plan de metas por especie.',
      );
    }

    return {
      success: true,
      data: {
        subcampania_id: Number((sub as SubcampaniaLite).id),
        estado: (sub as SubcampaniaLite).estado,
        meta_total_arboles: Number(
          (sub as SubcampaniaLite).meta_total_arboles ?? 0,
        ),
        metas: metas ?? [],
      },
    };
  }

  async guardar(id: number, dto: GuardarPlanDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: sub, error: subError } = await supabase
      .from('subcampania')
      .select('id, estado, meta_total_arboles')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (subError || !sub) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }
    const subcampania = sub as SubcampaniaLite;
    if (subcampania.estado !== EstadoSubcampania.BORRADOR) {
      throw new UnprocessableEntityException(
        `El plan solo se puede editar en estado BORRADOR (estado actual: ${subcampania.estado}).`,
      );
    }

    this.validarPlan(dto.metas);

    // Reemplazo bulk: borrar plan previo y reinsertar.
    const { error: deleteError } = await supabase
      .from('subcampania_meta_especie')
      .delete()
      .eq('subcampania_id', id);

    if (deleteError) {
      this.logger.error('Error al limpiar plan previo:', deleteError);
      throw new InternalServerErrorException(
        'Error al reemplazar el plan de metas.',
      );
    }

    const rows = dto.metas.map((m) => ({
      subcampania_id: id,
      planta_id: m.planta_id,
      porcentaje_objetivo: m.porcentaje_objetivo,
      cantidad_objetivo: m.cantidad_objetivo,
      created_by: usuario.id,
      updated_by: usuario.id,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('subcampania_meta_especie')
      .insert(rows)
      .select('planta_id, porcentaje_objetivo, cantidad_objetivo');

    if (insertError) {
      this.logger.error('Error al insertar plan de metas:', insertError);
      if (insertError.code === '23505') {
        throw new UnprocessableEntityException(
          'Cada planta_id solo puede aparecer una vez en el plan.',
        );
      }
      if (insertError.code === '23503') {
        throw new BadRequestException(
          'Alguna planta_id no existe en el catálogo.',
        );
      }
      throw new BadRequestException(
        insertError.message || 'No se pudo guardar el plan.',
      );
    }

    return {
      success: true,
      data: {
        message: 'Plan de metas guardado correctamente.',
        subcampania_id: id,
        metas: (inserted ?? []) as MetaEspecieRow[],
      },
    };
  }

  private validarPlan(metas: GuardarPlanDto['metas']): void {
    const plantaIds = new Set<number>();
    for (const m of metas) {
      if (plantaIds.has(m.planta_id)) {
        throw new UnprocessableEntityException(
          `planta_id ${m.planta_id} aparece más de una vez en el plan.`,
        );
      }
      plantaIds.add(m.planta_id);
    }
  }
}
