# Relatório de Impacto à Proteção de Dados Pessoais (RIPD)

> **STATUS**: ESQUELETO — aguardando preenchimento pelo DPO.
>
> Este documento segue o Art. 38 da LGPD e as diretrizes da ANPD.
> Cada seção contém referências aos pontos de tratamento no código
> (`apps/api/src/...`) para que a análise seja feita sobre o que a
> plataforma **realmente** faz hoje, não sobre intenções arquiteturais.
>
> **Traduzir para inglês em paralelo**: `docs/privacy/ripd.en.md`.

---

## 1. Identificação

| Campo | Valor |
|---|---|
| Nome da empresa / controlador | _A preencher_ |
| CNPJ | _A preencher_ |
| Endereço | _A preencher_ |
| Encarregado (DPO) | _A preencher_ |
| E-mail do DPO | _A preencher_ |
| Data da versão | _A preencher_ |
| Versão | 1.0 |

## 2. Descrição do tratamento

### 2.1 Finalidades

Principais finalidades do tratamento de dados pessoais na Vintage.br:

- Cadastro e autenticação de usuários (compradores e vendedores)
- Processamento de pagamentos via PIX / cartão / boleto (Mercado Pago)
- Emissão de notas fiscais (eNotas / NFe.io)
- Cálculo e solicitação de frete (Correios, Jadlog, Kangu, Pegaki)
- Prevenção de fraude (regras de velocidade, análise de saques)
- Moderação de conteúdo (imagens via Google Vision SafeSearch)
- Comunicação transacional (e-mail, SMS, push)
- Atendimento ao cliente (disputas, reembolsos)

### 2.2 Categorias de dados pessoais tratados

| Categoria | Campo(s) | Onde é coletado | Onde é processado | Onde é armazenado |
|---|---|---|---|---|
| Identificação | nome, e-mail | `auth.service.ts::register` | `users.service.ts` | tabela `User` |
| CPF | `cpf` (11 dígitos) | `users.service.ts::setCpf` | validação Modulo 11 em `@vintage/shared::isValidCPF` | tabela `User`, UNIQUE parcial |
| CNPJ (PJ) | `cnpj` | `users.service.ts` | — | tabela `User` |
| Contato | `phone` | configurações de conta / 2FA SMS | `auth.service.ts::setupSms` | tabela `User` |
| Autenticação | `passwordHash` (bcrypt) | `auth.service.ts::register` | `bcrypt.hash` rounds=12 | tabela `User` |
| 2FA | `twoFaSecret` (TOTP), `twoFaPhone` | `auth.service.ts::setupTotp` / `setupSms` | `otplib`, Twilio | tabela `User` |
| Endereço | CEP, logradouro, número, bairro, cidade, UF | `users.service.ts` | — | tabela `Address` |
| Dados de pagamento | PIX key (mascarada em leitura) | `payout-methods.service.ts::create` | — | tabela `PayoutMethod` |
| Imagens | fotos de produtos | `uploads.service.ts::uploadListingImage` | Sharp resize, Google Vision (LABEL/LOGO/WEB/OCR/COLORS/SAFE_SEARCH) | S3 com SSE AES256 |
| Imagens de moderação | URLs flagged | `uploads.service.ts::flagIfFlagged` | — | tabela `ListingImageFlag` |
| Histórico transacional | pedidos, pagamentos, disputas | `orders.service.ts`, `disputes.service.ts` | — | tabelas `Order`, `Dispute`, `Payment` |
| Snapshot transacional | estado congelado do anúncio no momento da compra | `orders.service.ts::create` | — | tabela `OrderListingSnapshot` |
| Webhooks processados | ID externo (dedupe) | `payments.service.ts::handleWebhook` | — | tabela `ProcessedWebhook` |
| Notas fiscais | CPF, razão social, valor | `notafiscal.service.ts` | provedor externo (Enotas/NFe.io) | tabela `NotaFiscal` |
| Consentimento | aceite de TOS, política de privacidade | `consent.service.ts`, `acceptTos` | — | tabela `Consent`, `User.tosVersion` |
| Audit log de exclusão | razão, timestamp | `users.service.ts::deleteAccount` | — | tabela `DeletionAuditLog` |
| Sinais de fraude | evidência JSON | `fraud.service.ts::createFlag` | — | tabela `FraudFlag` |
| Eventos de sessão | IP, user-agent, timestamp | `auth.service.ts` (login) | — | tabela `LoginEvent` |

### 2.3 Categorias de titulares

- Compradores (pessoas físicas)
- Vendedores (pessoas físicas ou jurídicas — CPF ou CNPJ)
- Administradores / moderadores da plataforma
- Terceiros mencionados em denúncias (caso de denúncias a usuários)

## 3. Base legal (Art. 7 LGPD)

Preencher o fundamento legal para cada finalidade:

| Finalidade | Base legal proposta | Justificativa |
|---|---|---|
| Cadastro e autenticação | Execução de contrato (Art. 7º, V) | _A avaliar pelo DPO_ |
| Pagamentos / PIX | Execução de contrato; cumprimento de obrigação legal (Art. 7º, II — emissão de NF-e) | _A avaliar pelo DPO_ |
| Prevenção de fraude | Legítimo interesse (Art. 7º, IX) | _A avaliar: LIA necessária_ |
| Moderação de imagens | Legítimo interesse | _A avaliar: LIA necessária_ |
| Marketing / comunicação opcional | Consentimento (Art. 7º, I) | _A avaliar pelo DPO_ |
| Atendimento a disputas | Execução de contrato; legítimo interesse | _A avaliar pelo DPO_ |

**ATENÇÃO DPO**: categorias baseadas em legítimo interesse exigem
Avaliação de Legítimo Interesse (LIA) separada para cada uma.

## 4. Fluxos de dados

### 4.1 Origens (de onde os dados entram)

- Cadastro do usuário (`POST /auth/register`)
- Login OAuth (Google, Apple) (`auth.service.ts::socialLogin`)
- Uploads de foto (`POST /uploads/listing-image`)
- Webhooks de pagamento do Mercado Pago (`POST /payments/webhook`)
- Webhooks de entrega dos carriers (pending — hoje apenas polling em `tracking-poller.service.ts`)

### 4.2 Operadores (sub-processadores terceirizados)

| Operador | Dado compartilhado | Finalidade | País de processamento | Contrato de Data Processing? |
|---|---|---|---|---|
| Mercado Pago | nome, e-mail, CPF, valor, PIX key | Processamento de pagamento + payouts | Brasil | _A confirmar pelo DPO_ |
| Google Cloud (Vision API) | imagens de produtos | Autofill de anúncios + moderação SafeSearch | EUA (região global) | _A confirmar pelo DPO — avaliar TIA_ |
| Twilio | telefone, código 2FA | Envio de SMS | EUA | _A confirmar pelo DPO — avaliar TIA_ |
| AWS S3 | imagens, vídeos | Armazenamento com SSE AES256 | _A confirmar região — us-east-1 ou sa-east-1_ | _A confirmar pelo DPO_ |
| Meilisearch | título, descrição, categoria, preço | Busca de anúncios | Hosted em — _A confirmar_ | _A confirmar pelo DPO_ |
| Correios (SRO), Jadlog, Kangu, Pegaki | CEP de origem/destino, tracking code | Cálculo de frete + rastreamento | Brasil | _A confirmar pelo DPO_ |
| Enotas / NFe.io | CPF/CNPJ, nome, valor | Emissão de NF-e | Brasil | _A confirmar pelo DPO_ |
| Cloudflare Turnstile | IP, UA, token opaco | Anti-bot (Art. 16-R) | EUA / EU (edge) | _A confirmar pelo DPO — captcha é IP por ~5 min_ |
| PostHog (futuro) | eventos pseudonimizados, user ID interno | Análise de funil | EU (app.eu.posthog.com) | _A formalizar ao ativar_ |

**Transferência internacional**: sim (Google, Twilio, possivelmente AWS,
PostHog). Necessária análise LGPD Art. 33 com cláusulas contratuais ou
garantias adequadas.

### 4.3 Destinatários internos

- Equipe de atendimento (disputas, suspensões)
- Equipe de ops (triagem de flags de moderação e fraude)

## 5. Período de retenção

| Dado | Período | Base | Código |
|---|---|---|---|
| Conta ativa | enquanto houver relação contratual | Contrato | — |
| Conta excluída (soft-delete) | 30 dias para reversão | LGPD Art. 18 | `users.service.ts::hardDeleteExpiredAccounts` (cron 3AM) |
| Registros fiscais (NF-e) | 5 anos | Obrigação legal | `NotaFiscal` |
| Logs de login | _A definir_ (sugerido: 6 meses) | Legítimo interesse (segurança) | `LoginEvent` |
| Webhooks processados | _A definir_ (sugerido: 60 dias) | Legítimo interesse (dedupe) | `ProcessedWebhook` + índice `receivedAt` |
| Snapshots de anúncio | até término da ordem + janela de disputa (5 + 10 + 5 dias) | Execução de contrato | `OrderListingSnapshot` purge em `releaseEscrow` / `cancelByBuyer` / `autoCancelUnshippedOrders` / `disputes.resolve` |
| Flags de moderação de imagem | _A definir_ | Legítimo interesse | `ListingImageFlag` |
| Flags de fraude | _A definir_ | Legítimo interesse | `FraudFlag` |
| Imagens em S3 após exclusão do anúncio | _A definir — hoje permanecem_ | — | **GAP: sweep de S3 não implementado** |

## 6. Análise de riscos

Matriz 5×5 (probabilidade × impacto) a preencher pelo DPO. Riscos a
avaliar explicitamente:

### 6.1 Vazamento de dados

- Vazamento via upload público de foto contendo documento pessoal
- Vazamento via URL pré-assinada de S3 (mitigação: expiry bounded em `PRESIGNED_URL_EXPIRY`)
- Vazamento via logs (mitigação: CLAUDE.md §Logging proíbe log de segredos/PIX/CPF)

### 6.2 Acesso indevido

