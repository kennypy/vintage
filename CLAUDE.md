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

## Development Workflow

### MANDATORY: Pre-Push Gate — `./scripts/ci-parity.sh` (or `npm run ci:parity`)

**Every `git push` MUST be preceded by a green run of the pre-push gate. One command. No exceptions.**

```bash
# Full run — mirrors .github/workflows/ci.yml exactly: nukes every cache,
# reinstalls from lockfile with npm ci, runs every CI step under
# `set -o pipefail` so real exit codes are captured.
./scripts/ci-parity.sh

# --fast is for tight edit/verify loops — keeps node_modules but still
# clears .turbo and apps/web/.next. CI does not have a fast mode;
# NEVER trust --fast as the final pre-push gate.
./scripts/ci-parity.sh --fast

# Windows / portable equivalent — same steps, same order, implemented in
# Node so it runs without bash (PowerShell, cmd.exe, git-bash, WSL all OK).
# The Node runner (scripts/ci-parity.mjs) and the .sh runner MUST stay in
# sync: adding a step to one means adding it to the other in the same commit.
npm run ci:parity         # full run
npm run ci:parity:fast    # --fast
```

Exit `0` = safe to push. Exit `1` = do not push; the failing step's last 40 log lines are printed to stderr and the full log is in `.ci-parity-logs/`.

The script runs, in order, a faithful reproduction of `.github/workflows/ci.yml`:

1. `npm ci` (NEVER `npm install`)
2. `npx turbo build --filter=@vintage/shared --force`
3. `npx prisma generate` in `apps/api`
4. `npx turbo lint --force`
5. `npx tsc -p apps/api/tsconfig.json --noEmit`
6. `npx turbo test --force` with CI env (`DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=test`)
7. `npx turbo build --filter=@vintage/api --force`
8. `npx turbo build --filter=@vintage/web --force`
9. `npm audit --audit-level=high`

**If you add a new step to `.github/workflows/ci.yml`, add the equivalent to `scripts/ci-parity.sh` in the same position.** The two files are meant to stay byte-for-byte equivalent in what they check.

#### Anti-patterns that have broken CI in the past (never repeat)

These are the concrete shortcuts that caused "green locally, red on CI" incidents on this branch. The ci-parity script refuses every one of them; this table exists so reviewers and future-you understand why.

| Shortcut I took | How it broke CI | Why the script can't take it |
|-----------------|-----------------|------------------------------|
| Read `$?` after piping turbo through `tail` | `$?` was tail's exit (always 0); turbo's real failure was laundered to a false green | Every step runs under `set -o pipefail` inside `bash -c` |
| Reused existing `node_modules` across checks | Fresh `npm ci` picks up stricter lint-plugin minor versions the reused tree didn't have — new errors only appeared on CI | Script deletes `node_modules` and runs `npm ci` before any check |
| Trusted turbo's cached result | Turbo replayed a stale PASS even when sources changed; Next.js `.next/cache` did the same for the web build | `--force` on every turbo command; `.turbo/` and `apps/web/.next/` nuked beforehand |
| Skipped `npx prisma generate` after editing `schema.prisma` | ts-jest compiled against the pre-edit Prisma client, so code referencing a renamed compound key built locally and failed on CI | Script always regenerates before typecheck/tests |
| Suppressed an ESLint rule the package's config doesn't register (e.g. `eslint-disable-next-line react-hooks/exhaustive-deps` in a web config that never added `eslint-plugin-react-hooks`) | ESLint errors "Definition for rule not found" | Lint runs against the real config; the script fails at step 4 |
| Used `npm install` instead of `npm ci` | Permissive install occasionally drifted the lockfile, producing different transitive versions than CI | Script always uses `npm ci` |
| Backgrounded a turbo run and read the launcher's "exit 0" notification | Same effect as the pipefail trap — the launcher reported the last piped command's exit, not turbo's | Script is foreground-only; each exit comes directly from `bash -c` |

If ANY step fails, you MUST fix it before pushing. Do not skip steps. Do not use `--no-verify`. Do not force push over failures.

### Common Failure Causes and Fixes

