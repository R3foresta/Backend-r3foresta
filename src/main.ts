import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Aumentar límite de tamaño del body (solo para campos de texto largos)
  // NOTA: Las imágenes deben subirse a Supabase Storage, no enviarlas en base64
  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

  // Configurar orígenes CORS
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://pwa-r3foresta.vercel.app',
  ];

  // Agregar orígenes desde variable de entorno si existe
  if (process.env.CORS_ORIGINS) {
    const envOrigins = process.env.CORS_ORIGINS.split(',');
    allowedOrigins.push(...envOrigins);
  }

  // Habilitar CORS
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (como Postman)
      if (!origin) return callback(null, true);
      
      // Verificar si el origin está en la lista o es un subdominio de Vercel
      if (allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️  CORS bloqueado para origen: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-id', 'Accept'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api');

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Reforesta API')
    .setDescription('API REST para el sistema de gestión de recolecciones y viveros forestales')
    .setVersion('1.0')
    .addTag('recolecciones', 'Endpoints para gestión de recolecciones de material vegetal')
    .addTag('plantas', 'Endpoints para gestión de plantas y especies')
    .addTag('viveros', 'Endpoints para gestión de viveros')
    .addTag('auth', 'Endpoints de autenticación y autorización')
    .addTag('comunidades', 'Endpoints CRUD de comunidades administrativas (nivel 4)')
    .addTag('blockchain', 'Endpoints para integración con blockchain')
    .addTag('pinata', 'Endpoints para gestión de IPFS/Pinata')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-auth-id',
        in: 'header',
        description: 'ID de autenticación del usuario (auth_id de Supabase)',
      },
      'x-auth-id',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Backend NestJS corriendo en http://localhost:${port}`);
  console.log(`📚 Documentación Swagger disponible en http://localhost:${port}/api/docs`);
}

void bootstrap();
