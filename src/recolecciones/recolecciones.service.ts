import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PinataService } from '../pinata/pinata.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { CreateRecoleccionDto } from './dto/create-recoleccion.dto';
import { FiltersRecoleccionDto } from './dto/filters-recoleccion.dto';

@Injectable()
export class RecoleccionesService {
  private readonly logger = new Logger(RecoleccionesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly pinataService: PinataService,
    private readonly blockchainService: BlockchainService,
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
    if (!['ADMIN', 'TECNICO'].includes(userRole)) {
      throw new ForbiddenException(
        'No tienes permisos para crear recolecciones. Solo usuarios con rol ADMIN o TECNICO pueden realizar esta acción.',
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
        .insert({
          pais: createRecoleccionDto.ubicacion.pais,
          departamento: createRecoleccionDto.ubicacion.departamento,
          provincia: createRecoleccionDto.ubicacion.provincia,
          comunidad: createRecoleccionDto.ubicacion.comunidad,
          zona: createRecoleccionDto.ubicacion.zona,
          latitud: createRecoleccionDto.ubicacion.latitud,
          longitud: createRecoleccionDto.ubicacion.longitud,
        })
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
      
      // Generar código de trazabilidad único formato: REC-YYYY-NNN
      const fecha = new Date(createRecoleccionDto.fecha);
      const año = fecha.getFullYear();
      
      // Obtener el conteo de recolecciones del año actual para generar el número secuencial
      const inicioAño = `${año}-01-01`;
      const finAño = `${año}-12-31`;
      
      const { count, error: countError } = await supabase
        .from('recoleccion')
        .select('id', { count: 'exact', head: true })
        .gte('fecha', inicioAño)
        .lte('fecha', finAño);
      
      if (countError) {
        console.error('❌ Error al contar recolecciones:', countError);
        throw new InternalServerErrorException('Error al generar código de trazabilidad');
      }
      
      const numeroSecuencial = ((count || 0) + 1).toString().padStart(3, '0');
      const codigoTrazabilidad = `REC-${año}-${numeroSecuencial}`;
      console.log('🏷️  Código de trazabilidad generado:', codigoTrazabilidad);
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: recoleccionCreada, error: recoleccionError } =
        await supabase
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
          })
          .select()
          .single();

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

      console.log('🎉 ✅ RECOLECCIÓN CREADA EXITOSAMENTE');
      console.log('🌱 ==========================================\n');

      // PASO 6: Subir JSON a Pinata automáticamente
      console.log('☁️  Paso 6: Subiendo metadata a IPFS/Pinata...');
      try {
        // Obtener datos completos de la recolección creada directamente de Supabase
        const { data: recoleccionCompleta, error: fetchError } = await supabase
          .from('recoleccion')
          .select(
            `
            *,
            usuario:usuario_id (id, nombre, username, correo),
            ubicacion:ubicacion_id (*),
            vivero:vivero_id (id, codigo, nombre),
            metodo:metodo_id (id, nombre, descripcion),
            planta:planta_id (*),
            fotos:recoleccion_foto (*)
          `,
          )
          .eq('id', recoleccionId)
          .single();

        if (fetchError || !recoleccionCompleta) {
          throw new Error('No se pudo obtener la recolección para metadata');
        }

        // Construir JSON en formato NFT estándar
        const metadata = this.buildNFTMetadata(
          recoleccionCompleta,
          usuarioData.nombre,
        );

        // Subir a Pinata
        const pinataResult = await this.pinataService.uploadJson(
          metadata,
          `${codigoTrazabilidad}.json`,
        );

        const ipfsUrl = pinataResult.ipfs_url;
        const gatewayUrl = pinataResult.gateway_url;
        const publicUrl = pinataResult.public_url;
        
        // Logs para verificar las URLs
        this.logger.log(`📦 URLs de Pinata:`);
        this.logger.log(`   • IPFS URL: ${ipfsUrl}`);
        this.logger.log(`   • Gateway URL: ${gatewayUrl}`);
        this.logger.log(`   • Public URL: ${publicUrl}`);
        this.logger.log(`✅ Metadata subido a IPFS`);

        // PASO 7: Mintear NFT en blockchain automáticamente
        this.logger.log('🔗 Paso 7: Minteando NFT en blockchain...');
        this.logger.log(`   • Usando URL: ${publicUrl}`);
        try {
          const mintResult = await this.blockchainService.mintNFT(
            '0x2440783D1d86D91118E7e19F62889dDc96775868',
            publicUrl, // Usar public_url que tiene el formato correcto del gateway
          );

          // Construir URL del blockchain explorer
          const blockchainUrl = `https://shannon-explorer.somnia.network/token/0x4bb21533f7803BBce74421f6bdfc4B6c57706EA2/instance/${mintResult.tokenId}`;

          this.logger.log(`✅ NFT acuñado exitosamente. Token ID: ${mintResult.tokenId}`);
          this.logger.log(`🔗 URL Blockchain: ${blockchainUrl}`);

          // Guardar datos de blockchain en la BD
          const { error: blockchainUpdateError } = await supabase
            .from('recoleccion')
            .update({
              blockchain_url: blockchainUrl,
              token_id: String(mintResult.tokenId),
              transaction_hash: mintResult.transactionHash,
            })
            .eq('id', recoleccionId);

          if (blockchainUpdateError) {
            this.logger.error('⚠️  No se pudo guardar datos de blockchain en BD:', blockchainUpdateError);
          } else {
            this.logger.log('✅ Datos de blockchain guardados en la base de datos');
          }
        } catch (blockchainError) {
          this.logger.error('⚠️  Error al mintear NFT:', blockchainError);
          // No lanzamos error, la recolección ya está creada y en IPFS
        }
      } catch (pinataError) {
        this.logger.error('⚠️  Error al subir a Pinata:', pinataError);
        // No lanzamos error aquí, solo logueamos
        // La recolección ya fue creada exitosamente
      }

