# Vintage.br — Plano Pós-Lançamento de Atualização de Dependências

**Status atual (2026-04-18, pós Wave 3A + 3B):** o gate foi **elevado para
`--audit-level=high`**. 0 vulns `high` em prod AND dev após o NestJS 10→11
+ multer v2 + nodemailer v8 + bcrypt v6 + dedupe.

**Também resolvido em 3B:** Redis-backed ThrottlerStorage substituiu o
default in-memory — rate limits agora sobrevivem a escala horizontal da
API (ver `apps/api/src/common/throttler/redis-throttler.storage.ts`).

Este documento passa a ser uma referência histórica do caminho percorrido
+ backlog de moderadas/baixas que podem ser endereçadas quando conveniente.

> **Atualizado em:** 2026-04-18, imediatamente após o lançamento da Wave 2.
> Rode `npm audit --audit-level=high --omit=dev` antes de abrir a PR de
> atualização para capturar o estado vigente.

---

## Categorização rápida

| Severidade | Prod/Dev | Caminho do fix | Prioridade |
|------------|----------|----------------|------------|
| HIGH | prod | `multer` → v2 (via `@nestjs/platform-express@11.1.19`) | **P0** |
| HIGH | prod | `lodash` → 4.17.21+ (via `@nestjs/config@4.1.x` + `@nestjs/swagger@11.3.x`) | **P0** |
| HIGH | prod | `nodemailer` → 8.x | **P0** |
| HIGH | prod | `bcrypt` 5 → 6 (remove `@mapbox/node-pre-gyp → tar`) | **P1** |
| HIGH | prod | `@hono/node-server` → 1.19.13+ (via `prisma` CLI) | **P2** (CLI-only, não bloqueia startup) |
| MOD | prod | `@nestjs/core` cross-site injection patch | **P0** mesmo sendo moderado |
| MOD | prod | `file-type` (DoS via ZIP bomb) | **P1** |
| MOD | prod | `js-yaml` (prototype pollution) | **P2** — só carregado pelo Swagger |
| HIGH | dev | `glob` CLI injection (via `@nestjs/cli`) | P3 — dev tooling, não roda em prod |
| HIGH | dev | `picomatch`, `webpack`, `tmp` (via `@nestjs/cli`) | P3 |
| HIGH | dev | `tar` (via `bcrypt@5 → node-pre-gyp`) — resolvido ao completar P1 | — |

Números aproximados (corra o comando acima para o valor do dia). Os `P3` dev
deps serão arrastados no mesmo ciclo quando atualizarmos `@nestjs/cli → 11`.

---

## Ordem de execução (uma PR por P)

Antes e depois de CADA PR: `./scripts/ci-parity.sh` tem que passar 100%
limpo. Se algum passo falhar, reverta o bump e abra issue.

### P0.1 — `multer` + `@nestjs/platform-express` + `@nestjs/core`

```bash
# No apps/api/
npm install \
  @nestjs/core@^11.1.19 \
  @nestjs/platform-express@^11.1.19 \
  @nestjs/common@^11 \
  @nestjs/testing@^11 \
  --workspace=@vintage/api
```

**Riscos:** NestJS 11 é a major atual — `@nestjs/core@11` é compatível com
`@nestjs/platform-express@11`. APIs de guards/interceptors permanecem, mas
`Reflector.getAllAndOverride` mudou signature em algumas minor releases —
auditar uso.

**Smoke test:**
- Todos os endpoints de upload (`/uploads/*`, `/users/me/identity-document`)
  aceitam multipart corretamente.
- WebSocket gateway de mensagens sobe sem erro no startup.

### P0.2 — `lodash` → 4.17.21+ (via swagger + config)

```bash
npm install @nestjs/config@^4 @nestjs/swagger@^11.3 --workspace=@vintage/api
```

**Riscos:** `@nestjs/config` mudou o comportamento default de caching entre
3.x e 4.x; confirme que `ConfigService.get` sem default usado em main.ts
continua devolvendo `undefined` e não string vazia.

**Smoke test:**
- `main.ts` ainda aborta com msg clara se `JWT_SECRET` etc. faltarem.
- `/docs` (Swagger) carrega.

### P0.3 — `nodemailer` → 8

```bash
npm install nodemailer@^8 --workspace=@vintage/api
npm install --save-dev @types/nodemailer@^8 --workspace=@vintage/api
```

**Riscos:** A correção principal em 8.x é validação estrita de CRLF em
cabeçalhos SMTP. Nosso EmailService só monta `from`/`to`/`subject`/`html` a
partir de dados controlados pelo servidor, então o risco de breakage é
baixo. Teste o fluxo de alteração de email (Wave 1).

### P1.1 — `bcrypt` 5 → 6 (remove `node-pre-gyp` → elimina `tar`)

```bash
npm install bcrypt@^6 --workspace=@vintage/api
```

**Riscos:** API do `bcrypt.hash` e `.compare` é idêntica. O npm binário
muda para `@napi-rs/node-gyp-build`; se o runner CI tiver uma glibc antiga,
o binário pré-compilado pode não funcionar — teste no Node 22 / Ubuntu
24.04 (match com `setup-node@v4`).

**Smoke test:**
- Registro + login existentes funcionam (`bcrypt.compare` bem-sucedido
  contra hashes gerados pelo `bcrypt@5`).
- Migra a suite de testes de autenticação (`auth.service.spec.ts`).

### P1.2 — `file-type` patch via deps Nest

Vem de graça com P0.1/P0.2 na árvore de `@nestjs/common`. Confirme com:
```bash
npm ls file-type
```

### P2 — `@hono/node-server` (atinge só Prisma CLI)

```bash
npm install prisma@^6.20 @prisma/client@^6.20
cd apps/api && npx prisma generate
```

Prisma 6.20+ usa `@hono/node-server@1.19.13+`. Sem impacto em runtime de
produção — o hono só roda no Prisma Studio.

### P2.2 — `js-yaml`

Tracked pelo `@nestjs/swagger` bump. Sem ação extra.

### P3 — `@nestjs/cli@^11` + transitive dev deps

Dev-only. Não bloqueia produção. Agendar junto com próxima atualização
grande de NestJS no workspace.

---

## Subindo o gate

Quando P0 + P1 + P2 estiverem em produção e o audit mostrar **0 `high` em
prod**:

1. Editar `.github/workflows/ci.yml`: `--audit-level=critical` → `--audit-level=high`
   no job `security-audit` (etapa bloqueante).
2. Editar `scripts/ci-parity.sh`: mesma mudança no step 9.
3. Editar `CLAUDE.md`: marcar "CI gate = high" na seção Anti-patterns.
4. Rodar `./scripts/ci-parity.sh`. Exit 0? Pode mergear.

---

## Fixação de deps (pinned)

Não alterar (quebra o build em produção):

- `next@14.2.x` + `react@18.3.1` + `react-dom@18.3.1` — React 19 quebra o
  error page do Next.js pages router. Documentado em CLAUDE.md.
- `react@18.3.1` no mobile — pinned pelo Expo SDK 51.
- `eslint@9` flat config — subir para 10 quando `eslint-config-next` e
  `@typescript-eslint` suportarem.

---

## Processo de revisão

- Abra a PR com o comando `npm audit --audit-level=high --omit=dev`
  antes/depois colado no corpo.
- Anexe o output de `./scripts/ci-parity.sh` (arquivo `.ci-parity-logs/`)
  no PR description.
- Faça um smoke test manual mínimo (Wave 1 fluxos críticos: auth,
  compra, saque) seguindo [LOCAL_TEST_PLAN.md](./LOCAL_TEST_PLAN.md).
