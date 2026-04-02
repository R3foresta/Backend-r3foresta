import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { PinataService } from '../pinata/pinata.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { CreateRecoleccionDto } from './dto/create-recoleccion.dto';
import { CreateUbicacionDto } from './dto/create-ubicacion.dto';
import {
  CreateRecoleccionV2Dto,
  TipoMaterialRecoleccionV2Canonico,
  TipoMaterialRecoleccionV2Input,
} from './dto/create-recoleccion-v2.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { RejectValidationDto } from './dto/reject-validation.dto';
import { EstadoRegistro } from './enums/estado-registro.enum';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';
import { UbicacionesReadService } from '../common/ubicaciones/ubicaciones-read.service';

@Injectable()
export class RecoleccionesService {
  private readonly logger = new Logger(RecoleccionesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly pinataService: PinataService,
    private readonly blockchainService: BlockchainService,
    private readonly ubicacionesReadService: UbicacionesReadService,
  ) {}

  /**
   * Crea una nueva recolección con todas sus relaciones
   */
  async create(
    createRecoleccionDto: CreateRecoleccionDto,
    authId: string,
    userRole: string,
    files?: any[],
  ) {
    const supabase = this.supabaseService.getClient();

    // Buscar el ID numérico del usuario usando su auth_id
    const { data: usuarioData, error: usuarioError } = await supabase
      .from('usuario')
      .select('id, nombre, rol')
      .eq('auth_id', authId)
      .single();

    if (usuarioError || !usuarioData) {
      throw new NotFoundException(
        `Usuario con auth_id ${authId} no encontrado`,
      );
    }

    const userId = usuarioData.id;
    console.log(`✅ Usuario encontrado: ${usuarioData.nombre} (ID: ${userId}, auth_id: ${authId})`);

    // Validar permisos
    if (!['ADMIN', 'GENERAL'].includes(userRole)) {
      throw new ForbiddenException(
        'No tienes permisos para crear recolecciones. Solo usuarios con rol ADMIN o GENERAL pueden realizar esta acción.',
      );
    }

    // Validar fecha (no más de 45 días atrás)
    const fecha = new Date(createRecoleccionDto.fecha);
    const hoy = new Date();
    const hace45Dias = new Date();
    hace45Dias.setDate(hoy.getDate() - 45);

    if (fecha > hoy) {
      throw new BadRequestException('La fecha no puede ser futura');
    }

    if (fecha < hace45Dias) {
      throw new BadRequestException(
        'La fecha no puede ser mayor a 45 días atrás',
      );
    }

    // Validar vivero_id si se envía
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

    // Validar metodo_id
    const { data: metodo, error: metodoError } = await supabase
      .from('metodo_recoleccion')
      .select('id')
      .eq('id', createRecoleccionDto.metodo_id)
      .single();

    if (metodoError || !metodo) {
      throw new NotFoundException('Método de recolección no encontrado');
    }

    // Validar planta_id o nueva_planta según especie_nueva
    let plantaIdFinal = createRecoleccionDto.planta_id;

    if (!createRecoleccionDto.especie_nueva) {
      if (!createRecoleccionDto.planta_id) {
        throw new BadRequestException(
          'planta_id es requerido cuando especie_nueva = false',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: planta, error: plantaError } = await supabase
        .from('planta')
        .select('*')
        .eq('id', createRecoleccionDto.planta_id)
        .single();

      if (plantaError || !planta) {
        throw new NotFoundException('Planta no encontrada');
      }
    } else {
      if (!createRecoleccionDto.nueva_planta) {
        throw new BadRequestException(
          'nueva_planta es requerido cuando especie_nueva = true',
        );
      }
    }

    // Validar fotos si se envían
    if (files && files.length > 0) {
      if (files.length > 5) {
        throw new BadRequestException('Máximo 5 fotos permitidas');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const file of files as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const formato = file.mimetype.split('/')[1].toUpperCase();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        if (!['JPG', 'JPEG', 'PNG'].includes(formato)) {
          throw new BadRequestException(
            `Formato ${formato} no permitido. Solo JPG, JPEG, PNG`,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (file.size > 5242880) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          throw new BadRequestException(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            `Archivo ${file.originalname} supera 5MB`,
          );
        }
      }
    }

    let ubicacionId: number;
    let recoleccionId: number;
    const ubicacionPayload = await this.validateAndNormalizeUbicacionPayload(
      createRecoleccionDto.ubicacion,
    );
    const fotosUrls: Array<{
      url: string;
      peso_bytes: number;
      formato: string;
    }> = [];

    try {
      console.log('\n🌱 ============ CREANDO RECOLECCIÓN ============');
      console.log('📥 Datos recibidos:');
      console.log('   • Fecha:', createRecoleccionDto.fecha);
      console.log(
        '   • Cantidad:',
        createRecoleccionDto.cantidad,
        createRecoleccionDto.unidad,
      );
      console.log('   • Tipo material:', createRecoleccionDto.tipo_material);
      console.log('   • Usuario ID:', userId);

      // PASO 1: Crear ubicación
      console.log('📍 Paso 1: Creando ubicación...');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: ubicacionCreada, error: ubicacionError } = await supabase
        .from('ubicacion')
        .insert(ubicacionPayload)
        .select()
        .single();

      if (ubicacionError) {
        console.error('❌ Error al crear ubicación:', ubicacionError);
        throw new InternalServerErrorException('Error al crear ubicación');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      ubicacionId = ubicacionCreada.id;
      console.log('✅ Ubicación creada con ID:', ubicacionId);

      // PASO 2: Crear planta si especie_nueva = true
      if (createRecoleccionDto.especie_nueva) {
        console.log('🌿 Paso 2: Creando nueva planta...');
        
        const plantaData = {
          especie: createRecoleccionDto.nueva_planta!.especie,
          nombre_cientifico: createRecoleccionDto.nueva_planta!.nombre_cientifico,
          variedad: createRecoleccionDto.nueva_planta!.variedad || 'Sin especificar',
          tipo_planta: createRecoleccionDto.nueva_planta!.tipo_planta,
          tipo_planta_otro: createRecoleccionDto.nueva_planta!.tipo_planta_otro,
          // Temporalmente comentado hasta que el enum fuente_planta esté creado en Supabase
          // fuente: createRecoleccionDto.nueva_planta!.fuente,
        };

        console.log('📋 Datos de planta a insertar:', JSON.stringify(plantaData, null, 2));
        
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { data: plantaCreada, error: plantaError } = await supabase
          .from('planta')
          .insert(plantaData)
          .select()
          .single();

        if (plantaError) {
          console.error('❌ Error al crear planta:', plantaError);
          console.error('❌ Datos que se intentaron insertar:', plantaData);
          // Rollback: eliminar ubicación
          await supabase.from('ubicacion').delete().eq('id', ubicacionId);
          throw new InternalServerErrorException('Error al crear planta');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        plantaIdFinal = plantaCreada.id;
        console.log('✅ Planta creada con ID:', plantaIdFinal);
      } else {
        console.log('🌿 Paso 2: Usando planta existente ID:', plantaIdFinal);
      }

      // PASO 3: Subir fotos a Supabase Storage
      if (files && files.length > 0) {
        console.log(`📸 Paso 3: Subiendo ${files.length} fotos...`);
        for (const file of files) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const nombreArchivo = `${Date.now()}_${file.originalname}`;
          const rutaStorage = `${nombreArchivo}`;

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { data: uploadData, error: uploadError } =
            await supabase.storage
              .from('recoleccion_fotos')
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
              .upload(rutaStorage, file.buffer, {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                contentType: file.mimetype,
                upsert: false,
              });

          if (uploadError) {
            console.error('❌ Error al subir foto:', uploadError);
            // Rollback
            await supabase.from('ubicacion').delete().eq('id', ubicacionId);
            if (createRecoleccionDto.especie_nueva && plantaIdFinal) {
              await supabase.from('planta').delete().eq('id', plantaIdFinal);
            }
            throw new InternalServerErrorException('Error al subir foto');
          }

          const { data: publicUrlData } = supabase.storage
            .from('recoleccion_fotos')
            .getPublicUrl(rutaStorage);

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const formato = file.mimetype.split('/')[1].toUpperCase();

          fotosUrls.push({
            url: publicUrlData.publicUrl,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            peso_bytes: file.size,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            formato: formato,
          });
        }
        console.log('✅ Fotos subidas correctamente');
      } else {
        console.log('📸 Paso 3: Sin fotos para subir');
      }

      // PASO 4: Crear recolección
      console.log('📦 Paso 4: Creando registro de recolección...');

      let codigoTrazabilidad = '';
      let recoleccionCreada: any = null;
      let recoleccionError: any = null;

      for (let intento = 1; intento <= 5; intento++) {
        codigoTrazabilidad = await this.generateCodigoTrazabilidad(
          createRecoleccionDto.fecha,
        );
        console.log('🏷️  Código de trazabilidad generado:', codigoTrazabilidad);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await supabase
          .from('recoleccion')
          .insert({
            fecha: createRecoleccionDto.fecha,
            nombre_cientifico: createRecoleccionDto.especie_nueva
              ? createRecoleccionDto.nueva_planta!.nombre_cientifico
              : createRecoleccionDto.nombre_cientifico,
            nombre_comercial: createRecoleccionDto.nombre_comercial,
            cantidad: createRecoleccionDto.cantidad,
            unidad: createRecoleccionDto.unidad,
            tipo_material: createRecoleccionDto.tipo_material,
            estado: createRecoleccionDto.estado || 'ALMACENADO',
            especie_nueva: createRecoleccionDto.especie_nueva,
            observaciones: createRecoleccionDto.observaciones,
            usuario_id: userId,
            ubicacion_id: ubicacionId,
            vivero_id: createRecoleccionDto.vivero_id,
            metodo_id: createRecoleccionDto.metodo_id,
            planta_id: plantaIdFinal,
            codigo_trazabilidad: codigoTrazabilidad,
            estado_registro: EstadoRegistro.BORRADOR,
          })
          .select()
          .single();

        recoleccionCreada = result.data;
        recoleccionError = result.error;

        if (!recoleccionError && recoleccionCreada) {
          break;
        }

        if (this.isCodigoTrazabilidadDuplicateError(recoleccionError)) {
          this.logger.warn(
            `⚠️ Colisión de código de trazabilidad (${codigoTrazabilidad}), reintentando (${intento}/5)...`,
          );
          continue;
        }

        break;
      }

      if (recoleccionError) {
        console.error('❌ Error al crear recolección:', recoleccionError);
        // Rollback completo
        await supabase.from('ubicacion').delete().eq('id', ubicacionId);
        if (createRecoleccionDto.especie_nueva && plantaIdFinal) {
          await supabase.from('planta').delete().eq('id', plantaIdFinal);
        }
        // Eliminar fotos
        for (const foto of fotosUrls) {
          const nombreArchivo = foto.url.split('/').pop();
          await supabase.storage
            .from('recoleccion_fotos')
            .remove([nombreArchivo!]);
        }
        throw new InternalServerErrorException('Error al crear recolección');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      recoleccionId = recoleccionCreada.id;
      console.log('✅ Recolección creada con ID:', recoleccionId);

      // PASO 5: Crear registros en recoleccion_foto
      if (fotosUrls.length > 0) {
        console.log(`💾 Paso 5: Guardando ${fotosUrls.length} fotos en BD...`);
        const fotosInsert = fotosUrls.map((foto) => ({
          recoleccion_id: recoleccionId,
          url: foto.url,
          peso_bytes: foto.peso_bytes,
          formato: foto.formato,
        }));

        const { error: fotosError } = await supabase
          .from('recoleccion_foto')
          .insert(fotosInsert);

        if (fotosError) {
          console.error('❌ Error al guardar fotos:', fotosError);
          // Rollback completo
          await supabase.from('recoleccion').delete().eq('id', recoleccionId);
          await supabase.from('ubicacion').delete().eq('id', ubicacionId);
          if (createRecoleccionDto.especie_nueva && plantaIdFinal) {
            await supabase.from('planta').delete().eq('id', plantaIdFinal);
          }
          for (const foto of fotosUrls) {
            const nombreArchivo = foto.url.split('/').pop();
            await supabase.storage
              .from('recoleccion_fotos')
              .remove([nombreArchivo!]);
          }
          throw new InternalServerErrorException('Error al guardar fotos');
        }
        console.log('✅ Fotos guardadas en base de datos');
      } else {
        console.log('💾 Paso 5: Sin fotos para guardar');
      }

      console.log('🎉 ✅ RECOLECCIÓN CREADA EXITOSAMENTE (estado: BORRADOR)');
      console.log('🌱 ==========================================\n');

      // Retornar datos completos (la URL de IPFS ya está guardada en la BD)
      return this.findOne(recoleccionId);
    } catch (error) {
      console.error('❌ Error en creación de recolección:', error);
      throw error;
    }
  }

  /**
   * Crea una nueva recolección bajo contrato V2
   * - No recibe estado en request (se usa default de BD)
   * - nombre_cientifico/nombre_comercial se consumen desde planta (sin snapshot legacy)
   * - tipo_material canónico: SEMILLA | ESQUEJE
   * - registra evidencias en evidencias_trazabilidad
   */
  async createV2(
    createRecoleccionDto: CreateRecoleccionV2Dto,
    authId: string,
    userRole: string,
    files?: any[],
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: usuarioData, error: usuarioError } = await supabase
      .from('usuario')
      .select('id, nombre, rol')
      .eq('auth_id', authId)
      .single();

    if (usuarioError || !usuarioData) {
      throw new NotFoundException(
        `Usuario con auth_id ${authId} no encontrado`,
      );
    }

    const userId = usuarioData.id;
    const roleFromDb = String(usuarioData.rol ?? '').toUpperCase();
    const roleFromRequestContext = String(userRole ?? '').toUpperCase();
    const hasAllowedRole = [roleFromDb, roleFromRequestContext].some((role) =>
      ['ADMIN', 'GENERAL'].includes(role),
    );

    if (!hasAllowedRole) {
      throw new ForbiddenException(
        'No tienes permisos para crear recolecciones. Solo usuarios con rol ADMIN o GENERAL pueden realizar esta acción.',
      );
    }

    const fecha = new Date(createRecoleccionDto.fecha);
    const hoy = new Date();
    const hace45Dias = new Date();
    hace45Dias.setDate(hoy.getDate() - 45);

    if (fecha > hoy) {
      throw new BadRequestException('La fecha no puede ser futura');
    }

    if (fecha < hace45Dias) {
      throw new BadRequestException(
        'La fecha no puede ser mayor a 45 días atrás',
      );
    }

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

    if (!files || files.length < 2) {
      throw new BadRequestException(
        'Se requieren al menos 2 fotos para crear una recolección',
      );
    }

    if (files.length > 5) {
      throw new BadRequestException('Máximo 5 fotos permitidas');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const file of files as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const formato = file.mimetype.split('/')[1].toUpperCase();
      if (!['JPG', 'JPEG', 'PNG'].includes(formato)) {
        throw new BadRequestException(
          `Formato ${formato} no permitido. Solo JPG, JPEG, PNG`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (file.size > 5242880) {
        throw new BadRequestException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          `Archivo ${file.originalname} supera 5MB`,
        );
      }
    }

    const tipoMaterialCanonico = this.normalizeTipoMaterialV2(
      createRecoleccionDto.tipo_material,
    );
    const conversionCanonica = this.normalizeCantidadYUnidadCanonica(
      createRecoleccionDto.cantidad,
      createRecoleccionDto.unidad,
      tipoMaterialCanonico,
    );
    const ubicacionPayload = await this.validateAndNormalizeUbicacionPayload(
      createRecoleccionDto.ubicacion,
    );

    const bucketFotos = 'recoleccion_fotos';
    const tipoEntidadEvidenciaId = 1;

    const { data: tipoEntidadData, error: tipoEntidadError } = await supabase
      .from('tipos_entidad_evidencia')
      .select('id, activo')
      .eq('id', tipoEntidadEvidenciaId)
      .single();

    if (tipoEntidadError || !tipoEntidadData || !tipoEntidadData.activo) {
      throw new NotFoundException(
        `No existe tipo_entidad_evidencia activo con id=${tipoEntidadEvidenciaId}`,
      );
    }

    let codigoTrazabilidad: string | null = null;
    let recoleccionId: number | null = null;
    let ubicacionId: number | null = null;
    const fotosSubidas: Array<{
      ruta_archivo: string;
      storage_object_id: string | null;
      mime_type: string;
      tamano_bytes: number;
      formato: string;
      hash_sha256: string | null;
    }> = [];

    try {
      const { data: ubicacionCreada, error: ubicacionError } = await supabase
        .from('ubicacion')
        .insert(ubicacionPayload)
        .select('id')
        .single();

      if (ubicacionError || !ubicacionCreada) {
        this.logger.error('❌ Error al crear ubicación v2:', ubicacionError);
        throw new InternalServerErrorException('Error al crear ubicación');
      }

      ubicacionId = Number(ubicacionCreada.id);

      for (const file of files) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const nombreArchivo = `${Date.now()}_${file.originalname}`;
        const rutaStorage = nombreArchivo;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketFotos)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          .upload(rutaStorage, file.buffer, {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          this.logger.error('❌ Error al subir foto v2:', uploadError);
          throw new InternalServerErrorException('Error al subir foto');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const formato = file.mimetype.split('/')[1].toUpperCase();
        const storageObjectId =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          typeof uploadData?.id === 'string' ? uploadData.id : null;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const hashSha256 = file.buffer
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
            createHash('sha256').update(file.buffer).digest('hex')
          : null;

        fotosSubidas.push({
          ruta_archivo: rutaStorage,
          storage_object_id: storageObjectId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          mime_type: file.mimetype,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          tamano_bytes: file.size,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          formato,
          hash_sha256: hashSha256,
        });
      }

      let recoleccionCreada: any = null;
      let recoleccionError: any = null;

      for (let intento = 1; intento <= 5; intento++) {
        codigoTrazabilidad = await this.generateCodigoTrazabilidad(
          createRecoleccionDto.fecha,
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await supabase
          .from('recoleccion')
          .insert({
            fecha: createRecoleccionDto.fecha,
            nombre_cientifico: null,
            nombre_comercial: null,
            cantidad: createRecoleccionDto.cantidad,
            unidad: conversionCanonica.unidad_normalizada,
            tipo_material: tipoMaterialCanonico,
            especie_nueva: false,
            observaciones: createRecoleccionDto.observaciones,
            usuario_id: userId,
            ubicacion_id: ubicacionId,
            vivero_id: createRecoleccionDto.vivero_id,
            metodo_id: createRecoleccionDto.metodo_id,
            planta_id: createRecoleccionDto.planta_id,
            codigo_trazabilidad: codigoTrazabilidad,
            estado_registro: 'BORRADOR',
            unidad_canonica: conversionCanonica.unidad_canonica,
            cantidad_inicial_canonica: conversionCanonica.cantidad_canonica,
          })
          .select('id')
          .single();

        recoleccionCreada = result.data;
        recoleccionError = result.error;

        if (!recoleccionError && recoleccionCreada) {
          break;
        }

        if (this.isCodigoTrazabilidadDuplicateError(recoleccionError)) {
          this.logger.warn(
            `⚠️ Colisión de código de trazabilidad (${codigoTrazabilidad}), reintentando (${intento}/5)...`,
          );
          continue;
        }

        break;
      }

      if (recoleccionError || !recoleccionCreada) {
        this.logger.error('❌ Error al crear recolección v2:', recoleccionError);
        throw new InternalServerErrorException('Error al crear recolección v2');
      }

      recoleccionId = Number(recoleccionCreada.id);

      const evidenciasInsert = fotosSubidas.map((foto, index) => ({
        tipo_entidad_id: tipoEntidadEvidenciaId,
        entidad_id: recoleccionId,
        codigo_trazabilidad: codigoTrazabilidad,
        bucket: bucketFotos,
        ruta_archivo: supabase.storage.from(bucketFotos).getPublicUrl(foto.ruta_archivo).data.publicUrl,
        storage_object_id: foto.storage_object_id,
        tipo_archivo: 'FOTO',
        mime_type: foto.mime_type,
        tamano_bytes: foto.tamano_bytes,
        hash_sha256: foto.hash_sha256,
        titulo: `Foto ${index + 1}`,
        metadata: {
          origen: 'CREATE_RECOLECCION_V2',
          formato: foto.formato,
        },
        es_principal: index === 0,
        orden: index,
        creado_por_usuario_id: userId,
      }));

      const { error: evidenciasError } = await supabase
        .from('evidencias_trazabilidad')
        .insert(evidenciasInsert);

      if (evidenciasError) {
        this.logger.error(
          '❌ Error al guardar evidencias de trazabilidad:',
          evidenciasError,
        );
        throw new InternalServerErrorException(
          'Error al guardar evidencias de trazabilidad',
        );
      }

      return this.findOne(recoleccionId);
    } catch (error) {
      this.logger.error('❌ Error en createV2 de recolección:', error);

      if (recoleccionId) {
        await supabase
          .from('evidencias_trazabilidad')
          .delete()
          .eq('tipo_entidad_id', tipoEntidadEvidenciaId)
          .eq('entidad_id', recoleccionId);

        await supabase.from('recoleccion').delete().eq('id', recoleccionId);
      }

      if (ubicacionId) {
        await supabase.from('ubicacion').delete().eq('id', ubicacionId);
      }

      if (fotosSubidas.length > 0) {
        await supabase.storage
          .from(bucketFotos)
          .remove(fotosSubidas.map((foto) => foto.ruta_archivo));
      }

      throw error;
    }
  }

  private normalizeTipoMaterialV2(
    tipoMaterial: TipoMaterialRecoleccionV2Input,
  ): TipoMaterialRecoleccionV2Canonico {
    const tipoNormalizado = String(tipoMaterial).trim().toUpperCase();

    if (tipoNormalizado === 'SEMILLA' || tipoNormalizado === 'ESQUEJE') {
      return tipoNormalizado;
    }

    throw new BadRequestException(
      'tipo_material no soportado para v2. Usa SEMILLA o ESQUEJE.',
    );
  }

  private normalizeCantidadYUnidadCanonica(
    cantidad: number,
    unidad: string,
    tipoMaterial: TipoMaterialRecoleccionV2Canonico,
  ): {
    unidad_canonica: 'G' | 'UNIDAD';
    cantidad_canonica: number;
    unidad_normalizada: string;
  } {
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser un número mayor a 0');
    }

    const unidadNormalizada = String(unidad ?? '').trim().toUpperCase();
    if (!unidadNormalizada) {
      throw new BadRequestException('La unidad es requerida');
    }

    const unidadesGramo = new Set(['G', 'GR', 'GRAMO', 'GRAMOS']);
    const unidadesKilogramo = new Set(['KG', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS']);
    const unidadesUnidad = new Set(['UNIDAD', 'UNIDADES', 'UND', 'U']);

    let unidadCanonica: 'G' | 'UNIDAD';
    let cantidadCanonica: number;

    if (unidadesGramo.has(unidadNormalizada)) {
      unidadCanonica = 'G';
      cantidadCanonica = cantidad;
    } else if (unidadesKilogramo.has(unidadNormalizada)) {
      unidadCanonica = 'G';
      cantidadCanonica = cantidad * 1000;
    } else if (unidadesUnidad.has(unidadNormalizada)) {
      unidadCanonica = 'UNIDAD';
      cantidadCanonica = cantidad;
    } else {
      throw new BadRequestException(
        'unidad no soportada. Usa g/gr/kg o unidad/und',
      );
    }

    if (tipoMaterial === 'ESQUEJE' && unidadCanonica !== 'UNIDAD') {
      throw new BadRequestException(
        'Para tipo_material ESQUEJE la unidad debe ser de conteo (UNIDAD).',
      );
    }

    if (unidadCanonica === 'UNIDAD' && !Number.isInteger(cantidadCanonica)) {
      throw new BadRequestException(
        'Para unidad de conteo la cantidad debe ser un número entero.',
      );
    }

    const cantidadCanonicaRedondeada = Number(cantidadCanonica.toFixed(6));
    if (cantidadCanonicaRedondeada <= 0) {
      throw new BadRequestException(
        'La cantidad canónica resultante debe ser mayor a 0',
      );
    }

    return {
      unidad_canonica: unidadCanonica,
      cantidad_canonica: cantidadCanonicaRedondeada,
      unidad_normalizada: unidadNormalizada,
    };
  }

  private async generateCodigoTrazabilidad(fechaISO: string): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const fecha = new Date(fechaISO);

    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('La fecha no es válida para trazabilidad');
    }

    const año = fecha.getFullYear();
    const prefijo = `REC-${año}-`;
    const { data, error } = await supabase
      .from('recoleccion')
      .select('codigo_trazabilidad')
      .ilike('codigo_trazabilidad', `${prefijo}%`);

    if (error) {
      this.logger.error(
        '❌ Error al consultar códigos de trazabilidad para generar correlativo:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al generar código de trazabilidad',
      );
    }

    let maxSecuencial = 0;
    for (const row of data ?? []) {
      const codigo = String((row as { codigo_trazabilidad?: string }).codigo_trazabilidad ?? '');
      const secuencial = this.extractSecuencialFromCodigo(codigo, año);
      if (secuencial > maxSecuencial) {
        maxSecuencial = secuencial;
      }
    }

    let siguiente = maxSecuencial + 1;
    while (true) {
      const codigo = `${prefijo}${siguiente.toString().padStart(3, '0')}`;
      const existe = await this.codigoTrazabilidadExists(codigo);
      if (!existe) {
        return codigo;
      }
      siguiente += 1;
    }
  }

  private extractSecuencialFromCodigo(codigo: string, año: number): number {
    const prefijo = `REC-${año}-`;
    if (!codigo.startsWith(prefijo)) {
      return 0;
    }

    const parteSecuencial = codigo.slice(prefijo.length);
    const numero = Number.parseInt(parteSecuencial, 10);
    return Number.isFinite(numero) ? numero : 0;
  }

  private async codigoTrazabilidadExists(codigo: string): Promise<boolean> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('recoleccion')
      .select('id')
      .eq('codigo_trazabilidad', codigo)
      .maybeSingle();

    if (error) {
      this.logger.error('❌ Error al verificar existencia de codigo_trazabilidad:', error);
      throw new InternalServerErrorException(
        'Error al validar código de trazabilidad',
      );
    }

    return Boolean(data);
  }

  private isCodigoTrazabilidadDuplicateError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: string; message?: string };
    return (
      candidate.code === '23505' &&
      String(candidate.message ?? '').includes('recoleccion_codigo_trazabilidad_key')
    );
  }