      console.log('🎉 ✅ PROCESO COMPLETO FINALIZADO');
      console.log('🌱 ==========================================\n');

      // Retornar datos completos (la URL de IPFS ya está guardada en la BD)
      return this.findOne(recoleccionId);
    } catch (error) {
      console.error('❌ Error en creación de recolección:', error);
      throw error;
    }
  }

  /**
   * Construye el JSON metadata en formato NFT estándar
   */
  private buildNFTMetadata(recoleccion: any, nombreUsuario: string) {
    // Obtener foto principal (foto_total o la primera disponible)
    const fotoTotal =
      recoleccion.fotos?.find((f: any) => f.url.includes('total')) ||
      recoleccion.fotos?.[0];
    const fotoLugar =
      recoleccion.fotos?.find((f: any) => f.url.includes('lugar')) ||
      recoleccion.fotos?.[1];

    // Formatear fecha y hora
    const fechaStr = recoleccion.fecha; // Ya viene en formato YYYY-MM-DD
    // Extraer hora del campo created_at que tiene timestamp completo
    const fechaConHora = new Date(recoleccion.created_at);
    const horaStr = fechaConHora.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/La_Paz', // Bolivia timezone
    });

    // Construir ubicación descriptiva
    const ubicacion = [
      recoleccion.ubicacion?.comunidad,
      recoleccion.ubicacion?.departamento,
      recoleccion.ubicacion?.pais,
    ]
      .filter(Boolean)
      .join(', ');

    const ubicacionCompleta = recoleccion.ubicacion?.zona
      ? `${ubicacion} Zona: ${recoleccion.ubicacion.zona}`
      : ubicacion;

    // Construir coordenadas
    const coordenadas = `${recoleccion.ubicacion?.latitud}, ${recoleccion.ubicacion?.longitud}`;

    // Descripción completa
    const descripcion = `Recolección de ${recoleccion.tipo_material.toLowerCase()} de ${recoleccion.planta?.especie || recoleccion.nombre_comercial} realizada por ${nombreUsuario} el ${fechaStr} a las ${horaStr} en ${ubicacion}. Cantidad: ${recoleccion.cantidad} ${recoleccion.unidad}`;

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

    // Agregar fotos si existen
    if (fotoLugar) {
      attributes.push({ trait_type: 'Foto Lugar', value: fotoLugar.url });
    }
    if (fotoTotal) {
      attributes.push({ trait_type: 'Foto Total', value: fotoTotal.url });
    }

    return {
      name: `${recoleccion.codigo_trazabilidad} - Recolección de ${recoleccion.planta?.especie || recoleccion.nombre_comercial}`,
      description: descripcion,
      image: fotoTotal?.url || '',
      attributes: attributes,
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
      .select(
        `
        *,
        usuario:usuario_id (id, nombre, username),
        planta:planta_id (id, especie, nombre_cientifico, variedad),
        ubicacion:ubicacion_id (*),
        metodo:metodo_id (id, nombre, descripcion),
        vivero:vivero_id (id, codigo, nombre, ubicacion:ubicacion_id (departamento, comunidad)),
        fotos:recoleccion_foto (*)
      `,
        { count: 'exact' },
      )
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

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters.vivero_id) {
      query = query.eq('vivero_id', filters.vivero_id);
    }

    if (filters.tipo_material) {
      query = query.eq('tipo_material', filters.tipo_material);
    }

    // Aplicar paginación
    query = query.range(offset, offset + limit - 1);

    // Buscar también por nombre de planta si se envía search o q
    const searchTerm = filters.search ?? filters.q;
    if (searchTerm) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.or(
        `nombre_cientifico.ilike.%${searchTerm}%,nombre_comercial.ilike.%${searchTerm}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error al obtener recolecciones:', error);
      throw new InternalServerErrorException('Error al obtener recolecciones');
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
      .select(
        `
        *,
        usuario:usuario_id (id, nombre, username),
        planta:planta_id (id, especie, nombre_cientifico, variedad),
        ubicacion:ubicacion_id (*),
        metodo:metodo_id (id, nombre, descripcion),
        vivero:vivero_id (id, codigo, nombre, ubicacion:ubicacion_id (departamento, comunidad)),
        fotos:recoleccion_foto (*)
      `,
        { count: 'exact' },
      )
      .eq('vivero_id', viveroId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.fecha_inicio) {
      query = query.gte('fecha', filters.fecha_inicio);
    }

    if (filters.fecha_fin) {
      query = query.lte('fecha', filters.fecha_fin);
    }

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }

    if (filters.tipo_material) {
      query = query.eq('tipo_material', filters.tipo_material);
    }

    const searchTerm = filters.search ?? filters.q;
    if (searchTerm) {
      query = query.or(
        `nombre_cientifico.ilike.%${searchTerm}%,nombre_comercial.ilike.%${searchTerm}%`,
      );
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
   * Obtiene una recolección por ID con todas sus relaciones
   */
  async findOne(id: number) {
    const supabase = this.supabaseService.getClient();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await supabase
      .from('recoleccion')
      .select(
        `
        *,
        usuario:usuario_id (id, nombre, username, correo),
        ubicacion:ubicacion_id (*),
        vivero:vivero_id (id, codigo, nombre),
        metodo:metodo_id (id, nombre, descripcion),
        planta:planta_id (*),
        fotos:recoleccion_foto (*)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Recolección no encontrada');
    }

    return {
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data,
    };
  }
}
