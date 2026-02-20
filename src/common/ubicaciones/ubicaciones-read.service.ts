import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../supabase/supabase.service';

export interface UbicacionRutaItem {
  tipo: string;
  nombre: string;
}

export interface UbicacionApiDto {
  id: number;
  nombre: string | null;
  referencia: string | null;
  coordenadas: {
    lat: number | null;
    lon: number | null;
    precision_m: number | null;
    fuente: string | null;
  };
  pais: {
    id: number | null;
    codigo_iso2: string | null;
    nombre: string | null;
  } | null;
  division: {
    id: number;
    ruta: UbicacionRutaItem[];
  } | null;
}

@Injectable()
export class UbicacionesReadService {
  private readonly logger = new Logger(UbicacionesReadService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async getUbicacionesByIds(ids: number[]): Promise<Map<number, UbicacionApiDto>> {
    const uniqueIds = [...new Set(ids)].filter(
      (id): id is number => Number.isInteger(id) && id > 0,
    );

    if (uniqueIds.length === 0) {
      return new Map<number, UbicacionApiDto>();
    }

    const viewName =
      this.configService.get<string>('UBICACION_VIEW_NAME') ||
      'v_ubicacion_enriquecida';

    const supabase = this.supabaseService.getClient();

    let query = await supabase.from(viewName).select('*').in('id', uniqueIds);

    if (query.error && this.isColumnMissingError(query.error)) {
      query = await supabase
        .from(viewName)
        .select('*')
        .in('ubicacion_id', uniqueIds);
    }

    if (query.error) {
      this.logger.error(
        `Error consultando vista de ubicación ${viewName}`,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        query.error.message,
      );

      if (this.isRelationMissingError(query.error)) {
        throw new InternalServerErrorException(
          `No existe la vista de ubicación configurada (${viewName}). Configura UBICACION_VIEW_NAME correctamente.`,
        );
      }

      throw new InternalServerErrorException(
        `No se pudo consultar la vista de ubicación (${viewName}). Verifica estructura y permisos.`,
      );
    }

    const rows = query.data || [];
    const result = new Map<number, UbicacionApiDto>();

    for (const row of rows) {
      const id = this.toNumber(row.id) ?? this.toNumber(row.ubicacion_id);
      if (!id) {
        continue;
      }

      const divisionId = this.toNumber(row.division_id);

      result.set(id, {
        id,
        nombre: this.toNullableString(row.nombre),
        referencia: this.toNullableString(row.referencia),
        coordenadas: {
          lat: this.toNumber(row.latitud),
          lon: this.toNumber(row.longitud),
          precision_m: this.toNumber(row.precision_m),
          fuente: this.toNullableString(row.fuente),
        },
        pais: this.buildPais(row),
        division:
          divisionId === null
            ? null
            : {
                id: divisionId,
                ruta: this.normalizeRuta(row.division_ruta),
              },
      });
    }

    return result;
  }

  private buildPais(row: Record<string, unknown>) {
    const id = this.toNumber(row.pais_id);
    const codigoIso2 = this.toNullableString(row.pais_codigo_iso2);
    const nombre = this.toNullableString(row.pais_nombre);

    if (id === null && codigoIso2 === null && nombre === null) {
      return null;
    }

    return {
      id,
      codigo_iso2: codigoIso2,
      nombre,
    };
  }

  private normalizeRuta(rawRuta: unknown): UbicacionRutaItem[] {
    if (rawRuta == null) {
      return [];
    }

    let parsedRuta: unknown = rawRuta;

    if (typeof rawRuta === 'string') {
      try {
        parsedRuta = JSON.parse(rawRuta);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(parsedRuta)) {
      return [];
    }

    return parsedRuta
      .map((item) => {
        const maybeItem = item as Record<string, unknown>;
        const tipo = this.toNullableString(maybeItem.tipo);
        const nombre = this.toNullableString(maybeItem.nombre);

        if (!tipo || !nombre) {
          return null;
        }

        return { tipo, nombre };
      })
      .filter((item): item is UbicacionRutaItem => item !== null);
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private isRelationMissingError(error: { code?: string; message?: string }): boolean {
    const message = (error.message || '').toLowerCase();

    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      message.includes('schema cache') ||
      message.includes('could not find the table')
    );
  }

  private isColumnMissingError(error: { code?: string; message?: string }): boolean {
    return error.code === '42703';
  }
}
