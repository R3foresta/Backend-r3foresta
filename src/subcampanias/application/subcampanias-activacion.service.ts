import {
  BadRequestException,
  Injectable,
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

@Injectable()
export class SubcampaniasActivacionService {
  private readonly logger = new Logger(SubcampaniasActivacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: SubcampaniasAuthService,
  ) {}

  async activar(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data: actual, error: fetchError } = await supabase
      .from('subcampania')
      .select(
        'id, campania_id, estado, meta_total_arboles, poligono_geom, zona_id',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !actual) {
      throw new NotFoundException(`Subcampaña con id ${id} no encontrada`);
    }

    const estadoActual = (actual as any).estado as EstadoSubcampania;

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

    const tienePoligono = (actual as any).poligono_geom !== null;

    const { data: coordinadorRow } = await supabase
      .from('subcampania_equipo')
      .select('usuario_id, usuario!subcampania_equipo_usuario_fk(id, nombre)')
      .eq('subcampania_id', id)
      .eq('rol', 'COORDINADOR')
      .maybeSingle();

    const tieneCoordinador = !!coordinadorRow;

    try {
      ActivacionPolicy.assertPuedeActivar({
        estadoActual,
        tienePoligono,
        tieneCoordinador,
        metaTotal: Number((actual as any).meta_total_arboles ?? 0),
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
      .eq('id', (actual as any).zona_id)
      .single();

    const nombreZona = (zona as any)?.nombre ?? null;
    const nombreCoordinador =
      (coordinadorRow as any)?.usuario?.nombre ?? null;

    const { data: orgs } = await supabase
      .from('campania_organizacion')
      .select('organizacion(nombre)')
      .eq('campania_id', (actual as any).campania_id);

    const nombresOrganizaciones = (orgs ?? [])
      .map((o: any) => o.organizacion?.nombre)
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

    return {
      success: true,
      data: {
        message: 'Subcampaña activada correctamente.',
        ...(updated as any),
      },
    };
  }
}
