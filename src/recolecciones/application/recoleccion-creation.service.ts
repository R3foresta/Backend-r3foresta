import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateRecoleccionDto } from '../api/dto/create-recoleccion.dto';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';
import { CantidadUnidadPolicy } from '../domain/policies/cantidad-unidad.policy';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';
import type { RecoleccionFotoInput } from '../domain/policies/evidencia-completitud.policy';
import { RecoleccionAuthService } from './recoleccion-auth.service';
import { RecoleccionCodigosService } from './recoleccion-codigos.service';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';
import {
  RecoleccionEvidenciasService,
  type FotoSubidaRecoleccion,
} from './recoleccion-evidencias.service';
import {
  RecoleccionHistorialService,
  TipoHistorialRecoleccion,
} from './recoleccion-historial.service';
import { RecoleccionSnapshotsService } from './recoleccion-snapshots.service';
import { RecoleccionUbicacionService } from './recoleccion-ubicacion.service';

@Injectable()
export class RecoleccionCreationService {
  private readonly logger = new Logger(RecoleccionCreationService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
    private readonly codigosService: RecoleccionCodigosService,
    private readonly consultasService: RecoleccionConsultasService,
    private readonly evidenciasService: RecoleccionEvidenciasService,
    private readonly historialService: RecoleccionHistorialService,
    private readonly snapshotsService: RecoleccionSnapshotsService,
    private readonly ubicacionService: RecoleccionUbicacionService,
  ) {}

