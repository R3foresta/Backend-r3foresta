import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateComunidadDto } from './dto/create-comunidad.dto';
import { ListComunidadesQueryDto } from './dto/list-comunidades-query.dto';
import { UpdateComunidadDto } from './dto/update-comunidad.dto';

type PaisRow = {
  id: number;
  nombre: string;
  codigo_iso2: string | null;
};

type DivisionTipoRow = {
  id: number;
  pais_id: number;
  nombre: string;
  orden: number;
};

type DivisionRow = {
  id: number;
  pais_id: number;
  parent_id: number | null;
  tipo_id: number;
  nombre: string;
  activo: boolean;
};

type NivelDto = {
  id: number;
  nombre: string;
};

type ComunidadCard = {
  id: number;
  nombre: string;
  pais: {
    id: number;
    nombre: string;
    codigo_iso2: string | null;
  };
  nivel1?: NivelDto;
  nivel2?: NivelDto;
  nivel3?: NivelDto;
  nivel4?: NivelDto;
  activo: boolean;
  nivel_actual: number;
};

@Injectable()
export class ComunidadesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listar(query: ListComunidadesQueryDto) {
    const supabase = this.supabaseService.getClient();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const incluirInactivas = query.incluir_inactivas ?? false;
    const search = this.normalizeSearch(query.q);

    const pais = await this.resolvePais(query.pais_id);
    const tipoComunidad = await this.getTipoPorOrden(pais.id, 4);

    let dbQuery = supabase
      .from('division_administrativa')
      .select('id, pais_id, parent_id, tipo_id, nombre, activo', {
        count: 'exact',
      })
      .eq('pais_id', pais.id)
      .eq('tipo_id', tipoComunidad.id);

    if (!incluirInactivas) {
      dbQuery = dbQuery.eq('activo', true);
    }

