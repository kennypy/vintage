# Vintage.br — Project Guidelines

## Project Overview
Vintage.br is a Vinted-style peer-to-peer secondhand fashion marketplace for Brazil. Mobile-first (React Native/Expo), NestJS backend, PostgreSQL, PIX payments.

## Tech Stack
- **Mobile**: React Native (Expo) — PRIMARY platform
- **Web**: Next.js 14+ (TypeScript) — secondary
- **API**: NestJS (TypeScript) + Prisma ORM
- **DB**: PostgreSQL + Redis
- **Search**: Meilisearch
- **Payments**: Mercado Pago SDK (PIX primary)
- **Shipping**: Correios + Jadlog APIs

## Monorepo Structure
```
apps/mobile/    — React Native (Expo) iOS + Android
apps/web/       — Next.js frontend
apps/api/       — NestJS backend
packages/shared/ — Shared types, utils, validation
```

## Language & Locale
- All user-facing text in Portuguese (BR)
- Currency: BRL (R$), format: 1.234,56
- Postal codes: CEP format NNNNN-NNN
- Clothing sizes: P, M, G, GG, XG + numeric

---

## Security Standards

All code changes MUST comply with the following security standards. These are mandatory, not optional.

### SSRF Prevention
All outbound HTTP requests to user-provided URLs (e.g., webhooks, seller links) must:
- Validate scheme is `http` or `https`
- Resolve the hostname and reject private, loopback, link-local, and reserved IP addresses
- Validate at both input time (creation) and request time (delivery) to defend against DNS rebinding

### No String-Interpolated JSON
Always use `JSON.stringify()` (TypeScript) to construct JSON responses. Never use template literals, string concatenation, or `f-strings` to build JSON — this causes injection vulnerabilities.

### Secret Management
- Never use insecure default values for secrets in production
- All secrets (JWT_SECRET, database passwords, S3 credentials, Redis passwords, Mercado Pago API keys) must come from environment variables
- Startup must fail with a clear error if critical secrets use default values outside `NODE_ENV=development`
- Never commit secrets to version control, including in `.env` files, Dockerfiles, or test fixtures

### CSRF Protection
- CSRF tokens are required on all state-changing endpoints (POST, PUT, DELETE)
- CSRF validation is skipped ONLY when the `X-API-Key` header is present (API clients are immune to CSRF)
- Never rely on Origin or Referer header detection to decide whether to enforce CSRF — these headers can be stripped

### Content Security Policy & CORS
- Never add `'unsafe-inline'` to `script-src` in the CSP header
- `'unsafe-inline'` is acceptable for `style-src` only when necessary
- Never use `data:` in `img-src`
- CORS `allowHeaders` must be an explicit allowlist (e.g., `["Content-Type", "X-API-Key", "X-CSRF-Token"]`), never `["*"]`
- CORS `allowMethods` must list only the methods actually used

### Rate Limiting
- Rate limit bucket keys must use a hash of the full API key (`crypto.createHash('sha256')`), not a prefix or substring
- This prevents cross-user rate limit bucket collisions

### Memory Safety for File Uploads
- File uploads (listing photos) must be read in chunks with early abort when the size limit is exceeded
- Never load an entire upload into memory before checking its size
- Enforce maximum: 20 photos per listing, 10MB per photo

### SQL Injection Prevention
- Always use Prisma ORM with parameterized queries
- Never construct raw SQL with template literals, string concatenation, or interpolation
- If raw SQL is truly necessary, use Prisma `$queryRaw` with tagged template literals (auto-parameterized)

### Authentication & Authorization
- All API endpoints (except `/health` and public listing views) must require authentication
- All database queries for user data must filter by `userId` to enforce tenant isolation — users must never be able to access another user's orders, wallet, messages, or API keys
- New endpoints must validate the authenticated user owns the resource being accessed

### Password & API Key Hashing
- Use bcrypt for all password hashing
- Use `crypto.randomBytes(32).toString('hex')` for API key generation — never use `Math.random`, `uuid`, or other non-cryptographic sources
- Never store plaintext passwords or API keys in the database

### Input Validation
- Validate all input with class-validator decorators (NestJS DTOs) or Zod schemas
- Validate file MIME types using magic bytes, not file extensions
- Sanitize uploaded filenames to strip path traversal characters (`\x00`, `/`, `\\`) and limit length
- Enforce configurable limits for file size and image dimensions
- Validate CPF format using Modulo 11 algorithm before accepting

### Subprocess Safety
- Always use array-based command construction for child processes — never use `shell: true`
- Never interpolate user input directly into command arguments
- Always set a timeout on subprocess calls

### Security Headers
All HTTP responses must include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (see CSP rules above)

### S3/Storage Encryption
- All S3 uploads (listing images) must include `ServerSideEncryption: AES256`
- Presigned URLs must have bounded expiry times (configurable via `PRESIGNED_URL_EXPIRY`)
- Never generate presigned URLs without an expiry

### Webhook Signatures
- All webhook payloads (payment confirmations, shipping updates) must be verified using HMAC-SHA256
- Verify Mercado Pago webhook signatures before processing payment events

### Error Handling
- Never expose internal stack traces, file paths, or system details in API error responses
- Truncate error messages before including them in responses (e.g., `String(e).slice(0, 200)`)
- Use structured logging for internal error details, not HTTP response bodies

### Docker Security
- Containers must run as a non-root user
- Do not expose unnecessary ports
- Do not embed production secrets in Dockerfiles or docker-compose files
- Use multi-stage builds to minimize image attack surface

### Database Connections
- Use SSL in production for database connections
- Configure connection pool limits to prevent resource exhaustion

### Dependency Security
- Run `npm audit` in CI to catch known vulnerabilities
- Keep dependencies pinned and regularly updated
- Review new dependencies for security implications before adding them

### Logging
- Use structured JSON logging
- Never log secrets, API keys, passwords, PIX keys, or CPF numbers
- Include request IDs in log entries for audit trail correlation
- Log security-relevant events (authentication failures, CSRF rejections, SSRF blocks, failed payment attempts)

### Payment Security (PIX & Mercado Pago)
- Never store raw PIX keys or payment credentials in logs or database
- Always verify payment webhook signatures before processing
- Validate payment amounts match order totals before confirming
- Use idempotency keys for all payment operations to prevent double-charges
- Implement payment amount ceiling checks to detect anomalies
