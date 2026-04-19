import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { execSync } from 'child_process';
import * as path from 'path';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

function runMigrations() {
  try {
    const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch (e) {
    logger.error(`prisma migrate deploy failed: ${String(e).slice(0, 300)}`);
    // Non-fatal in development — server still starts, stale columns cause runtime errors
  }
}

async function bootstrap() {
  // rawBody: true enables req.rawBody on routes that ask for it
  // (@RawBodyRequest). Required for HMAC-SHA256 webhook signature
  // verification — signatures are computed against the exact bytes
  // the sender transmitted, and re-stringifying the parsed JSON would
  // re-order keys / change spacing and break verification (or, worse,
  // accept a forged payload whose stringified form happened to match).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // Behind a load balancer / CDN / reverse proxy (Fly.io, Cloudflare, nginx),
  // req.ip resolves to the last proxy in the chain unless Express is told how
  // many hops to trust. Without this, every request looks like it came from
  // the proxy's IP → the per-IP rate-limit bucket collides across users and
  // a single attacker exhausts the limit for everyone behind the proxy (DoS).
  // Setting the hop count too high is equally bad: it lets an attacker spoof
  // any IP via X-Forwarded-For. The env var makes the trusted depth explicit
  // per deployment (Fly.io = 1, Fly behind Cloudflare = 2, local dev = 0).
  const trustedProxyHops = Number(
    config.get<string>('TRUSTED_PROXY_HOPS', nodeEnv === 'production' ? '1' : '0'),
  );
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0) {
    throw new Error(
      `TRUSTED_PROXY_HOPS must be a non-negative integer (got ${trustedProxyHops}).`,
    );
  }
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyHops);

  // Auto-apply pending migrations in development so devs don't need to run
  // `prisma migrate deploy` manually after pulling new code.
  if (nodeEnv !== 'production') {
    runMigrations();
  }

  // Security: fail if critical secrets use defaults in production
  if (nodeEnv === 'production') {
    const requiredSecrets = [
      { key: 'JWT_SECRET', label: 'JWT signing secret' },
      { key: 'CSRF_SECRET', label: 'CSRF protection secret' },
      { key: 'MERCADOPAGO_ACCESS_TOKEN', label: 'Mercado Pago access token' },
      { key: 'MERCADOPAGO_WEBHOOK_SECRET', label: 'Mercado Pago webhook secret' },
      { key: 'NFE_API_KEY', label: 'NF-e API key' },
      { key: 'CORREIOS_TOKEN', label: 'Correios API token' },
      { key: 'DATABASE_URL', label: 'Database connection string' },
      // Twilio is required because SMS 2FA is a first-class login factor —
      // silent fallback to dev-mode "log code to console" in production would
      // expose OTPs via stdout logs and lock SMS-2FA users out of the app.
      { key: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID (SMS 2FA)' },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token (SMS 2FA)' },
      { key: 'TWILIO_FROM_NUMBER', label: 'Twilio sender number (E.164, SMS 2FA)' },
    ];

    const missing: string[] = [];
    for (const { key, label } of requiredSecrets) {
      const value = config.get<string>(key);
      if (!value || value === 'CHANGE_ME_IN_PRODUCTION') {
        missing.push(`  - ${key} (${label})`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing required production secrets:\n${missing.join('\n')}`,
      );
    }

    const optionalSecrets = [
      'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
      'APPLE_CLIENT_ID',
      'S3_ACCESS_KEY', 'S3_SECRET_KEY',
    ];
    for (const key of optionalSecrets) {
      if (!config.get<string>(key)) {
        logger.warn(`Optional secret ${key} is not set — related features will be unavailable`);
      }
    }
  }

  // Cookie parser — required for the HttpOnly session cookies the auth
  // controller sets after login/refresh. Sits before helmet/CSRF so both
  // can introspect req.cookies. signed: false because we don't use
  // signed cookies; the session cookie itself carries a JWT (HMAC-signed)
  // and the CSRF cookie is a separate HMAC token.
  app.use(cookieParser());

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
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: nodeEnv === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: true,
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity:
        nodeEnv === 'production'
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
    }),
  );

  // CORS — explicit allowlist with wildcard rejection.
  // Production MUST provide CORS_ORIGIN. In non-prod, fall back to localhost dev origins.
  const rawCorsOrigin = config.get<string>('CORS_ORIGIN', '');
  if (nodeEnv === 'production' && !rawCorsOrigin) {
    throw new Error(
      'CORS_ORIGIN must be set in production (comma-separated allowlist).',
    );
  }
  const corsOrigins = (rawCorsOrigin || (nodeEnv !== 'production' ? 'http://localhost:3000' : ''))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Hard-fail if any configured origin is a wildcard or an invalid URL
  for (const origin of corsOrigins) {
    if (origin === '*') {
      throw new Error(
        'CORS_ORIGIN cannot be "*". Provide an explicit comma-separated allowlist.',
      );
    }
    try {
      new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN contains an invalid URL: ${origin}`);
    }
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-CSRF-Token',
      'X-Request-ID',
      'X-Partner-Key',
    ],
    exposedHeaders: ['X-CSRF-Token', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
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
  logger.log(`Vintage.br API running on port ${port}`);
  if (nodeEnv !== 'production') {
    logger.log(`Swagger docs: http://localhost:${port}/docs`);
  }
}

bootstrap();