  async create(
    createRecoleccionDto: CreateRecoleccionDto,
    authId: string,
    userRole?: string,
    files: RecoleccionFotoInput[] = [],
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanCreate(usuario.rol);

    const fechaRecoleccion =
      FechaRecoleccionPolicy.assertFechaRecoleccionPermitida(
        createRecoleccionDto.fecha,
      );

    if (createRecoleccionDto.vivero_id) {
      const { data: vivero, error: viveroError } = await supabase
        .from('vivero')
        .select('id')
        .eq('id', createRecoleccionDto.vivero_id)
        .single();

      if (viveroError || !vivero) {
        throw new NotFoundException('Vivero no encontrado');
      }
    }

    const { data: metodo, error: metodoError } = await supabase
      .from('metodo_recoleccion')
      .select('id')
      .eq('id', createRecoleccionDto.metodo_id)
      .single();

    if (metodoError || !metodo) {
      throw new NotFoundException('Método de recolección no encontrado');
    }

    const { data: planta, error: plantaError } = await supabase
      .from('planta')
      .select('id')
      .eq('id', createRecoleccionDto.planta_id)
      .single();

    if (plantaError || !planta) {
      throw new NotFoundException('Planta no encontrada');
    }

    this.evidenciasService.validarFotosCreacion(files || []);
    const tipoMaterialCanonico = CantidadUnidadPolicy.normalizarTipoMaterial(
      createRecoleccionDto.tipo_material,
    );
    const canonicalInput = CantidadUnidadPolicy.normalizarYValidar(
      createRecoleccionDto.cantidad_inicial_canonica,
      createRecoleccionDto.unidad_canonica,
      tipoMaterialCanonico,
    );
    const ubicacionPayload =
      await this.ubicacionService.validateAndNormalizeUbicacionPayload(
        createRecoleccionDto.ubicacion,
      );

    await this.evidenciasService.assertTipoEntidadActiva();

    let codigoTrazabilidad: string | null = null;
    let recoleccionId: number | null = null;
    let ubicacionId: number | null = null;
    let fotosSubidas: FotoSubidaRecoleccion[] = [];
    let insertRecoleccionIntentado = false;

    try {
      const { data: ubicacionCreada, error: ubicacionError } = await supabase
        .from('ubicacion')
        .insert(ubicacionPayload)
        .select('id')
        .single();

      if (ubicacionError || !ubicacionCreada) {
        this.logger.error('❌ Error al crear ubicación:', ubicacionError);
        throw new InternalServerErrorException('Error al crear ubicación');
      }

      ubicacionId = Number(ubicacionCreada.id);
      const snapshotPayload = await this.snapshotsService.resolve({
        plantaId: createRecoleccionDto.planta_id,
        usuarioId: usuario.id,
        ubicacionId,
      });

      fotosSubidas = await this.evidenciasService.uploadFotosCreacion(files);

      let recoleccionCreada: any = null;
      let recoleccionError: any = null;

      for (let intento = 1; intento <= 5; intento++) {
        codigoTrazabilidad =
          await this.codigosService.generateCodigoTrazabilidad(
            fechaRecoleccion,
          );

        // Desde el envío, una respuesta perdida puede ocultar una fila confirmada.
        insertRecoleccionIntentado = true;
        const result = await supabase
          .from('recoleccion')
          .insert({
            fecha: fechaRecoleccion,
            tipo_material: tipoMaterialCanonico,
            especie_nueva: false,
            observaciones: createRecoleccionDto.observaciones,
            usuario_id: usuario.id,
            ubicacion_id: ubicacionId,
            vivero_id: createRecoleccionDto.vivero_id,
            metodo_id: createRecoleccionDto.metodo_id,
            planta_id: createRecoleccionDto.planta_id,
            ...snapshotPayload,
            codigo_trazabilidad: codigoTrazabilidad,
            estado_registro: EstadoRegistro.BORRADOR,
            unidad_canonica: canonicalInput.unidad_canonica,
            cantidad_inicial_canonica: canonicalInput.cantidad_canonica,
            saldo_actual: canonicalInput.cantidad_canonica,
            estado_operativo: 'ABIERTO',
          })
          .select('id')
          .single();

        recoleccionCreada = result.data;
        recoleccionError = result.error;

        if (!recoleccionError && recoleccionCreada) {
          break;
        }

        if (
          this.codigosService.isCodigoTrazabilidadDuplicateError(
            recoleccionError,
          )
        ) {
          this.logger.warn(
            `⚠️ Colisión de código de trazabilidad (${codigoTrazabilidad}), reintentando (${intento}/5)...`,
          );
          continue;
        }

        break;
      }

      if (recoleccionError || !recoleccionCreada) {
        this.logger.error('❌ Error al crear recolección:', recoleccionError);
        throw new InternalServerErrorException('Error al crear recolección');
      }

      recoleccionId = Number(recoleccionCreada.id);

      await this.evidenciasService.insertEvidenciasCreacion({
        recoleccionId,
        codigoTrazabilidad,
        userId: usuario.id,
        fotosSubidas,
      });

      const response = await this.consultasService.findOne(recoleccionId);

      await this.historialService.registrarEvento({
        recoleccionId,
        tipoHistorial: TipoHistorialRecoleccion.BORRADOR_CREADO,
        estadoOrigen: null,
        estadoDestino: EstadoRegistro.BORRADOR,
        actorUserId: usuario.id,
        metadata: {
          codigo_trazabilidad: codigoTrazabilidad,
          origen: 'CREATE_RECOLECCION',
        },
      });

      return response;
    } catch (error) {
      this.logger.error('❌ Error en create de recolección:', error);

      let puedeLimpiarRecursos = !insertRecoleccionIntentado;
      if (recoleccionId !== null) {
        try {
          const { data, error: compensacionError } = await supabase.rpc(
            'fn_recoleccion_compensar_creacion',
            { p_recoleccion_id: recoleccionId, p_actor_id: usuario.id },
          );
          // La RPC bloquea la ficha y comprueba estado, borrado e historial en
          // la misma transacción que la compensación. Una lectura previa no
          // basta: DELETE podría confirmar entre el check y la limpieza.
          puedeLimpiarRecursos =
            !compensacionError && data?.compensado === true;
        } catch {
          // Un fallo de transporte también puede ocultar una RPC confirmada.
          // Conservar los archivos es seguro en ambos resultados posibles.
          puedeLimpiarRecursos = false;
        }
      }

      if (puedeLimpiarRecursos) {
        try {
          if (ubicacionId !== null) {
            await supabase.from('ubicacion').delete().eq('id', ubicacionId);
          }
          await this.evidenciasService.removeStoragePaths(
            fotosSubidas.map((foto) => foto.ruta_archivo),
          );
        } catch {
          this.logger.error('No se pudieron limpiar los recursos sin vínculo.');
        }
      } else {
        this.logger.warn(
          'Se conservan ficha, ubicación y fotos: la compensación no quedó confirmada o el registro conserva historia.',
        );
      }

      throw error;
    }
  }
}