    if (search) {
      dbQuery = dbQuery.ilike('nombre', `%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await dbQuery
      .order('nombre', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('❌ Error al listar comunidades:', error);
      throw new InternalServerErrorException('Error al listar comunidades');
    }

    const comunidades = (data || []).map((row) => this.mapDivisionRow(row));
    const cards = await this.buildComunidadCards(comunidades, pais);

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: cards,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async obtenerPorId(id: number) {
    const comunidad = await this.getComunidadById(id);
    const pais = await this.getPaisById(comunidad.pais_id);
    const [card] = await this.buildComunidadCards([comunidad], pais);

    return {
      success: true,
      data: card || null,
    };
  }

  async crear(payload: CreateComunidadDto) {
    const supabase = this.supabaseService.getClient();
    const nombre = this.normalizeNombre(payload.nombre);
    const pais = await this.getPaisById(payload.pais_id);
    const tipoMunicipio = await this.getTipoPorOrden(pais.id, 3);
    const tipoComunidad = await this.getTipoPorOrden(pais.id, 4);

    const municipio = await this.getDivisionById(payload.municipio_id);
    this.assertMunicipioValido(municipio, pais.id, tipoMunicipio.id);

    await this.assertNoDuplicado(
      pais.id,
      tipoComunidad.id,
      payload.municipio_id,
      nombre,
    );

    const { data, error } = await supabase
      .from('division_administrativa')
      .insert({
        pais_id: pais.id,
        parent_id: payload.municipio_id,
        tipo_id: tipoComunidad.id,
        nombre,
        activo: payload.activo ?? true,
      })
      .select('id')
      .single();

    if (error || !data) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una comunidad con ese nombre en el municipio',
        );
      }
      console.error('❌ Error al crear comunidad:', error);
      throw new InternalServerErrorException('Error al crear comunidad');
    }

    return this.obtenerPorId(Number(data.id));
  }

  async actualizar(id: number, payload: UpdateComunidadDto) {
    const supabase = this.supabaseService.getClient();
    const comunidadActual = await this.getComunidadById(id);
    const pais = await this.getPaisById(comunidadActual.pais_id);
    const tipoMunicipio = await this.getTipoPorOrden(pais.id, 3);
    const tipoComunidad = await this.getTipoPorOrden(pais.id, 4);

    const nuevoNombre =
      payload.nombre === undefined
        ? comunidadActual.nombre
        : this.normalizeNombre(payload.nombre);

    const nuevoMunicipioId = payload.municipio_id ?? comunidadActual.parent_id;

    if (!nuevoMunicipioId) {
      throw new BadRequestException(
        'La comunidad no tiene municipio padre válido',
      );
    }

    const municipio = await this.getDivisionById(nuevoMunicipioId);
    this.assertMunicipioValido(municipio, pais.id, tipoMunicipio.id);

    await this.assertNoDuplicado(
      pais.id,
      tipoComunidad.id,
      nuevoMunicipioId,
      nuevoNombre,
      id,
    );

    const nuevoActivo =
      payload.activo === undefined ? comunidadActual.activo : payload.activo;

    const updatePayload: Record<string, unknown> = {};

    if (nuevoNombre !== comunidadActual.nombre) {
      updatePayload.nombre = nuevoNombre;
    }
    if (nuevoMunicipioId !== comunidadActual.parent_id) {
      updatePayload.parent_id = nuevoMunicipioId;
    }
    if (nuevoActivo !== comunidadActual.activo) {
      updatePayload.activo = nuevoActivo;
    }

    if (Object.keys(updatePayload).length === 0) {
      return this.obtenerPorId(id);
    }

    const { error } = await supabase
      .from('division_administrativa')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una comunidad con ese nombre en el municipio',
        );
      }
      console.error('❌ Error al actualizar comunidad:', error);
      throw new InternalServerErrorException('Error al actualizar comunidad');
    }

    return this.obtenerPorId(id);
  }

  async desactivar(id: number) {
    const supabase = this.supabaseService.getClient();
    const comunidad = await this.getComunidadById(id);

    if (!comunidad.activo) {
      return this.obtenerPorId(id);
    }

    const { error } = await supabase
      .from('division_administrativa')
      .update({ activo: false })
      .eq('id', id);

    if (error) {
      console.error('❌ Error al desactivar comunidad:', error);
      throw new InternalServerErrorException('Error al desactivar comunidad');
    }

    return this.obtenerPorId(id);
  }

  private async getComunidadById(id: number): Promise<DivisionRow> {
    const row = await this.getDivisionById(id);
    const tipoComunidad = await this.getTipoPorOrden(row.pais_id, 4);

    if (row.tipo_id !== tipoComunidad.id) {
      throw new NotFoundException('Comunidad no encontrada');
    }

    return row;
  }

  private async getDivisionById(id: number): Promise<DivisionRow> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('division_administrativa')
      .select('id, pais_id, parent_id, tipo_id, nombre, activo')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('División administrativa no encontrada');
    }

    return this.mapDivisionRow(data);
  }

  private async getDivisionesByIds(ids: number[]): Promise<Map<number, DivisionRow>> {
    const validIds = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
    const map = new Map<number, DivisionRow>();

    if (validIds.length === 0) {
      return map;
    }

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('division_administrativa')
      .select('id, pais_id, parent_id, tipo_id, nombre, activo')
      .in('id', validIds);

    if (error) {
      console.error('❌ Error al resolver ruta de comunidades:', error);
      throw new InternalServerErrorException(
        'Error al resolver ruta administrativa',
      );
    }

    for (const row of data || []) {
      const mapped = this.mapDivisionRow(row);
      map.set(mapped.id, mapped);
    }

    return map;
  }

  private async getTipoPorOrden(
    paisId: number,
    orden: number,
  ): Promise<DivisionTipoRow> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('division_tipo')
      .select('id, pais_id, nombre, orden')
      .eq('pais_id', paisId)
      .eq('orden', orden)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `No existe configuración de división para nivel ${orden} en el país`,
      );
    }

    return {
      id: Number(data.id),
      pais_id: Number(data.pais_id),
      nombre: String(data.nombre),
      orden: Number(data.orden),
    };
  }

  private async getPaisById(id: number): Promise<PaisRow> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('pais')
      .select('id, nombre, codigo_iso2')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('País no encontrado');
    }

    return {
      id: Number(data.id),
      nombre: String(data.nombre),
      codigo_iso2: data.codigo_iso2 ? String(data.codigo_iso2) : null,
    };
  }

  private async resolvePais(rawPais: string): Promise<PaisRow> {
    const value = String(rawPais || '').trim();
    if (!value) {
      throw new BadRequestException('pais_id es requerido');
    }

    const numericPaisId = Number(value);
    if (Number.isInteger(numericPaisId) && numericPaisId > 0) {
      return this.getPaisById(numericPaisId);
    }

    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('pais')
      .select('id, nombre, codigo_iso2')
      .eq('codigo_iso2', value.toUpperCase())
      .single();

    if (error || !data) {
      throw new NotFoundException('País no encontrado');
    }

    return {
      id: Number(data.id),
      nombre: String(data.nombre),
      codigo_iso2: data.codigo_iso2 ? String(data.codigo_iso2) : null,
    };
  }

  private async assertNoDuplicado(
    paisId: number,
    tipoId: number,
    municipioId: number,
    nombre: string,
    excludeId?: number,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('division_administrativa')
      .select('id, nombre')
      .eq('pais_id', paisId)
      .eq('tipo_id', tipoId)
      .eq('parent_id', municipioId);

    if (error) {
      console.error('❌ Error al validar duplicados de comunidad:', error);
      throw new InternalServerErrorException('Error al validar comunidad');
    }

    const duplicate = (data || []).find((row) => {
      const rowId = Number(row.id);
      if (excludeId && rowId === excludeId) {
        return false;
      }

      const rowNombre = String(row.nombre || '')
        .trim()
        .toLocaleLowerCase('es');

      return rowNombre === nombre.toLocaleLowerCase('es');
    });

    if (duplicate) {
      throw new ConflictException(
        'Ya existe una comunidad con ese nombre en el municipio',
      );
    }
  }

  private assertMunicipioValido(
    municipio: DivisionRow,
    paisId: number,
    tipoMunicipioId: number,
  ) {
    if (municipio.pais_id !== paisId) {
      throw new BadRequestException(
        'municipio_id no pertenece al pais_id enviado',
      );
    }

    if (municipio.tipo_id !== tipoMunicipioId) {
      throw new BadRequestException('municipio_id no corresponde a nivel 3');
    }
  }

  private async buildComunidadCards(
    comunidades: DivisionRow[],
    pais: PaisRow,
  ): Promise<ComunidadCard[]> {
    if (comunidades.length === 0) {
      return [];
    }

    const nivel3Ids = comunidades
      .map((item) => item.parent_id)
      .filter((value): value is number => value !== null);
    const nivel3Map = await this.getDivisionesByIds(nivel3Ids);

    const nivel2Ids = [...nivel3Map.values()]
      .map((item) => item.parent_id)
      .filter((value): value is number => value !== null);
    const nivel2Map = await this.getDivisionesByIds(nivel2Ids);

    const nivel1Ids = [...nivel2Map.values()]
      .map((item) => item.parent_id)
      .filter((value): value is number => value !== null);
    const nivel1Map = await this.getDivisionesByIds(nivel1Ids);

    return comunidades.map((comunidad) => {
      const nivel3 =
        comunidad.parent_id === null ? undefined : nivel3Map.get(comunidad.parent_id);
      const nivel2 =
        nivel3?.parent_id === null || nivel3?.parent_id === undefined
          ? undefined
          : nivel2Map.get(nivel3.parent_id);
      const nivel1 =
        nivel2?.parent_id === null || nivel2?.parent_id === undefined
          ? undefined
          : nivel1Map.get(nivel2.parent_id);

      return {
        id: comunidad.id,
        nombre: comunidad.nombre,
        pais: {
          id: pais.id,
          nombre: pais.nombre,
          codigo_iso2: pais.codigo_iso2,
        },
        nivel1: nivel1 ? { id: nivel1.id, nombre: nivel1.nombre } : undefined,
        nivel2: nivel2 ? { id: nivel2.id, nombre: nivel2.nombre } : undefined,
        nivel3: nivel3 ? { id: nivel3.id, nombre: nivel3.nombre } : undefined,
        nivel4: { id: comunidad.id, nombre: comunidad.nombre },
        activo: comunidad.activo,
        nivel_actual: 4,
      };
    });
  }

  private normalizeNombre(nombre: string): string {
    const nombreNormalizado = String(nombre || '').trim();

    if (!nombreNormalizado) {
      throw new BadRequestException('nombre es requerido');
    }

    return nombreNormalizado;
  }

  private normalizeSearch(search?: string): string | undefined {
    if (!search) {
      return undefined;
    }

    const normalized = search.trim();
    return normalized.length === 0 ? undefined : normalized;
  }

  private mapDivisionRow(row: Record<string, unknown>): DivisionRow {
    return {
      id: Number(row.id),
      pais_id: Number(row.pais_id),
      parent_id: row.parent_id === null ? null : Number(row.parent_id),
      tipo_id: Number(row.tipo_id),
      nombre: String(row.nombre),
      activo: row.activo === false ? false : true,
    };
  }

  private isUniqueViolation(error: { code?: string } | null): boolean {
    return error?.code === '23505';
  }
}
