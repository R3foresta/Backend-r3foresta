import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateFlexDivisionDto } from './dto/create-flex-division.dto';

type DivisionRow = {
  id: number;
  pais_id: number;
  parent_id: number | null;
  tipo_id: number;
  nombre: string;
};

type DivisionTipoRow = {
  id: number;
  nombre: string;
  orden: number;
};

@Injectable()
export class UbicacionesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findPaises() {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('pais')
      .select('id, nombre, codigo_iso2')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('❌ Error al obtener países:', error);
      throw new InternalServerErrorException('Error al obtener países');
    }

    return {
      success: true,
      data: data || [],
    };
  }

  async findDivisiones(paisId: number, parentId?: number) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('division_administrativa')
      .select('id, pais_id, parent_id, tipo_id, nombre')
      .eq('pais_id', paisId);

    if (parentId === undefined) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', parentId);
    }

    const { data, error } = await query.order('nombre', { ascending: true });

    if (error) {
      console.error('❌ Error al obtener divisiones administrativas:', error);
      throw new InternalServerErrorException(
        'Error al obtener divisiones administrativas',
      );
    }

    const divisiones = (data || []) as DivisionRow[];
    const tipoIds = [...new Set(divisiones.map((row) => row.tipo_id))];

    const tipoMap = new Map<number, DivisionTipoRow>();

    if (tipoIds.length > 0) {
      const { data: tipoData, error: tipoError } = await supabase
        .from('division_tipo')
        .select('id, nombre, orden')
        .in('id', tipoIds);

      if (tipoError) {
        console.error('❌ Error al obtener tipos de división:', tipoError);
        throw new InternalServerErrorException(
          'Error al obtener tipos de división',
        );
      }

      for (const tipo of tipoData || []) {
        tipoMap.set(Number(tipo.id), {
          id: Number(tipo.id),
          nombre: String(tipo.nombre),
          orden: Number(tipo.orden),
        });
      }
    }

    const mapped = divisiones
      .map((row) => {
        const tipo = tipoMap.get(Number(row.tipo_id));
        return {
          id: Number(row.id),
          pais_id: Number(row.pais_id),
          parent_id: row.parent_id === null ? null : Number(row.parent_id),
          tipo_id: Number(row.tipo_id),
          tipo_nombre: tipo?.nombre || null,
          tipo_orden: tipo?.orden ?? null,
          nombre: row.nombre,
        };
      })
      .sort((a, b) => {
        const orderA = a.tipo_orden ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.tipo_orden ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.nombre.localeCompare(b.nombre, 'es');
      });

    return {
      success: true,
      data: mapped,
    };
  }

  async ensureFlexibleDivision(dto: CreateFlexDivisionDto) {
    const supabase = this.supabaseService.getClient();
    const nombreNormalizado = dto.nombre.trim();

    if (!nombreNormalizado) {
      throw new BadRequestException('nombre es requerido');
    }

    const { data: parentData, error: parentError } = await supabase
      .from('division_administrativa')
      .select('id, pais_id, tipo_id, nombre')
      .eq('id', dto.parent_id)
      .single();

    if (parentError || !parentData) {
      throw new NotFoundException('División padre no encontrada');
    }

    const parentPaisId = Number(parentData.pais_id);
    if (parentPaisId !== dto.pais_id) {
      throw new BadRequestException(
        'parent_id no pertenece al pais_id enviado',
      );
    }

    const { data: siblingData, error: siblingError } = await supabase
      .from('division_administrativa')
      .select('id, pais_id, parent_id, tipo_id, nombre')
      .eq('pais_id', dto.pais_id)
      .eq('parent_id', dto.parent_id)
      .order('nombre', { ascending: true });

    if (siblingError) {
      console.error('❌ Error buscando divisiones hermanas:', siblingError);
      throw new InternalServerErrorException(
        'Error al validar división administrativa',
      );
    }

    const existingDivision = (siblingData || []).find(
      (item: { nombre: string }) =>
        item.nombre.trim().toLocaleLowerCase('es') ===
        nombreNormalizado.toLocaleLowerCase('es'),
    );

    if (existingDivision) {
      return {
        success: true,
        data: {
          id: Number(existingDivision.id),
          pais_id: Number(existingDivision.pais_id),
          parent_id:
            existingDivision.parent_id === null
              ? null
              : Number(existingDivision.parent_id),
          tipo_id: Number(existingDivision.tipo_id),
          nombre: existingDivision.nombre,
        },
        created: false,
      };
    }

    const { data: parentTipo, error: parentTipoError } = await supabase
      .from('division_tipo')
      .select('id, orden')
      .eq('id', Number(parentData.tipo_id))
      .single();

    if (parentTipoError || !parentTipo) {
      throw new NotFoundException('Tipo de división padre no encontrado');
    }

    const targetOrden = Number(parentTipo.orden) + 1;

    const { data: tiposByOrden, error: tiposByOrdenError } = await supabase
      .from('division_tipo')
      .select('id, nombre, orden')
      .eq('pais_id', dto.pais_id)
      .eq('orden', targetOrden)
      .order('id', { ascending: true });

    if (tiposByOrdenError) {
      console.error('❌ Error al obtener tipo flexible:', tiposByOrdenError);
      throw new InternalServerErrorException('Error al obtener tipo de división');
    }

    const flexibleNames = new Set([
      'comunidad',
      'localidad',
      'zona',
      'localidad/comunidad',
    ]);

    let tipoFlexibleId =
      (tiposByOrden || []).find((tipo) =>
        flexibleNames.has(String(tipo.nombre).trim().toLocaleLowerCase('es')),
      )?.id ?? null;

    if (!tipoFlexibleId) {
      const { data: tipoCreado, error: tipoCreadoError } = await supabase
        .from('division_tipo')
        .insert({
          pais_id: dto.pais_id,
          nombre: 'Localidad/Comunidad',
          orden: targetOrden,
        })
        .select('id')
        .single();

      if (tipoCreadoError || !tipoCreado) {
        console.error('❌ Error al crear tipo flexible:', tipoCreadoError);
        throw new InternalServerErrorException(
          'Error al crear tipo de división flexible',
        );
      }

      tipoFlexibleId = Number(tipoCreado.id);
    }

    const { data: divisionCreada, error: divisionCreadaError } = await supabase
      .from('division_administrativa')
      .insert({
        pais_id: dto.pais_id,
        parent_id: dto.parent_id,
        tipo_id: tipoFlexibleId,
        nombre: nombreNormalizado,
      })
      .select('id, pais_id, parent_id, tipo_id, nombre')
      .single();

    if (divisionCreadaError || !divisionCreada) {
      console.error('❌ Error al crear división flexible:', divisionCreadaError);
      throw new InternalServerErrorException(
        'Error al crear división administrativa flexible',
      );
    }

    return {
      success: true,
      data: {
        id: Number(divisionCreada.id),
        pais_id: Number(divisionCreada.pais_id),
        parent_id:
          divisionCreada.parent_id === null ? null : Number(divisionCreada.parent_id),
        tipo_id: Number(divisionCreada.tipo_id),
        nombre: divisionCreada.nombre,
      },
      created: true,
    };
  }
}

