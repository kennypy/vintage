import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
// `cookie-parser` is a pure-CJS module that exports the middleware as
// `module.exports`. Under our tsconfig (esModuleInterop=false) a default
// import compiles to `cookie_parser_1.default(...)` at runtime, and
// cookie-parser doesn't ship a `.default` alias — so the prod build
// booted by `node dist/src/main.js` threw `default is not a function`
// and the API never came up. (DAST finding D-01 from pen-test track 2.)
// `import = require` emits a plain `require()` call and works on every
// Node + TS combo we ship.
import cookieParser = require('cookie-parser');
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { JsonSyntaxExceptionFilter } from './common/filters/json-syntax.filter';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { assertSafeInternalEndpointAtStartup } from './common/services/url-validator';

const logger = new Logger('Bootstrap');

function runMigrations() {
  // spawnSync with `shell: true` so Windows can resolve `npx` → `npx.cmd`
  // via PATHEXT (Node won't find a bare `npx` on Win32 otherwise). The
  // schemaPath is wrapped in double quotes because `path.join` emits
  // backslash separators on Windows and the install path may contain
  // spaces (e.g. `C:\Users\John Doe\...`). cmd.exe treats backslash as a
  // literal inside double quotes, and posix shells never see a backslash
  // path here, so the same quoted form is safe on every platform.
  // `__dirname` is `apps/api/dist/src` after `nest build`. The Prisma
  // schema is NOT copied into dist, it lives at `apps/api/prisma/`.
  // Going up one level only reaches `apps/api/dist/`, which has no
  // `prisma/schema.prisma` — the CLI then errors with
  // `Could not load --schema from provided path dist/prisma/schema.prisma`
  // and dev migrations silently never run. Going up two levels lands
  // at `apps/api/` on both the compiled build and `ts-node` runs.
  // When invoked via `ts-node` from `apps/api/src` we still need to
  // go up once; probe both layouts and pick whichever one resolves.
  const candidates = [
    path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    path.join(__dirname, '..', 'prisma', 'schema.prisma'),
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  const result = spawnSync(
    `npx prisma migrate deploy --schema="${schemaPath}"`,
    { stdio: 'inherit', timeout: 60_000, shell: true },
  );
  if (result.error) {
    logger.error(
      `prisma migrate deploy failed to spawn: ${String(result.error).slice(0, 300)}`,
    );
    return;
  }
  if (result.status !== 0) {
    logger.error(
      `prisma migrate deploy exited with code ${result.status ?? 'null'}`,
    );
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

  // SSRF: validate operator-controlled internal endpoints at startup so
  // misconfigurations (e.g. MEILISEARCH_HOST pointed at a metadata IP) are
  // caught at boot, not on the first health probe.
  assertSafeInternalEndpointAtStartup(
    config.get<string>('MEILISEARCH_HOST', ''),
    'MEILISEARCH_HOST',
  );

  // Security: fail if critical secrets use defaults in production
  if (nodeEnv === 'production') {
    const requiredSecrets = [
      { key: 'JWT_SECRET', label: 'JWT signing secret' },
      { key: 'CSRF_SECRET', label: 'CSRF protection secret' },
      { key: 'CPF_ENCRYPTION_KEY', label: 'CPF-at-rest AES-256 key (64 hex chars)' },
      { key: 'CPF_LOOKUP_KEY', label: 'CPF-at-rest HMAC lookup key (64 hex chars)' },
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

    // MEILISEARCH_API_KEY is conditionally required: only when MEILISEARCH_HOST
    // is set (i.e. search is in use). An empty key against a configured host
    // would surface as authentication errors at query time and leave the empty
    // string visible to logs.
    if (config.get<string>('MEILISEARCH_HOST', '')) {
      requiredSecrets.push({ key: 'MEILISEARCH_API_KEY', label: 'Meilisearch API key (search auth)' });
    }

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
          // CSP violation telemetry. Without a report endpoint CSP
          // is flying blind — a new deploy that tries to load from
          // an un-allowlisted CDN, or an XSS probe trying to run
          // inline script, goes unnoticed. `report-uri` is
          // deprecated but still honoured by every current browser;
          // the modern `report-to` directive would pair with a
          // separate `Report-To` / `Reporting-Endpoints` header
          // outside of helmet's CSP option. Start with report-uri
          // for coverage breadth; graduate to report-to once we're
          // scraping the endpoint's log lines routinely.
          'report-uri': ['/api/v1/csp-report'],
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

  // Align X-XSS-Protection with CLAUDE.md §Security Standards
  // (DAST minor observation, track 2). Helmet v7+ emits `0` by default
  // because the old IE/Edge XSS filter caused more harm than it prevented
  // — all current browsers ignore this header. We set `1; mode=block`
  // anyway because the CLAUDE.md spec mandates it, the value is harmless
  // in every modern browser (ignored), and it keeps the prod response
  // surface matching the documented security baseline.
  app
    .getHttpAdapter()
    .getInstance()
    .use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });

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

  // Exception filter chain, most-specific FIRST: JsonSyntaxExceptionFilter
  // catches body-parser SyntaxError before the catch-all maps it to a
  // generic 500. GlobalExceptionFilter is the final backstop that
  // truncates + redacts every other exception before the response hits
  // the wire — including raw driver errors (Prisma, AWS SDK, fetch)
  // whose default `.message` string leaks hostnames / error codes.
  app.useGlobalFilters(
    new GlobalExceptionFilter(),
    new JsonSyntaxExceptionFilter(),
  );

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