| Failure | Cause | Fix |
|---------|-------|-----|
| `ESLint couldn't find an eslint.config` | Missing config | Every package needs `eslint.config.mjs` |
| `--ext` flag error | ESLint v9 removed `--ext` | Lint scripts must use `eslint .` not `eslint . --ext .ts` |
| `No tests found, exiting with code 1` | Jest has no test files | Use `jest --passWithNoTests` in package.json test script |
| `Cannot find module '@vintage/shared'` | Shared not built | Run `npx turbo build --filter=@vintage/shared` first |
| `Cannot find module '@prisma/client'` | Prisma not generated | Run `npx prisma generate` in `apps/api/` |
| Unused variable error | ESLint strict mode | Prefix with `_` (e.g., `_id`, `_body`, `_req`) |
| Import error for `.css` or assets | TypeScript strict | Ensure `next-env.d.ts` exists for web, proper tsconfig for each app |
| `useContext` null error in Next.js build | React 19 + Next.js pages router conflict | Web app MUST use React 18.3.x + Next.js 14.x. Never upgrade to React 19. |
| `peer dep` conflict on install | Mismatched ESLint / Next versions | Web uses standalone `eslint.config.mjs`, does NOT need `eslint-config-next` |
| Stale `node_modules` after version change | npm didn't update hoisted deps | `rm -rf node_modules && npm ci` (NEVER delete `package-lock.json` — CI uses `npm ci` and needs a matching lockfile) |
| "Definition for rule X was not found" on CI lint | Added `// eslint-disable-next-line X` for a rule the package's ESLint config doesn't register | Either register the plugin that provides the rule, or remove the suppression — the rule isn't firing anyway |
| Ts-jest compile error on a compound Prisma key | Edited `schema.prisma` without regenerating the client | `cd apps/api && npx prisma generate` (or just run `./scripts/ci-parity.sh`, which does this) |
| "Green locally, red on CI" in general | Cache reuse, piped exit codes, or stale generated code | Always verify with `./scripts/ci-parity.sh` (no `--fast`) before pushing |

### ESLint Configuration
- All packages use ESLint v9 **flat config** format (`eslint.config.mjs`)
- TypeScript linted with `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`
- Unused variables/params must be prefixed with `_` (e.g., `_id`, `_body`)
- All lint scripts in package.json use `eslint .` — never use deprecated `--ext` flag
- JS config files (postcss.config.js, etc.) are ignored in web eslint config

### Test Configuration
- All test scripts use `jest --passWithNoTests` to avoid failing when no test files exist yet
- API tests use `ts-jest` with `testRegex: .*\.spec\.ts$`
- Mobile tests use `jest-expo` preset
- Web and shared use echo placeholders until tests are added

### Pinned Versions (DO NOT CHANGE)
- **Web app**: `next@14.2.x` + `react@18.3.1` + `react-dom@18.3.1` — React 19 breaks the Next.js pages router error pages
- **Mobile app**: `react@18.3.1` (pinned by Expo)
- **ESLint**: v9 flat config — do NOT add `eslint-config-next` (requires ESLint 8)

### README Maintenance
- **Always update `README.md`** when making changes that affect the project structure, setup instructions, available scripts, API modules, database models, or tech stack
- Examples of changes that require a README update: adding a new API module, adding a new app or package, changing the database schema significantly, adding new environment variables, changing how to run the project
- Keep the README in Portuguese (BR) to match the project locale
- The README should always reflect the current state of the project — not aspirational features

### Env Var Source of Truth
- `apps/api/.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example` are the CANONICAL lists. Any new env var MUST be added to the appropriate file in the same PR
- `DEPLOYMENT.md` §6 (Fly secrets) is the deployment-time mirror; it must stay in sync with `apps/api/.env.example`. When in doubt, trust `.env.example`
- Feature-flag envs are grouped in `.env.example` with their flip checklist inline (e.g. `CAPTCHA_ENFORCE`, `IDENTITY_VERIFICATION_ENABLED`, `IDENTITY_DOCUMENT_ENABLED`, `MERCADOPAGO_PAYOUT_ENABLED`). Flipping any of them has a user-facing consequence — read the comment before setting

### Mobile–Web Feature Parity
- **Every feature, improvement, or bug fix added to the mobile app (`apps/mobile/`) MUST also be implemented in the web app (`apps/web/`), and vice-versa.**
- When adding a new screen or feature to one platform, create the equivalent page/component on the other platform in the same PR.
- Shared types should live in `packages/shared/` whenever possible.
- If a feature genuinely cannot apply to one platform (e.g., push notifications on web, or browser-only APIs), document the exception in the PR description.

### Commit Hygiene
- Run the full pre-push checklist above before every commit that will be pushed
- Do not commit code with lint errors
- Fix warnings — they should not accumulate
- Never commit `.env` files, secrets, API keys, or credentials
- Never commit `node_modules/`, `.next/`, `dist/`, or `.expo/`

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

### Vendor Consolidation (MANDATORY)
- **Prefer an existing vendor over a new one** whenever the existing vendor can cover the new need with equivalent quality. Smaller vendor surface = fewer credentials to rotate, fewer SDKs to patch, fewer billing lines, fewer incident-response runbooks.
- Before proposing a second vendor for an overlapping capability, explicitly check what every currently-integrated vendor already does. Concrete example: Google Vision is already wired for listing autofill (labels/logos/web/OCR/colors), so image moderation goes through Google Vision's `SAFE_SEARCH_DETECTION` — do NOT add AWS Rekognition.
- If the existing vendor is genuinely insufficient, document the specific gap in the PR description (what feature the existing vendor lacks) before pulling in a new one.
- When a request naturally implies "add vendor X", treat that as a hypothesis to disprove, not a spec.

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
