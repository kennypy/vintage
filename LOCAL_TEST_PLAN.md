# Vintage.br — Plano de Teste Local (Smoke Test)

Uma passada end-to-end pelo app antes de pushar algo "grande" (merge em
main, release candidate, mudança de schema). Não substitui os testes
automatizados em `./scripts/ci-parity.sh` — complementa.

**Tempo estimado:** 30–45 min para o caminho feliz completo.

---

## 0. Pré-requisitos

```bash
# Subir tudo local
docker compose up -d                     # Postgres + Redis + Meilisearch
npm ci                                   # Instala deps (match lockfile)
(cd apps/api && npx prisma migrate dev)  # Schema + migrations
(cd apps/api && npx ts-node prisma/seed.ts)  # Categorias + marcas
npm run dev                              # API + Web + Mobile (em três terminais se preferir)
```

- API: http://localhost:3001
- Web: http://localhost:3000
- Mobile: rode `npm run dev --workspace=@vintage/mobile` e escaneie o QR com Expo Go

**⚠ Variáveis de ambiente em dev.** Deixe `TWILIO_*` e `MERCADOPAGO_*` em
branco; o app loga OTPs/webhooks no console em vez de chamar os serviços
externos. O `main.ts` do API só bloqueia `NODE_ENV=production` com essas
faltando.

---

## 1. Cadastro + login (email/senha)

- [ ] Web: criar conta em `/auth/register` com CPF válido (ex: `529.982.247-25`).
- [ ] Confirma redirecionamento para `/` com sessão ativa.
- [ ] Sign out → sign in em `/auth/login` com as mesmas credenciais → sessão restaurada.
- [ ] Mobile: mesma jornada em `/(auth)/register` e `/(auth)/login`.

## 2. Cadastro + login (OAuth)

- [ ] Web: `/auth/login` → **Entrar com Google** (staging OAuth app).
- [ ] Usuário é criado com `cpf=null`, `cpfVerified=false`.
- [ ] No header/conta aparece a chamada "Adicionar CPF".
- [ ] Mobile: mesma jornada. Testar também Apple Sign In no iOS Simulator.

## 3. 2FA TOTP (Wave 2A)

- [ ] Conta autenticada → `/conta/seguranca` → **Configurar com app autenticador**.
- [ ] Escaneia QR no Google Authenticator / Authy / 1Password.
- [ ] Digita código de 6 dígitos → `twoFaEnabled=true`.
- [ ] Logout → login → recebe desafio → digita código → sessão completa.
- [ ] Desativar: `/conta/seguranca` → **Desativar** com código TOTP atual.

## 4. 2FA SMS (Wave 2A)

- [ ] Em `/conta/seguranca` → **Configurar por SMS**.
- [ ] Informa `+5511999998888` (ou qualquer BR válido) → recebe código.
  - **Dev**: código aparece no console do API (`SMS 2FA code: NNNNNN`).
  - **Prod**: chega via Twilio para o número informado.
- [ ] Digita código → `twoFaMethod=SMS`.
- [ ] Logout → login → desafio mostra **"Enviamos para +55 •• ••••-8888"**
      (DDD mascarado — confere [2B/2A revisão de leak](./THIRD_PARTY_ONBOARDING.md)).
- [ ] Botão **Reenviar** respeita cooldown (30s) e limite horário (5).

## 5. Criação de anúncio

- [ ] Web: `/sell` → preenche título, categoria, marca, tamanho, preço, fotos (até 20).
- [ ] Anúncio aparece em `/listings` e no perfil público do vendedor.
- [ ] Upload de vídeo 30s MP4 funciona.

## 6. Ofertas

- [ ] Comprador (outra conta) envia oferta em um anúncio (≥50% do preço).
- [ ] Vendedor vê em `/conta/ofertas` → aceita → anúncio muda para status de aceita.
- [ ] Rejeita oferta abaixo do mínimo → erro "valor mínimo".

## 7. Mensagens (WebSocket)

