import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { execSync } from 'child_process';
import * as path from 'path';
import { AppModule } from './app.module';

function runMigrations() {
  try {
    const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch (e) {
    console.error('[migrations] prisma migrate deploy failed:', String(e).slice(0, 300));
    // Non-fatal in development — server still starts, stale columns cause runtime errors
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // Auto-apply pending migrations in development so devs don't need to run
  // `prisma migrate deploy` manually after pulling new code.
  if (nodeEnv !== 'production') {
    runMigrations();
  }

  // Security: fail if critical secrets use defaults in production
  if (nodeEnv === 'production') {
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret === 'CHANGE_ME_IN_PRODUCTION') {
      throw new Error('JWT_SECRET must be set to a secure value in production');
    }
    const csrfSecret = config.get<string>('CSRF_SECRET');
    if (!csrfSecret || csrfSecret === 'CHANGE_ME_IN_PRODUCTION') {
      throw new Error('CSRF_SECRET must be set to a secure value in production');
    }
  }

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'https:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      xFrameOptions: { action: 'deny' },
    }),
  );

  // CORS — explicit allowlist
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  app.enableCors({
    origin: corsOrigin.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token', 'X-Request-ID'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger docs (dev only)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Vintage.br API')
      .setDescription('API para o marketplace Vintage.br')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`🚀 Vintage.br API running on port ${port}`);
  if (nodeEnv !== 'production') {
    console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  }
}

bootstrap();