  /**
   * Construye el JSON metadata en formato NFT estándar
   */
  private buildNFTMetadata(recoleccion: any, nombreUsuario: string) {
    // Obtener foto principal desde evidencias (campo fotos del response canónico)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const fotos: any[] = recoleccion.fotos ?? [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const fotoPrincipal =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      fotos.find((f: any) => f.es_principal) || fotos[0] || null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const imageUrl: string = fotoPrincipal?.url || '';

    // Formatear fecha y hora
    const fechaStr = recoleccion.fecha; // Ya viene en formato YYYY-MM-DD
    // Extraer hora del campo created_at que tiene timestamp completo
    const fechaConHora = new Date(recoleccion.created_at);
    const horaStr = fechaConHora.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/La_Paz', // Bolivia timezone
    });

    const rutaAdministrativa =
      recoleccion.ubicacion?.division?.ruta
        ?.map((item: { tipo: string; nombre: string }) => item.nombre)
        .join(', ') || '';

    const ubicacionCompleta = [
      recoleccion.ubicacion?.nombre,
      recoleccion.ubicacion?.referencia,
      rutaAdministrativa,
      recoleccion.ubicacion?.pais?.nombre,
    ]
      .filter(Boolean)
      .join(', ');

    const coordenadas = [
      recoleccion.ubicacion?.coordenadas?.lat,
      recoleccion.ubicacion?.coordenadas?.lon,
    ]
      .filter((value: number | null | undefined) => value !== null && value !== undefined)
      .join(', ');

    // Descripción completa
    const descripcion = `Recolección de ${recoleccion.tipo_material.toLowerCase()} de ${recoleccion.planta?.especie || recoleccion.nombre_comercial} realizada por ${nombreUsuario} el ${fechaStr} a las ${horaStr} en ${ubicacionCompleta || coordenadas}. Cantidad: ${recoleccion.cantidad} ${recoleccion.unidad}`;

    // Construir attributes
    const attributes = [
      { trait_type: 'ID', value: recoleccion.codigo_trazabilidad },
      { trait_type: 'Usuario', value: nombreUsuario },
      { trait_type: 'Tipo', value: 'Recoleccion' },
      { trait_type: 'Fecha', value: fechaStr },
      { trait_type: 'Hora', value: horaStr },
      {
        trait_type: 'Especie',
        value: recoleccion.planta?.especie || recoleccion.nombre_comercial,
      },
      { trait_type: 'Tipo de material', value: recoleccion.tipo_material },
      {
        trait_type: 'Cantidad',
        value: `${recoleccion.cantidad} ${recoleccion.unidad}`,
      },
      { trait_type: 'Metodo', value: recoleccion.metodo?.nombre || 'N/A' },
      { trait_type: 'Estado', value: recoleccion.estado },
      { trait_type: 'Ubicacion', value: ubicacionCompleta },
      { trait_type: 'Coordenadas', value: coordenadas },
    ];

    // Agregar todas las fotos como atributos
    fotos.forEach((foto: any, index: number) => {
      if (foto.url) {
        attributes.push({ trait_type: `Foto ${index + 1}`, value: foto.url });
      }
    });

    return {
      name: `${recoleccion.codigo_trazabilidad} - Recolección de ${recoleccion.planta?.especie || recoleccion.nombre_comercial}`,
      description: descripcion,
      image: imageUrl,
      attributes: attributes,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers de usuario y permisos
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Obtiene el usuario por auth_id. Lanza NotFoundException si no existe.
   */
  private async getUserByAuthId(authId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('usuario')
      .select('id, nombre, rol')
      .eq('auth_id', authId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Usuario con auth_id ${authId} no encontrado`);
    }

    return data as { id: number; nombre: string; rol: string };
  }

  /**
   * Valida que el usuario sea el creador de la recolección o tenga rol ADMIN.
   */
  private assertOwnerOrAdmin(
    recoleccion: { usuario_id: number },
    userId: number,
    userRole: string,
  ): void {
    const role = String(userRole ?? '').toUpperCase();
    if (recoleccion.usuario_id !== userId && role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo el creador de la recolección o un ADMIN pueden realizar esta acción.',
      );
    }
  }

  /**
   * Valida que el usuario tenga rol VALIDADOR o ADMIN (revisores).
   */
  private assertReviewerRole(userRole: string): void {
    const role = String(userRole ?? '').toUpperCase();
    if (!['VALIDADOR', 'ADMIN'].includes(role)) {
      throw new ForbiddenException(
        'Solo usuarios con rol VALIDADOR o ADMIN pueden realizar esta acción.',
      );
    }
  }

  /**
   * Obtiene una recolección cruda por ID (sin enriquecer). Lanza NotFoundException si no existe.
   */
  private async getRawRecoleccion(id: number) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('recoleccion')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Recolección con id ${id} no encontrada`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data;
  }

  /**
   * Ejecuta el flujo de Pinata + Blockchain para una recolección validada.
   * No lanza errores — los captura y loguea, para no perder la validación.
   */
  private async executeBlockchainFlow(
    recoleccionId: number,
    codigoTrazabilidad: string,
    nombreUsuario: string,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    try {
      this.logger.log(`☁️  Blockchain flow: obteniendo datos de recolección ${recoleccionId}...`);

      const findResult = await this.findOne(recoleccionId);
      if (!findResult?.data) {
        this.logger.error('⚠️  No se pudo obtener la recolección para metadata');
        return;
      }

      const recoleccionEnriquecida = findResult.data;

      // Construir JSON NFT
      const metadata = this.buildNFTMetadata(recoleccionEnriquecida, nombreUsuario);

      // Subir a Pinata
      this.logger.log(`📦 Subiendo metadata a IPFS/Pinata para ${codigoTrazabilidad}...`);
      const pinataResult = await this.pinataService.uploadJson(
        metadata,
        `${codigoTrazabilidad}.json`,
      );

      const publicUrl = pinataResult.public_url;
      this.logger.log(`✅ Metadata subido a IPFS: ${publicUrl}`);

      // Mintear NFT
      this.logger.log(`🔗 Minteando NFT en blockchain...`);
      const mintResult = await this.blockchainService.mintNFT(
        '0x2440783D1d86D91118E7e19F62889dDc96775868',
        publicUrl,
      );

      const blockchainUrl = `https://shannon-explorer.somnia.network/token/0x4bb21533f7803BBce74421f6bdfc4B6c57706EA2/instance/${mintResult.tokenId}`;

      this.logger.log(`✅ NFT acuñado. Token ID: ${mintResult.tokenId}`);
      this.logger.log(`🔗 URL Blockchain: ${blockchainUrl}`);

      // Guardar en BD
      const { error: updateError } = await supabase
        .from('recoleccion')
        .update({
          blockchain_url: blockchainUrl,
          token_id: String(mintResult.tokenId),
          transaction_hash: mintResult.transactionHash,
        })
        .eq('id', recoleccionId);

      if (updateError) {
        this.logger.error('⚠️  No se pudo guardar datos de blockchain en BD:', updateError);
      } else {
        this.logger.log('✅ Datos de blockchain guardados en la base de datos');
      }
    } catch (blockchainFlowError) {
      this.logger.error(
        `⚠️  Error en flujo blockchain para recolección ${recoleccionId}:`,
        blockchainFlowError,
      );
      // No lanzar error — la validación ya se guardó correctamente
    }
  }

  private validateDraftFotos(
    files: Array<{
      mimetype?: string;
      size?: number;
      originalname?: string;
      buffer?: Buffer;
    }>,
  ): void {
    if (!files.length) {
      return;
    }

    if (files.length > 5) {
      throw new BadRequestException('Máximo 5 fotos permitidas');
    }

    for (const file of files) {
      if (!Buffer.isBuffer(file.buffer)) {
        throw new BadRequestException(
          'No se pudieron procesar las fotos enviadas. Verifica que el endpoint use multipart/form-data correctamente.',
        );
      }

      const mimeType = String(file.mimetype ?? '').trim().toLowerCase();
      const formato = mimeType.split('/')[1]?.toUpperCase();

      if (!formato || !['JPG', 'JPEG', 'PNG'].includes(formato)) {
        throw new BadRequestException(
          `Formato ${formato || 'DESCONOCIDO'} no permitido. Solo JPG, JPEG, PNG`,
        );
      }

      if (Number(file.size ?? 0) > 5242880) {
        throw new BadRequestException(
          `Archivo ${file.originalname || 'sin_nombre'} supera 5MB`,
        );
      }
    }
  }

  private async appendDraftFotosAsEvidencias(
    recoleccionId: number,
    codigoTrazabilidad: string,
    creadoPorUsuarioId: number,
    files: Array<{
      mimetype?: string;
      size?: number;
      originalname?: string;
      buffer?: Buffer;
    }>,
  ): Promise<{ insertedEvidenceIds: number[]; uploadedPaths: string[] }> {
    const supabase = this.supabaseService.getClient();
    const bucketFotos = 'recoleccion_fotos';
    const tipoEntidadEvidenciaId = 1;

    const { count, error: countError } = await supabase
      .from('evidencias_trazabilidad')
      .select('id', { count: 'exact', head: true })
      .eq('tipo_entidad_id', tipoEntidadEvidenciaId)
      .eq('entidad_id', recoleccionId)
      .is('eliminado_en', null);

    if (countError) {
      this.logger.error(
        '❌ Error al contar evidencias previas del borrador:',
        countError,
      );
      throw new InternalServerErrorException(
        'Error al preparar el guardado de fotos del borrador',
      );
    }

    const uploadedPaths: string[] = [];
    const evidenciasInsert: Array<Record<string, unknown>> = [];
    const timestampBase = Date.now();
    const ordenInicial = Number(count || 0);

    for (const [index, file] of files.entries()) {
      const mimeType = String(file.mimetype ?? '').trim();
      const formato = mimeType.split('/')[1]!.toUpperCase();
      const safeOriginalName = String(file.originalname || `foto_${index + 1}`)
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const rutaStorage = `draft_${recoleccionId}_${timestampBase}_${index}_${safeOriginalName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketFotos)
        .upload(rutaStorage, file.buffer!, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        this.logger.error('❌ Error al subir foto de borrador:', uploadError);
        throw new InternalServerErrorException(
          'Error al subir fotos del borrador',
        );
      }

      uploadedPaths.push(rutaStorage);

      const storageObjectId =
        typeof uploadData?.id === 'string' ? uploadData.id : null;
      const hashSha256 = createHash('sha256')
        .update(file.buffer!)
        .digest('hex');
      const orden = ordenInicial + index;

      evidenciasInsert.push({
        tipo_entidad_id: tipoEntidadEvidenciaId,
        entidad_id: recoleccionId,
        codigo_trazabilidad: codigoTrazabilidad,
        bucket: bucketFotos,
        ruta_archivo: supabase.storage.from(bucketFotos).getPublicUrl(rutaStorage).data.publicUrl,
        storage_object_id: storageObjectId,
        tipo_archivo: 'FOTO',
        mime_type: mimeType,
        tamano_bytes: Number(file.size ?? 0),
        hash_sha256: hashSha256,
        titulo: `Foto ${orden + 1}`,
        metadata: {
          origen: 'UPDATE_DRAFT',
          formato,
        },
        es_principal: orden === 0,
        orden,
        creado_por_usuario_id: creadoPorUsuarioId,
      });
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('evidencias_trazabilidad')
      .insert(evidenciasInsert)
      .select('id');

    if (insertError) {
      this.logger.error(
        '❌ Error al registrar evidencias del borrador:',
        insertError,
      );
      throw new InternalServerErrorException(
        'Error al guardar fotos del borrador',
      );
    }

    const insertedEvidenceIds = (insertedData || [])
      .map((item: any) => Number(item.id))
      .filter((evidenceId) => Number.isInteger(evidenceId) && evidenceId > 0);

    return { insertedEvidenceIds, uploadedPaths };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Métodos de flujo de estados
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Edita un borrador de recolección.
   * Solo se puede editar si está en BORRADOR o RECHAZADO.
   * Si está en RECHAZADO, al guardar vuelve a BORRADOR.
   */
  async updateDraft(
    id: number,
    dto: UpdateDraftDto,
    authId: string,
    userRole: string,
    files: Array<{
      mimetype?: string;
      size?: number;
      originalname?: string;
      buffer?: Buffer;
    }> = [],
  ) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.getUserByAuthId(authId);
    const recoleccion = await this.getRawRecoleccion(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (
      estadoActual !== EstadoRegistro.BORRADOR &&
      estadoActual !== EstadoRegistro.RECHAZADO
    ) {
      throw new BadRequestException(
        `No se puede editar una recolección en estado ${estadoActual}. Solo se puede editar en BORRADOR o RECHAZADO.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.assertOwnerOrAdmin({ usuario_id: recoleccion.usuario_id as number }, usuario.id, userRole);
    this.validateDraftFotos(files);

    // Construir payload de actualización
    const updatePayload: Record<string, unknown> = {};

    if (dto.fecha !== undefined) updatePayload.fecha = dto.fecha;
    if (dto.cantidad !== undefined) updatePayload.cantidad = dto.cantidad;
    if (dto.unidad !== undefined) updatePayload.unidad = dto.unidad;
    if (dto.tipo_material !== undefined) updatePayload.tipo_material = dto.tipo_material;
    if (dto.observaciones !== undefined) updatePayload.observaciones = dto.observaciones;
    if (dto.vivero_id !== undefined) updatePayload.vivero_id = dto.vivero_id;
    if (dto.metodo_id !== undefined) updatePayload.metodo_id = dto.metodo_id;
    if (dto.planta_id !== undefined) updatePayload.planta_id = dto.planta_id;

    // Si estaba RECHAZADO, volver a BORRADOR
    if (estadoActual === EstadoRegistro.RECHAZADO) {
      updatePayload.estado_registro = EstadoRegistro.BORRADOR;
      this.logger.log(`📝 Recolección ${id}: RECHAZADO → BORRADOR (edición de borrador)`);
    }

    if (Object.keys(updatePayload).length === 0 && files.length === 0) {
      throw new BadRequestException('No se enviaron campos para actualizar.');
    }

    const rollbackPayload = Object.keys(updatePayload).reduce(
      (accumulator, key) => {
        accumulator[key] = (recoleccion as Record<string, unknown>)[key];
        return accumulator;
      },
      {} as Record<string, unknown>,
    );

    let recoleccionActualizada = false;
    let insertedEvidenceIds: number[] = [];
    let uploadedPaths: string[] = [];

    try {
      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from('recoleccion')
          .update(updatePayload)
          .eq('id', id);

        if (updateError) {
          this.logger.error('❌ Error al actualizar borrador:', updateError);
          throw new InternalServerErrorException('Error al actualizar borrador');
        }

        recoleccionActualizada = true;
      }

      if (files.length > 0) {
        const appendResult = await this.appendDraftFotosAsEvidencias(
          id,
          String(recoleccion.codigo_trazabilidad ?? ''),
          usuario.id,
          files,
        );

        insertedEvidenceIds = appendResult.insertedEvidenceIds;
        uploadedPaths = appendResult.uploadedPaths;
      }
    } catch (error) {
      if (insertedEvidenceIds.length > 0) {
        await supabase
          .from('evidencias_trazabilidad')
          .delete()
          .in('id', insertedEvidenceIds);
      }

      if (uploadedPaths.length > 0) {
        await supabase.storage.from('recoleccion_fotos').remove(uploadedPaths);
      }

      if (recoleccionActualizada && Object.keys(rollbackPayload).length > 0) {
        await supabase.from('recoleccion').update(rollbackPayload).eq('id', id);
      }

      throw error;
    }

    this.logger.log(
      `✅ Recolección ${id} actualizada como borrador${files.length > 0 ? ` y ${files.length} foto(s) agregada(s)` : ''}`,
    );
    return this.findOne(id);
  }

  /**
   * Envía una recolección a validación.
   * Solo se permite si está en BORRADOR.
   */
  async submitForValidation(
    id: number,
    authId: string,
    userRole: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.getUserByAuthId(authId);
    const recoleccion = await this.getRawRecoleccion(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (estadoActual !== EstadoRegistro.BORRADOR) {
      throw new BadRequestException(
        `Solo se puede enviar a validación una recolección en BORRADOR. Estado actual: ${estadoActual}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.assertOwnerOrAdmin({ usuario_id: recoleccion.usuario_id as number }, usuario.id, userRole);

    const { error: updateError } = await supabase
      .from('recoleccion')
      .update({ estado_registro: EstadoRegistro.PENDIENTE_VALIDACION })
      .eq('id', id);

    if (updateError) {
      this.logger.error('❌ Error al enviar a validación:', updateError);
      throw new InternalServerErrorException('Error al enviar a validación');
    }

    this.logger.log(`✅ Recolección ${id}: BORRADOR → PENDIENTE_VALIDACION`);
    return this.findOne(id);
  }

  /**
   * Aprueba la validación de una recolección.
   * Solo VALIDADOR o ADMIN. Solo si está en PENDIENTE_VALIDACION.
   * Ejecuta Pinata + Blockchain después de la validación.
   */
  async approveValidation(
    id: number,
    authId: string,
    userRole: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.getUserByAuthId(authId);

    this.assertReviewerRole(userRole);

    const recoleccion = await this.getRawRecoleccion(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (estadoActual !== EstadoRegistro.PENDIENTE_VALIDACION) {
      throw new BadRequestException(
        `Solo se puede aprobar una recolección en PENDIENTE_VALIDACION. Estado actual: ${estadoActual}`,
      );
    }

    // Actualizar a VALIDADO
    const { error: updateError } = await supabase
      .from('recoleccion')
      .update({
        estado_registro: EstadoRegistro.VALIDADO,
        usuario_validacion_id: usuario.id,
        fecha_validacion: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      this.logger.error('❌ Error al aprobar validación:', updateError);
      throw new InternalServerErrorException('Error al aprobar validación');
    }

    this.logger.log(`✅ Recolección ${id}: PENDIENTE_VALIDACION → VALIDADO (por usuario ${usuario.id})`);

    // Ejecutar Pinata + Blockchain (no bloquea si falla)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const codigoTrazabilidad = String(recoleccion.codigo_trazabilidad ?? '');
    await this.executeBlockchainFlow(id, codigoTrazabilidad, usuario.nombre);

    return this.findOne(id);
  }

  /**
   * Rechaza la validación de una recolección.
   * Solo VALIDADOR o ADMIN. Solo si está en PENDIENTE_VALIDACION.
   */
  async rejectValidation(
    id: number,
    authId: string,
    userRole: string,
    dto: RejectValidationDto,
  ) {
    const supabase = this.supabaseService.getClient();
    await this.getUserByAuthId(authId);

    this.assertReviewerRole(userRole);

    const recoleccion = await this.getRawRecoleccion(id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (estadoActual !== EstadoRegistro.PENDIENTE_VALIDACION) {
      throw new BadRequestException(
        `Solo se puede rechazar una recolección en PENDIENTE_VALIDACION. Estado actual: ${estadoActual}`,
      );
    }

    const { error: updateError } = await supabase
      .from('recoleccion')
      .update({
        estado_registro: EstadoRegistro.RECHAZADO,
        usuario_validacion_id: null,
        fecha_validacion: null,
        motivo_rechazo: dto.motivo_rechazo,
      })
      .eq('id', id);

    if (updateError) {
      this.logger.error('❌ Error al rechazar validación:', updateError);
      throw new InternalServerErrorException('Error al rechazar validación');
    }

    this.logger.log(`✅ Recolección ${id}: PENDIENTE_VALIDACION → RECHAZADO. Motivo: ${dto.motivo_rechazo}`);
    return this.findOne(id);
  }

  /**
   * Lista recolecciones en PENDIENTE_VALIDACION (para panel de validadores).
   * - Si userRole es VALIDADOR o ADMIN: devuelve TODAS las recolecciones pendientes de todos los usuarios
   * - Si userRole es otro (ej. GENERAL/VOLUNTARIO): devuelve solo las recolecciones pendientes del usuario autenticado
   */
  async findPendingValidation(
    filters: FiltersRecoleccionDto,
    authId: string,
    userRole: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;

    // Determinar si el usuario tiene rol global de validación (VALIDADOR o ADMIN)
    const esRolGlobal = ['VALIDADOR', 'ADMIN'].includes(userRole.toUpperCase());

    let query = supabase
      .from('recoleccion')
      .select(this.getCanonicalRecoleccionSelect(), { count: 'exact' })
      .eq('estado_registro', EstadoRegistro.PENDIENTE_VALIDACION);

    // Si NO es rol global, filtrar por el usuario autenticado
    if (!esRolGlobal) {
      const { data: usuarioData, error: usuarioError } = await supabase
        .from('usuario')
        .select('id')
        .eq('auth_id', authId)
        .single();

      if (usuarioError || !usuarioData) {
        throw new NotFoundException(`Usuario con auth_id ${authId} no encontrado`);
      }

      query = query.eq('usuario_id', usuarioData.id);
    }

    query = query
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.fecha_inicio) {
      query = query.gte('fecha', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      query = query.lte('fecha', filters.fecha_fin);
    }

    if (filters.tipo_material) {
      query = query.eq('tipo_material', filters.tipo_material);
    }

    const searchTerm = filters.search ?? filters.q;
    const normalizedSearch = searchTerm?.trim();
    if (normalizedSearch) {
      const plantIds = await this.findPlantIdsBySearchTerm(normalizedSearch);
      const orConditions = [
        `codigo_trazabilidad.ilike.%${normalizedSearch}%`,
        `observaciones.ilike.%${normalizedSearch}%`,
      ];

      if (plantIds.length > 0) {
        orConditions.push(`planta_id.in.(${plantIds.join(',')})`);
      }

      query = query.or(orConditions.join(','));
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error('❌ Error al obtener recolecciones pendientes:', error);
      throw new InternalServerErrorException(
        'Error al obtener recolecciones pendientes de validación',
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);
    const enrichedData = await this.enrichRecoleccionesWithUbicaciones(data || []);
    const evidenciasMap = await this.getEvidenciasMapByRecoleccionIds(
      enrichedData.map((item: any) => Number(item.id)),
    );
    const finalData = enrichedData.map((item: any) =>
      this.mapRecoleccionToCanonicalResponse(
        item,
        evidenciasMap.get(Number(item.id)) || [],
      ),
    );

    return {
      success: true,
      data: finalData,
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
   * Obtiene todas las recolecciones del usuario autenticado con filtros
   */
  async findAll(authId: string, filters: FiltersRecoleccionDto) {
    const supabase = this.supabaseService.getClient();

    // Buscar el ID numérico del usuario usando su auth_id
    const { data: usuarioData, error: usuarioError } = await supabase
      .from('usuario')
      .select('id')
      .eq('auth_id', authId)
      .single();

    if (usuarioError || !usuarioData) {
      throw new NotFoundException(
        `Usuario con auth_id ${authId} no encontrado`,
      );
    }

    const userId = usuarioData.id;

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50); // Máximo 50
    const offset = (page - 1) * limit;

    let query = supabase
      .from('recoleccion')
      .select(this.getCanonicalRecoleccionSelect(), { count: 'exact' })
      .eq('usuario_id', userId) // ⚠️ FILTRO AUTOMÁTICO POR USUARIO
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    // Aplicar filtros opcionales

    if (filters.fecha_inicio) {
      query = query.gte('fecha', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      query = query.lte('fecha', filters.fecha_fin);
    }

    if (filters.vivero_id) {
      query = query.eq('vivero_id', filters.vivero_id);
    }

    if (filters.tipo_material) {
      query = query.eq('tipo_material', filters.tipo_material);
    }

    const searchTerm = filters.search ?? filters.q;
    const normalizedSearch = searchTerm?.trim();
    if (normalizedSearch) {
      const plantIds = await this.findPlantIdsBySearchTerm(normalizedSearch);
      const orConditions = [
        `codigo_trazabilidad.ilike.%${normalizedSearch}%`,
        `observaciones.ilike.%${normalizedSearch}%`,
      ];

      if (plantIds.length > 0) {
        orConditions.push(`planta_id.in.(${plantIds.join(',')})`);
      }

      query = query.or(orConditions.join(','));
    }

    // Aplicar paginación
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error al obtener recolecciones:', error);
      throw new InternalServerErrorException('Error al obtener recolecciones');
    }

    const totalPages = Math.ceil((count || 0) / limit);
    const enrichedData = await this.enrichRecoleccionesWithUbicaciones(data || []);
    const evidenciasMap = await this.getEvidenciasMapByRecoleccionIds(
      enrichedData.map((item: any) => Number(item.id)),
    );
    const finalData = enrichedData.map((item: any) =>
      this.mapRecoleccionToCanonicalResponse(
        item,
        evidenciasMap.get(Number(item.id)) || [],
      ),
    );

    return {
      success: true,
      data: finalData,
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
   * Obtiene todas las recolecciones por vivero con filtros
   */
  async findByVivero(viveroId: number, filters: FiltersRecoleccionDto) {
    const supabase = this.supabaseService.getClient();

    const { data: vivero, error: viveroError } = await supabase
      .from('vivero')
      .select('id')
      .eq('id', viveroId)
      .single();

    if (viveroError || !vivero) {
      throw new NotFoundException('Vivero no encontrado');
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 10, 50);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('recoleccion')
      .select(this.getCanonicalRecoleccionSelect(), { count: 'exact' })
      .eq('vivero_id', viveroId)
      .eq('estado_registro', EstadoRegistro.VALIDADO)
      .not('token_id', 'is', null)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.fecha_inicio) {
      query = query.gte('fecha', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      query = query.lte('fecha', filters.fecha_fin);
    }

    if (filters.tipo_material) {
      query = query.eq('tipo_material', filters.tipo_material);
    }

    const searchTerm = filters.search ?? filters.q;
    const normalizedSearch = searchTerm?.trim();
    if (normalizedSearch) {
      const plantIds = await this.findPlantIdsBySearchTerm(normalizedSearch);
      const orConditions = [
        `codigo_trazabilidad.ilike.%${normalizedSearch}%`,
        `observaciones.ilike.%${normalizedSearch}%`,
      ];

      if (plantIds.length > 0) {
        orConditions.push(`planta_id.in.(${plantIds.join(',')})`);
      }

      query = query.or(orConditions.join(','));
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error al obtener recolecciones por vivero:', error);
      throw new InternalServerErrorException(
        'Error al obtener recolecciones por vivero',
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);
    const enrichedData = await this.enrichRecoleccionesWithUbicaciones(data || []);
    const evidenciasMap = await this.getEvidenciasMapByRecoleccionIds(
      enrichedData.map((item: any) => Number(item.id)),
    );
    const finalData = enrichedData.map((item: any) =>
      this.mapRecoleccionToCanonicalResponse(
        item,
        evidenciasMap.get(Number(item.id)) || [],
      ),
    );

    return {
      success: true,
      data: finalData,
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
   * Obtiene una recolección por ID con todas sus relaciones
   */
  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await supabase
      .from('recoleccion')
      .select(
        `
        ${this.getCanonicalRecoleccionSelect()}
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Recolección no encontrada');
    }

    const enrichedData = await this.enrichSingleRecoleccion(data);
    const evidencias = await this.getEvidenciasByRecoleccionId(id);
    const canonicalData = this.mapRecoleccionToCanonicalResponse(
      enrichedData,
      evidencias,
    );

    return {
      success: true,
      data: canonicalData,
    };
  }

  private getCanonicalRecoleccionSelect(): string {
    return `
      id,
      fecha,
      created_at,
      cantidad,
      unidad,
      tipo_material,
      especie_nueva,
      observaciones,
      usuario_id,
      ubicacion_id,
      vivero_id,
      metodo_id,
      planta_id,
      codigo_trazabilidad,
      blockchain_url,
      token_id,
      transaction_hash,
      estado_registro,
      unidad_canonica,
      cantidad_inicial_canonica,
      usuario_validacion_id,
      fecha_validacion,
      blockchain_hash_validacion,
      usuario:usuario_id (id, nombre, apellido, username, correo),
      vivero:vivero_id (id, codigo, nombre, ubicacion_id),
      metodo:metodo_id (id, nombre, descripcion),
      planta:planta_id (
        id,
        especie,
        nombre_cientifico,
        variedad,
        nombre_comun_principal,
        nombres_comunes,
        imagen_url,
        notas,
        tipo_planta_id
      )
    `;
  }

  private async findPlantIdsBySearchTerm(searchTerm: string): Promise<number[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('planta')
      .select('id')
      .or(
        `nombre_cientifico.ilike.%${searchTerm}%,nombre_comun_principal.ilike.%${searchTerm}%,especie.ilike.%${searchTerm}%`,
      );

    if (error) {
      this.logger.error('❌ Error al buscar plantas para filtro search:', error);
      throw new InternalServerErrorException('Error al filtrar recolecciones');
    }

    return (data || [])
      .map((item: any) => Number(item.id))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private async getEvidenciasMapByRecoleccionIds(recoleccionIds: number[]) {
    const supabase = this.supabaseService.getClient();
    const map = new Map<number, any[]>();

    const ids = Array.from(
      new Set(
        recoleccionIds.filter(
          (id) => Number.isInteger(id) && Number(id) > 0,
        ),
      ),
    );

    if (ids.length === 0) {
      return map;
    }

    const { data, error } = await supabase
      .from('evidencias_trazabilidad')
      .select(
        `
        id,
        tipo_entidad_id,
        entidad_id,
        codigo_trazabilidad,
        bucket,
        ruta_archivo,
        storage_object_id,
        tipo_archivo,
        mime_type,
        tamano_bytes,
        hash_sha256,
        titulo,
        descripcion,
        metadata,
        es_principal,
        orden,
        tomado_en,
        creado_en,
        actualizado_en
      `,
      )
      .eq('tipo_entidad_id', 1)
      .in('entidad_id', ids)
      .is('eliminado_en', null)
      .order('entidad_id', { ascending: true })
      .order('es_principal', { ascending: false })
      .order('orden', { ascending: true })
      .order('creado_en', { ascending: true });

    if (error) {
      this.logger.error('❌ Error al obtener evidencias de recolecciones:', error);
      throw new InternalServerErrorException(
        'Error al obtener evidencias de recolecciones',
      );
    }

    for (const evidencia of data || []) {
      const recoleccionId = Number((evidencia as any).entidad_id);
      if (!map.has(recoleccionId)) {
        map.set(recoleccionId, []);
      }

      const rutaArchivo = String((evidencia as any).ruta_archivo ?? '');
      let publicUrl: string;
      if (rutaArchivo.startsWith('http')) {
        publicUrl = rutaArchivo;
      } else {
        const { data: publicUrlData } = supabase.storage
          .from((evidencia as any).bucket)
          .getPublicUrl(rutaArchivo);
        publicUrl = publicUrlData.publicUrl;
      }

      map.get(recoleccionId)!.push({
        ...(evidencia as any),
        public_url: publicUrl,
      });
    }

    return map;
  }

  private mapRecoleccionToCanonicalResponse(recoleccion: any, evidencias: any[]) {
    const cantidad = Number(recoleccion.cantidad ?? 0);
    const estadoDetalle = cantidad > 0 ? 'ABIERTO' : 'CERRADO';
    const nombreCientifico = recoleccion.planta?.nombre_cientifico ?? null;
    const nombreComunPrincipal =
      recoleccion.planta?.nombre_comun_principal ?? null;

    const fotos = evidencias.map((evidencia: any) => ({
      id: evidencia.id,
      url: evidencia.public_url,
      es_principal: evidencia.es_principal,
      orden: evidencia.orden,
      titulo: evidencia.titulo,
      descripcion: evidencia.descripcion,
      mime_type: evidencia.mime_type,
      tamano_bytes: evidencia.tamano_bytes,
    }));

    // Banderas de permisos basadas en estado_registro
    const estado = String(recoleccion.estado_registro ?? '').toUpperCase();
    const canEdit = estado === 'BORRADOR' || estado === 'RECHAZADO';
    const canSubmitForValidation = estado === 'BORRADOR';
    const canApprove = estado === 'PENDIENTE_VALIDACION';
    const canReject = estado === 'PENDIENTE_VALIDACION';

    return {
      ...recoleccion,
      nombre_cientifico: nombreCientifico,
      nombre_comercial: nombreComunPrincipal,
      nombre_comun_principal: nombreComunPrincipal,
      estado_detalle: estadoDetalle,
      evidencias,
      fotos,
      // Banderas de permisos para el frontend
      can_edit: canEdit,
      can_submit_for_validation: canSubmitForValidation,
      can_approve: canApprove,
      can_reject: canReject,
    };
  }

  private async getEvidenciasByRecoleccionId(recoleccionId: number) {
    const evidenciasMap = await this.getEvidenciasMapByRecoleccionIds([
      recoleccionId,
    ]);
    return evidenciasMap.get(recoleccionId) || [];
  }

  private async validateAndNormalizeUbicacionPayload(
    ubicacion: CreateUbicacionDto,
  ) {
    const supabase = this.supabaseService.getClient();
    let paisId = ubicacion.pais_id ?? null;

    if (ubicacion.division_id) {
      const { data: divisionData, error: divisionError } = await supabase
        .from('division_administrativa')
        .select('id, pais_id')
        .eq('id', ubicacion.division_id)
        .single();

      if (divisionError || !divisionData) {
        throw new NotFoundException('División administrativa no encontrada');
      }

      const divisionPaisId = Number(divisionData.pais_id);

      if (paisId && paisId !== divisionPaisId) {
        throw new BadRequestException(
          'division_id no pertenece al pais_id enviado',
        );
      }

      paisId = divisionPaisId;
    }

    if (paisId) {
      const { data: paisData, error: paisError } = await supabase
        .from('pais')
        .select('id')
        .eq('id', paisId)
        .single();

      if (paisError || !paisData) {
        throw new NotFoundException('País no encontrado');
      }
    }

    return {
      pais_id: paisId,
      division_id: ubicacion.division_id ?? null,
      nombre: ubicacion.nombre?.trim() || null,
      referencia: ubicacion.referencia?.trim() || null,
      latitud: ubicacion.latitud,
      longitud: ubicacion.longitud,
      precision_m: ubicacion.precision_m ?? null,
      fuente: ubicacion.fuente ?? null,
    };
  }

  private async enrichSingleRecoleccion(recoleccion: any) {
    const mapped = await this.enrichRecoleccionesWithUbicaciones([recoleccion]);
    return mapped[0];
  }

  private async enrichRecoleccionesWithUbicaciones(recolecciones: any[]) {
    const ubicacionIds = recolecciones.flatMap((recoleccion: any) => {
      const ids: number[] = [];
      if (Number.isInteger(recoleccion.ubicacion_id) && recoleccion.ubicacion_id > 0) {
        ids.push(recoleccion.ubicacion_id);
      }
      if (
        Number.isInteger(recoleccion.vivero?.ubicacion_id) &&
        recoleccion.vivero.ubicacion_id > 0
      ) {
        ids.push(recoleccion.vivero.ubicacion_id);
      }
      return ids;
    });

    const ubicaciones = await this.ubicacionesReadService.getUbicacionesByIds(
      ubicacionIds,
    );

    return recolecciones.map((recoleccion: any) => {
      const mapped = {
        ...recoleccion,
        ubicacion_id: recoleccion.ubicacion_id,
        ubicacion: ubicaciones.get(recoleccion.ubicacion_id) || null,
        vivero: recoleccion.vivero
          ? {
              ...recoleccion.vivero,
              ubicacion:
                ubicaciones.get(recoleccion.vivero.ubicacion_id) || null,
            }
          : null,
      };

      return mapped;
    });
  }
}