- [ ] Comprador abre conversa no anúncio → envia mensagem.
- [ ] Vendedor vê em `/chat` em tempo real (Socket.io).
- [ ] Bloqueio aparece quando qualquer lado bloqueia o outro.

## 8. Bloqueio de usuário (Wave 2C)

- [ ] Comprador → perfil do vendedor → `···` → **Bloquear usuário**.
- [ ] Banner vermelho aparece, botão de seguir fica desabilitado.
- [ ] Tentar enviar DM → backend responde com erro.
- [ ] `/conta/blocked-users` lista o usuário com data de bloqueio.
- [ ] **Desbloquear** pela lista → usuário some da lista, interações voltam.
- [ ] Mobile: mesma jornada via `/(auth)/seller/[id]` e `/conta/blocked-users`.

## 9. Adicionar CPF (Wave 2D)

- [ ] Conta OAuth sem CPF → `/conta/cpf` → formata ao digitar.
- [ ] CPF inválido (ex: `111.111.111-11`) → erro Módulo 11.
- [ ] CPF já cadastrado em outra conta → erro uniforme
      ("Não foi possível cadastrar..."). **Confirma que a msg não vaza
      qual caso ocorreu** (enumeração).
- [ ] CPF válido → tela passa para modo read-only com máscara `•••.•••.•••-NN`.
- [ ] **Tentar cadastrar de novo** (refazer submissão) → erro uniforme.

## 10. Compra + carteira

- [ ] Comprador → anúncio → **Comprar agora** → checkout PIX.
- [ ] Dev: webhook simulado via Mercado Pago sandbox; Prod: PIX real.
- [ ] Pedido confirma → listing fica `SOLD`.
- [ ] Vendedor: carteira credita após confirmação.
- [ ] Cancelamento do comprador (Wave 1) antes da confirmação → listing
      volta para `ACTIVE` **apenas se ainda estava `SOLD`** (Wave 1 fix
      para resurrection).

## 11. Saques PIX com métodos salvos (Wave 2B)

- [ ] `/conta/payout-methods` → cadastrar chave PIX (CPF, email, phone, random).
- [ ] Tenta cadastrar a MESMA chave com tipo diferente → erro "chave já cadastrada".
- [ ] Limite: cadastrar 5 chaves → 6ª retorna erro de limite.
- [ ] `/wallet` → **Sacar** → seleciona chave salva (não pergunta chave crua).
- [ ] Valor > saldo → erro "saldo insuficiente".
- [ ] Valor < R$10 → erro "valor mínimo".
- [ ] **Concorrência**: dois saques de 80 reais em paralelo contra saldo
      100 — um sucede, o outro recebe "saldo insuficiente" (não deixa
      negativo). Verificável com `wrk`/curl+xargs ou manualmente com
      duas abas.

## 12. Alteração de email (Wave 1)

- [ ] `/conta/alterar-email` → digita novo email + senha.
- [ ] Email de confirmação chega (dev: console; prod: Resend/SMTP).
- [ ] Link no email → email efetivamente muda.
- [ ] Antigo email recebe notificação ("seu email foi alterado para X").

## 13. Perfis, favoritos, feed

- [ ] Favoritar um anúncio → aparece em `/conta/favoritos`.
- [ ] Seguir vendedor → `/feed` mostra anúncios dele.
- [ ] Vacation mode no vendedor → anúncios ficam `PAUSED`.

## 14. Busca

- [ ] Meilisearch rodando (docker-compose) → busca em `/listings?q=...`.
- [ ] Filtros (tamanho, categoria, preço) funcionam.

## 15. Admin (se aplicável)

- [ ] Conta com `role=ADMIN` → `/admin/users` mostra lista, promoção,
      banimento.
- [ ] Autenticidade (Wave 1) → admin aprova/rejeita.
- [ ] `/admin/image-flags` — SafeSearch LIKELY fila; DISMISS + REJECT
      resolvem e a imagem some do Meilisearch (quando REJECT).
- [ ] `/admin/fraud-flags` — FraudFlag pendentes; resolução DISMISS
      vs. REVIEWED registra no audit log.

## 16. Verificação de identidade (Tracks A/B/C)

