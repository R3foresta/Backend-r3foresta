import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  GeoJsonPolygonDto,
  SetearPoligonoDto,
} from '../api/dto/setear-poligono.dto';
import { SubcampaniasAuthService } from './subcampanias-auth.service';

@Injectable()
export class SubcampaniasPoligonoService {
  private readonly logger = new Logger(SubcampaniasPoligonoService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async setear(id: number, dto: SetearPoligonoDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    this.validarGeoJson(dto.poligono);

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.rpc(
      'fn_subcampania_setear_poligono',
      {
        p_id: id,
        p_geojson: dto.poligono as any,
        p_updated_by: usuario.id,
      },
    );

    if (error) {
      this.logger.error('Error al setear poligono:', error);
      const msg = (error as any).message ?? '';
      if (
        (error as any).code === 'P0002' ||
        msg.includes('no existe')
      ) {
        throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
      }
      if (
        (error as any).code === 'P0001' ||
        msg.includes('BORRADOR')
      ) {
        throw new UnprocessableEntityException(
          'Solo se puede setear el polígono en estado BORRADOR.',
        );
      }
      throw new BadRequestException(msg || 'No se pudo setear el polígono.');
    }

    return {
      success: true,
      data: data ?? { id, message: 'Polígono actualizado correctamente.' },
    };
  }

  private validarGeoJson(poligono: GeoJsonPolygonDto): void {
    if (!poligono || poligono.type !== 'Polygon') {
      throw new BadRequestException(
        'poligono.type debe ser "Polygon" (GeoJSON).',
      );
    }

    const rings = poligono.coordinates;
    if (!Array.isArray(rings) || rings.length === 0) {
      throw new BadRequestException(
        'poligono.coordinates debe ser un arreglo no vacío de anillos.',
      );
    }

    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new BadRequestException(
          'Cada anillo del polígono debe tener al menos 4 puntos.',
        );
      }

      for (const punto of ring) {
        if (
          !Array.isArray(punto) ||
          punto.length < 2 ||
          typeof punto[0] !== 'number' ||
          typeof punto[1] !== 'number'
        ) {
          throw new BadRequestException(
            'Cada punto debe ser [lng, lat] con coordenadas numéricas.',
          );
        }
      }

      const primero = ring[0];
      const ultimo = ring[ring.length - 1];
      if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
        throw new BadRequestException(
          'El primer y último punto de cada anillo deben coincidir (anillo cerrado).',
        );
      }
    }
  }
}