- Acesso cross-tenant (mitigação: toda query filtra por `userId`, ver jwt-auth.guard.ts)
- Sessão comprometida (mitigação: `tokenVersion` permite revogação global em `moderation.service.ts::forceLogout`)

### 6.3 Perda ou destruição

- Backup do PostgreSQL (_A confirmar: política de snapshot do provedor_)
- Backup do S3 (_A confirmar: versioning ativado?_)

### 6.4 Fraude financeira

- Drain após adição de método de payout (mitigação: `fraud.service.ts::evaluatePayout`, regra `PAYOUT_DRAIN`)
- Card-testing (mitigação: `fraud.service.ts::evaluatePurchase`, regra `NEW_ACCOUNT_VELOCITY`)
- Webhook replay (mitigação: `payments.service.ts::handleWebhook`, tabela `ProcessedWebhook`, UNIQUE(provider, externalEventId))

### 6.5 SSRF / injeção

- Uploads apontando para hosts internos (mitigação: `url-validator.ts::assertSafeS3Endpoint`)
- Imagens com host arbitrário (mitigação: `listings.service.ts::validateImageUrl`, allowlist)

## 7. Medidas de segurança

| Medida | Controle | Código |
|---|---|---|
| Criptografia em trânsito | TLS 1.2+ obrigatório, HSTS | infra |
| Criptografia em repouso (S3) | SSE AES256 em todos os uploads | `uploads.service.ts::uploadListingImage` |
| Criptografia em repouso (Postgres) | Encryption-at-rest do provedor | infra |
| Hashing de senha | bcrypt cost 12 | `auth.service.ts` |
| Verificação de webhook | HMAC SHA256 (Mercado Pago) | `mercadopago.client.ts::verifyWebhookSignature` |
| CSRF | Token por sessão; bypass apenas com `X-API-Key` | `common/middleware/csrf.middleware.ts` |
| Content Security Policy | script-src 'self' sem unsafe-inline | `apps/web/next.config.mjs` |
| Rate limiting | Redis-backed; hash SHA256 de API keys | `common/throttler/` |
| Captcha em pontos sensíveis | Cloudflare Turnstile (enforcement gated) | `auth/captcha.service.ts` |
| Moderação de imagem | Google Vision SafeSearch; REJECT VERY_LIKELY, FLAG LIKELY | `uploads/image-analysis.service.ts::classifyModeration` |
| Validação de CPF | Modulo 11 antes de persistir | `@vintage/shared::isValidCPF` |
| Validação de upload | magic-byte; max 10MB; max 20/anúncio | `uploads.service.ts::validateMimeType` |
| Dedup de webhook | UNIQUE (provider, externalEventId) | `ProcessedWebhook` |
| Snapshot de evidência | congela estado do anúncio no momento da compra | `OrderListingSnapshot` |
| Universal Links + App Links | apps/mobile + /.well-known/* | f1dd98b |
| Invalidação de sessão | `tokenVersion` bump em ban / force-logout | `moderation.service.ts` |
| Logging estruturado | JSON; sem segredos/PII; request-id | `common/logger` |

## 8. Direitos dos titulares

Rotas expostas hoje:

| Direito (LGPD Art. 18) | Implementação | Endpoint |
|---|---|---|
| Confirmação de tratamento | `getMyProfile` retorna perfil integral | `GET /users/me` |
| Acesso | idem | `GET /users/me` |
| Correção | `updateProfile` | `PATCH /users/me` |
| Anonimização / eliminação | soft-delete com anonimização + hard-delete em 30 dias | `DELETE /users/me` → `users.service.ts::deleteAccount` |
| Portabilidade | _GAP_ — hoje inexistente | _A implementar_ |
| Informação sobre compartilhamento | este documento + Política de Privacidade em `/privacidade` | — |
| Revogação de consentimento | flip de flags em perfil / opt-out de marketing | `PATCH /users/me` |

**GAP identificado**: exportação de dados (portabilidade) não implementada.
Recomendação: endpoint `POST /users/me/export` gerando ZIP com JSON + imagens.

## 9. Revisão

Este documento deve ser revisado:
- Anualmente
- Ao adicionar um novo operador (sub-processador)
- Ao alterar a finalidade de uma categoria de dados
- Após incidentes de segurança com potencial impacto a titulares

Última revisão: _A preencher_
Próxima revisão: _A preencher_

---

## Checklist de conformidade para o DPO

- [ ] Preencher identificação (§1)
- [ ] Validar base legal de cada finalidade (§3), com LIA separada onde aplicável
- [ ] Formalizar contratos com todos os operadores (§4.2)
- [ ] Avaliar TIA (Transfer Impact Assessment) para Google, Twilio, PostHog
- [ ] Definir períodos de retenção em aberto (§5) e criar crons para purge
- [ ] Completar matriz de risco (§6)
- [ ] Implementar endpoint de portabilidade (§8)
- [ ] Implementar sweep de S3 órfão após soft-delete de anúncio (§5)
- [ ] Publicar versão final em `/privacidade/ripd` (PDF para auditoria ANPD)
- [ ] Versão em inglês: `docs/privacy/ripd.en.md`
