import {
  Injectable,
  InternalServerErrorException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FiltersLoteFaseViveroDto } from './dto/filters-lote-fase-vivero.dto';
import { CreateLoteFaseViveroDto } from './dto/create-lote-fase-vivero.dto';
import { LoteFaseViveroEstado } from './enums/lote-fase-vivero-estado.enum';

@Injectable()
export class LotesFaseViveroService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * GET /api/lotes-fase-vivero
   * Lista lotes en fase vivero con filtros opcionales
   */
  async findAll(filters: FiltersLoteFaseViveroDto) {
    const supabase = this.supabaseService.getClient();

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('lote_fase_vivero')
      .select(
        `
        *,
        planta:planta_id (id, especie, nombre_cientifico, variedad),
        vivero:vivero_id (
          id,
          codigo,
          nombre,
          ubicacion:ubicacion_id (departamento, comunidad)
        ),
        responsable:responsable_id (id, nombre, username)
      `,
        { count: 'exact' },
      )
      .order('fecha_inicio', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters.vivero_id) {
      query = query.eq('vivero_id', filters.vivero_id);
    }

    if (filters.planta_id) {
      query = query.eq('planta_id', filters.planta_id);
    }

    if (filters.responsable_id) {
      query = query.eq('responsable_id', filters.responsable_id);
    }

    if (filters.search) {
      query = query.ilike('codigo_trazabilidad', `%${filters.search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error al obtener lotes de fase vivero:', error);
      throw new InternalServerErrorException(
        'Error al obtener lotes de fase vivero',
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * GET /api/lotes-fase-vivero/:id
   * Obtiene un lote en fase vivero por ID
   */
  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('lote_fase_vivero')
      .select(
        `
        *,
        planta:planta_id (id, especie, nombre_cientifico, variedad),
        vivero:vivero_id (
          id,
          codigo,
          nombre,
          ubicacion:ubicacion_id (departamento, comunidad)
        ),
        responsable:responsable_id (id, nombre, username)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Lote de fase vivero no encontrado');
    }
    return {
      success: true,
      data,
    };
  }

  /**
   * POST /api/lotes-fase-vivero
   * Crea un lote en fase vivero
   */
  async create(
    createLoteFaseViveroDto: CreateLoteFaseViveroDto,
    files?: any[],
  ) {
    const supabase = this.supabaseService.getClient();
    const fotosUrls: Array<{
      url: string;
      peso_bytes: number;
      formato: string;
    }> = [];

    const { data: existing } = await supabase
      .from('lote_fase_vivero')
      .select('id')
      .eq('codigo_trazabilidad', createLoteFaseViveroDto.codigo_trazabilidad)
      .single();

    if (existing) {
      throw new ConflictException(
        `Ya existe un lote con codigo ${createLoteFaseViveroDto.codigo_trazabilidad}`,
      );
    }

    const { data: vivero, error: viveroError } = await supabase
      .from('vivero')
      .select('id')
      .eq('id', createLoteFaseViveroDto.vivero_id)
      .single();

    if (viveroError || !vivero) {
      throw new NotFoundException('Vivero no encontrado');
    }

    const { data: responsable, error: responsableError } = await supabase
      .from('usuario')
      .select('id')
      .eq('id', createLoteFaseViveroDto.responsable_id)
      .single();

    if (responsableError || !responsable) {
      throw new NotFoundException('Responsable no encontrado');
    }

    if (
      !createLoteFaseViveroDto.recoleccion_ids ||
      createLoteFaseViveroDto.recoleccion_ids.length === 0
    ) {
      throw new BadRequestException(
        'recoleccion_ids es obligatorio y no puede estar vacio',
      );
    }

    const normalizedRecoleccionIds = createLoteFaseViveroDto.recoleccion_ids.map(
      (id) => Number(id),
    );

    // Esta función valida que los IDs sean núneros varilos
    if (normalizedRecoleccionIds.some((id) => Number.isNaN(id))) {
      throw new BadRequestException('recoleccion_ids debe contener numeros validos');
    }
    
    // y esta que no haya IDs repetidos
    const recoleccionIds = Array.from(new Set(normalizedRecoleccionIds));

    // si tenemos menos IDs únicos que originales, había repetidos
    if (recoleccionIds.length !== normalizedRecoleccionIds.length) {
      throw new BadRequestException('recoleccion_ids no debe repetir valores');
    }

    // Validar que las recolecciones existan y sean consistentes
    const { data: recolecciones, error: recoleccionError } = await supabase
      .from('recoleccion')
      .select('id, planta_id, vivero_id')
      .in('id', recoleccionIds);

    if (recoleccionError) {
      console.error('Error al obtener recolecciones:', recoleccionError);
      throw new InternalServerErrorException(
        'Error al validar recolecciones',
      );
    }

    if (!recolecciones || recolecciones.length !== recoleccionIds.length) {
      throw new NotFoundException('Una o mas recolecciones no existen');
    }

    // Aca normalizamos los datos para facilitar validaciones
    const recoleccionesParsed = recolecciones.map((recoleccion) => ({
      ...recoleccion,
      planta_id:
        recoleccion.planta_id === null || recoleccion.planta_id === undefined
          ? null
          : Number(recoleccion.planta_id),
      vivero_id:
        recoleccion.vivero_id === null || recoleccion.vivero_id === undefined
          ? null
          : Number(recoleccion.vivero_id),
    }));

    // Validar que todas las recolecciones tengan planta_id válido
    const recoleccionSinPlanta = recoleccionesParsed.some(
      (recoleccion) => !recoleccion.planta_id || Number.isNaN(recoleccion.planta_id),
    );

    if (recoleccionSinPlanta) {
      throw new BadRequestException(
        'Las recolecciones deben tener planta_id valido',
      );
    }

    const plantaIdsRecolecciones = recoleccionesParsed.map(
      (recoleccion) => recoleccion.planta_id,
    );
    const plantaIdsToFetch = new Set(plantaIdsRecolecciones);

    if (createLoteFaseViveroDto.planta_id) {
      plantaIdsToFetch.add(createLoteFaseViveroDto.planta_id);
    }

    const { data: plantas, error: plantasError } = await supabase
      .from('planta')
      .select('id, tipo_planta')
      .in('id', Array.from(plantaIdsToFetch));

    if (plantasError) {
      console.error('Error al obtener plantas:', plantasError);
      throw new InternalServerErrorException('Error al validar plantas');
    }

    if (!plantas || plantas.length !== plantaIdsToFetch.size) {
      throw new NotFoundException('Planta no encontrada');
    }

    const plantasById = new Map(
      plantas.map((planta) => [Number(planta.id), planta]),
    );

    const tiposPlanta = new Set(
      plantaIdsRecolecciones.map(
        (plantaId) => plantasById.get(plantaId)?.tipo_planta,
      ),
    );

    if (tiposPlanta.size !== 1) {
      throw new BadRequestException(
        'Las recolecciones deben ser de un solo tipo de planta',
      );
    }

    const tipoPlantaFinal = Array.from(tiposPlanta)[0];
    let plantaIdFinal = plantaIdsRecolecciones[0];

    if (createLoteFaseViveroDto.planta_id) {
      const plantaSeleccionada = plantasById.get(
        createLoteFaseViveroDto.planta_id,
      );

      if (!plantaSeleccionada || plantaSeleccionada.tipo_planta !== tipoPlantaFinal) {
        throw new BadRequestException(
          'planta_id no coincide con el tipo de planta de las recolecciones seleccionadas',
        );
      }

      plantaIdFinal = createLoteFaseViveroDto.planta_id;
    }

    const recoleccionViveroMismatch = recoleccionesParsed.some(
      (recoleccion) =>
        recoleccion.vivero_id !== createLoteFaseViveroDto.vivero_id,
    );

    if (recoleccionViveroMismatch) {
      throw new BadRequestException(
        'Las recolecciones deben pertenecer al vivero seleccionado',
      );
    }

    if (files && files.length > 0) {
      if (files.length > 5) {
        throw new BadRequestException('Maximo 5 fotos permitidas');
      }

      for (const file of files) {
        const formato = file.mimetype.split('/')[1].toUpperCase();
        if (!['JPG', 'JPEG', 'PNG'].includes(formato)) {
          throw new BadRequestException(
            `Formato ${formato} no permitido. Solo JPG, JPEG, PNG`,
          );
        }

        if (file.size > 5242880) {
          throw new BadRequestException(
            `Archivo ${file.originalname} supera 5MB`,
          );
        }
      }
    }

    const plantaFinal = plantasById.get(plantaIdFinal);

    if (!plantaFinal) {
      throw new NotFoundException('Planta no encontrada');
    }

    const fechaInicio =
      createLoteFaseViveroDto.fecha_inicio ||
      new Date().toISOString().slice(0, 10);

    const insertPayload: Record<string, unknown> = {
      codigo_trazabilidad: createLoteFaseViveroDto.codigo_trazabilidad,
      planta_id: plantaIdFinal,
      vivero_id: createLoteFaseViveroDto.vivero_id,
      responsable_id: createLoteFaseViveroDto.responsable_id,
      fecha_inicio: fechaInicio,
      cantidad_inicio: createLoteFaseViveroDto.cantidad_inicio,
      estado: createLoteFaseViveroDto.estado || LoteFaseViveroEstado.INICIO,
    };

    if (createLoteFaseViveroDto.created_at) {
      insertPayload.created_at = createLoteFaseViveroDto.created_at;
    }

    const { data, error } = await supabase
      .from('lote_fase_vivero')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          `Ya existe un lote con codigo ${createLoteFaseViveroDto.codigo_trazabilidad}`,
        );
      }
      console.error('Error al crear lote de fase vivero:', error);
      throw new InternalServerErrorException(
        'Error al crear lote de fase vivero',
      );
    }

    const loteId = data.id;

    const loteRecolecciones = recoleccionIds.map((recoleccionId) => ({
      lote_id: loteId,
      recoleccion_id: recoleccionId,
    }));

    const { error: loteRecoleccionError } = await supabase
      .from('lote_fase_vivero_recoleccion')
      .insert(loteRecolecciones);

    if (loteRecoleccionError) {
      console.error(
        'Error al vincular recolecciones al lote:',
        loteRecoleccionError,
      );
      throw new InternalServerErrorException(
        'Error al vincular recolecciones al lote',
      );
    }

    const needsHistorial =
      Boolean(createLoteFaseViveroDto.observaciones) ||
      (files && files.length > 0);
    let historialId: number | null = null;

    if (needsHistorial) {
      const { data: historialData, error: historialError } = await supabase
        .from('lote_fase_vivero_historial')
        .select('id, notas')
        .eq('lote_id', loteId)
        .order('nro_cambio', { ascending: false })
        .limit(1);

      if (historialError) {
        console.error('Error al obtener historial del lote:', historialError);
        throw new InternalServerErrorException(
          'Error al obtener historial del lote',
        );
      }

      if (historialData && historialData.length > 0) {
        historialId = historialData[0].id;
        if (createLoteFaseViveroDto.observaciones) {
          const { error: updateHistorialError } = await supabase
            .from('lote_fase_vivero_historial')
            .update({ notas: createLoteFaseViveroDto.observaciones })
            .eq('id', historialId);

          if (updateHistorialError) {
            console.error(
              'Error al actualizar observaciones del historial:',
              updateHistorialError,
            );
            throw new InternalServerErrorException(
              'Error al guardar observaciones del lote',
            );
          }
        }
      } else {
        const historialInsert: Record<string, unknown> = {
          lote_id: loteId,
          nro_cambio: 1,
          responsable_id: createLoteFaseViveroDto.responsable_id,
          accion: LoteFaseViveroEstado.INICIO,
          estado: createLoteFaseViveroDto.estado || LoteFaseViveroEstado.INICIO,
          cantidad_inicio: createLoteFaseViveroDto.cantidad_inicio,
          cantidad_embolsadas: 0,
          cantidad_sombra: 0,
          cantidad_lista_plantar: 0,
          fecha_inicio: fechaInicio,
        };

        if (createLoteFaseViveroDto.observaciones) {
          historialInsert.notas = createLoteFaseViveroDto.observaciones;
        }

        const { data: historialCreado, error: historialInsertError } =
          await supabase
            .from('lote_fase_vivero_historial')
            .insert(historialInsert)
            .select('id')
            .single();

        if (historialInsertError || !historialCreado) {
          console.error(
            'Error al crear historial del lote:',
            historialInsertError,
          );
          throw new InternalServerErrorException(
            'Error al crear historial del lote',
          );
        }

        historialId = historialCreado.id;
      }
    }

    if (files && files.length > 0) {
      if (!historialId) {
        throw new InternalServerErrorException(
          'No se pudo determinar el historial del lote para guardar fotos',
        );
      }

      for (const file of files) {
        const nombreArchivo = `${loteId}_${Date.now()}_${file.originalname}`;
        const rutaStorage = `lote_${loteId}/${nombreArchivo}`;

        const { error: uploadError } = await supabase.storage
          .from('lote_fase_vivero_fotos')
          .upload(rutaStorage, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error('Error al subir foto del lote:', uploadError);
          throw new InternalServerErrorException(
            'Error al subir foto del lote',
          );
        }

        const { data: publicUrlData } = supabase.storage
          .from('lote_fase_vivero_fotos')
          .getPublicUrl(rutaStorage);

        const formato = file.mimetype.split('/')[1].toUpperCase();

        fotosUrls.push({
          url: publicUrlData.publicUrl,
          peso_bytes: file.size,
          formato,
        });
      }
    }

    if (fotosUrls.length > 0) {
      const fotosInsert = fotosUrls.map((foto, index) => ({
        lote_historial_id: historialId,
        url: foto.url,
        peso_bytes: foto.peso_bytes,
        formato: foto.formato,
        es_portada: index === 0,
        descripcion: null,
      }));

      const { error: fotosError } = await supabase
        .from('lote_fase_vivero_foto')
        .insert(fotosInsert);

      if (fotosError) {
        console.error('Error al guardar fotos del lote:', fotosError);
        for (const foto of fotosUrls) {
          const nombreArchivo = foto.url.split('/').pop();
          if (nombreArchivo) {
            await supabase.storage
              .from('lote_fase_vivero_fotos')
              .remove([`lote_${loteId}/${nombreArchivo}`]);
          }
        }
        throw new InternalServerErrorException(
          'Error al guardar fotos del lote',
        );
      }
    }

    return {
      success: true,
      message: 'Lote de fase vivero creado exitosamente',
      data,
    };
  }
}