- [ ] `User.cpfChecksumValid` = true após `setCpf` com CPF Modulo-11
      válido. `User.cpfIdentityVerified` continua `false`.
- [ ] `POST /wallet/payout` com `cpfIdentityVerified=false` retorna
      `BadRequestException` com mensagem "Verificação de identidade
      pendente".
- [ ] Web: tentar saque em `/wallet` → app redireciona para
      `/conta/verificacao`. Mobile: Alert com CTA "Verificar agora".
- [ ] `/conta/verificacao` com `IDENTITY_VERIFICATION_ENABLED=false`
      mostra mensagem `CONFIG_ERROR` (azul, não vermelho — distingue
      config de erro do usuário).
- [ ] Com `IDENTITY_VERIFICATION_ENABLED=true` + Serpro sandbox:
      CPF + name + DOB válidos → `VERIFIED`, flag flipa, audit row
      escrita em `CpfVerificationLog`.
- [ ] Mismatch deliberado (nome errado) → `NAME_MISMATCH`, flag NÃO
      flipa, botão "Verificar por documento" aparece.
- [ ] `IDENTITY_DOCUMENT_ENABLED=true` + Caf sandbox: botão abre
      redirect URL (nova aba no web, WebView no mobile). Completar o
      fluxo → webhook em `/webhooks/caf` flipa
      `cpfIdentityVerified=true` + marca `CafVerificationSession` como
      `APPROVED`. Assinatura HMAC inválida retorna 401.

## 17. LGPD + retenção

- [ ] `POST /users/me/export` retorna ZIP com user.json + orders +
      listings + messages + payout-methods (PIX mascarado) +
      receipt.json com SHA256. PayoutMethod.pixKey NUNCA aparece cru.
- [ ] `DELETE /users/me` via `/conta/deletar-conta`: confirmação
      "EXCLUIR" + senha → soft-delete, token atual invalidado,
      `User.deletedAt` setado.
- [ ] Crons de retenção (02:00 / 05:00 UTC, ou forçar em dev):
      `LoginEvent`, `ProcessedWebhook`, `ListingImageFlag`
      (non-PENDING only), `FraudFlag` (non-PENDING only),
      `CpfVerificationLog`, `CafVerificationSession` (non-PENDING) —
      todos respeitando suas envs de retenção.
- [ ] S3 orphan sweep: listing com `status=DELETED` há > 30d e SEM
      `OrderListingSnapshot` ativo → cron deleta as S3 keys +
      hard-deletes o Listing. Listing com snapshot ativo → sweep pula.

## 18. Captcha + moderação de imagens

- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset (dev) → `/auth/register`
      mostra hint "Turnstile desativado"; backend no-op.
- [ ] Site key + `CAPTCHA_ENFORCE=true` → register sem resolver o
      widget retorna 403.
- [ ] Upload de foto "normal" → passa; `GOOGLE_VISION_API_KEY`
      configurado + foto obviamente explícita → 400 "rejeitada pela
      moderação automática", nada gravado em S3.
- [ ] Foto borderline (LIKELY) → upload sucede, `ListingImageFlag`
      row criada, aparece em `/admin/image-flags`.

## 19. Deep links + analytics

- [ ] `GET https://<web>/.well-known/apple-app-site-association`
      retorna JSON com `appIDs` = `<APPLE_TEAM_ID>.br.vintage.app`;
      503 com mensagem clara quando `APPLE_TEAM_ID` não setado.
- [ ] `GET /.well-known/assetlinks.json` análogo para
      `ANDROID_CERT_SHA256`.
- [ ] `POSTHOG_API_KEY` configurado + criar usuário → evento
      `user_registered` aparece no dashboard PostHog dentro de ~10s
      (flush interval).

---

## Verificação técnica final

```bash
# Confirma que nada quebrou
./scripts/ci-parity.sh           # full run, 9 passos
```

Exit 0 = safe to push. Mais detalhes em
[CLAUDE.md — Pre-Push Gate](./CLAUDE.md#mandatory-pre-push-gate--scriptsci-paritysh).
