# Vintage.br — Submissão às Lojas

Este documento é o checklist completo para publicar o Vintage.br na
**App Store (iOS)** e na **Google Play Store (Android)**.

Todos os passos assumem que você já seguiu `DEPLOYMENT.md` para ter a API
pronta em `https://api.vintage.br`.

---

## 0. Visão geral

| Campo | Valor |
|---|---|
| Nome do app | Vintage.br |
| Bundle identifier iOS | `br.vintage.app` |
| Package name Android | `br.vintage.app` |
| Categoria primária | Shopping |
| Categoria secundária | Lifestyle |
| Idioma principal | Português (Brasil) |
| Classificação etária | 12+ (App Store) / Livre, 12 anos (Play Store) |
| Monetização | Gratuito com compras no app (comissão + promoções) |

Os assets visuais (ícone, splash, screenshots) estão em `apps/mobile/assets/`.
O texto pt-BR das lojas está em `apps/mobile/STORE_TEXT.pt-BR.md`.

---

## 1. Contas necessárias

- **Apple Developer Program** (US$ 99/ano) — https://developer.apple.com.
  Conta Individual OU Organização (requer D-U-N-S). Para empresas brasileiras,
  a Organization é recomendada.
- **Google Play Console** (US$ 25, pagamento único).
- **Expo / EAS** — https://expo.dev. Conta gratuita basta para builds, mas a
  *Production tier* (US$ 19/mês) é útil para OTA updates.

---

## 2. Configuração inicial no EAS

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Edite `eas.json` (já presente) com:

```json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview":     { "distribution": "internal", "channel": "preview" },
    "production":  {
      "autoIncrement": true,
      "channel": "production",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.vintage.br/api/v1",
        "EXPO_PUBLIC_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {
      "ios":     { "appleId": "SEU_APPLE_ID", "ascAppId": "0000000000", "appleTeamId": "XXXXXXXX" },
      "android": { "serviceAccountKeyPath": "./play-service-account.json", "track": "production" }
    }
  }
}
```

---

## 3. iOS — App Store Connect

### 3.1. App Store Connect → My Apps → + New App

- **Platform**: iOS
- **Name**: Vintage.br (máx 30 chars)
- **Primary Language**: Portuguese (Brazil)
- **Bundle ID**: `br.vintage.app` (criar em https://developer.apple.com →
  Certificates, IDs & Profiles → Identifiers).
- **SKU**: `vintage-br-ios-v1`
- **User Access**: Full Access

### 3.2. App Information

- **Subtitle** (30 chars): “Moda usada de verdade”
- **Category**: Shopping (primary), Lifestyle (secondary)
- **Content Rights**: *Does your app contain, show, or access third-party
  content?* → **Yes** (anúncios criados por usuários).
- **Age Rating**: 12+ (Infrequent/Mild Mature/Suggestive Themes — marketplace
  peer-to-peer pode ter roupas íntimas, maiôs, biquínis).

### 3.3. Privacy

- **Privacy Policy URL**: `https://vintage.br/privacidade`
- **Account deletion**: o app expõe `Conta → Excluir minha conta` (requerido
  pelo Apple desde iOS 17).
- **Data collection** (App Privacy → Get Started): declare:
  - Contact Info: email, telefone — linked to user, used for app
    functionality.
  - Identifiers: user ID — linked to user.
  - Purchases: histórico de pedidos — linked to user.
  - Usage Data: interactions — linked to user, used for analytics.
  - Diagnostics: crash data — *not* linked to user.
  - **Sensitive Info**: CPF — linked to user, required by lei brasileira para
    pagamentos (justificativa: “Brazilian tax ID — required by payment
    processor for PIX transactions”).
- Nenhum dado é vendido; marque *“I do not use this data to track”*.

### 3.4. Version 1.0

- **Screenshots** (obrigatórios):
  - 6.7" (iPhone 15 Pro Max, 1290x2796): 8 imagens.
  - 6.5" (iPhone 11 Pro Max, 1242x2688): 8 imagens.
  - 5.5" opcional.
- **Promotional Text** (170 chars, editável sem review):
  “Venda e compre peças únicas de segunda mão com PIX. Frete fácil, devolução
  garantida e muita moda consciente.”
- **Description** (4000 chars): ver `apps/mobile/STORE_TEXT.pt-BR.md`.
- **Keywords** (100 chars, separadas por vírgula):
  `brechó,moda,segunda mão,usado,sustentável,pix,desapego,vintage,bazar,feminino`
- **Support URL**: `https://vintage.br/ajuda`
- **Marketing URL**: `https://vintage.br`
- **Copyright**: `2026 Vintage.br`
- **What's New in This Version**: “Lançamento do Vintage.br — compre e venda
  peças de segunda mão pagando com PIX.”

### 3.5. Build upload

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

### 3.6. App Review Information

- **Sign-in required**: Yes
- **Demo account**:
  - Email: `review@vintage.br`
  - Senha: (crie uma conta dedicada com alguns anúncios fake)
- **Notes**: descreva o fluxo PIX em sandbox do Mercado Pago:
  “PIX payments use Mercado Pago sandbox; reviewer can confirm a payment via
  `http://sandbox.mercadopago.com.br`.”

### 3.7. Export compliance

- **Uses encryption**: Yes → **Exempt** (apenas HTTPS/TLS padrão).
- Inclua `ITSAppUsesNonExemptEncryption=NO` no `Info.plist` (via
  `app.json → expo.ios.infoPlist`).

### 3.8. Submit for Review

- Release method: **Manually release this version**.
- Review prazo típico: 24–48h. Se rejeitado, ver §6.

---

## 4. Android — Google Play Console

### 4.1. Criar app

- https://play.google.com/console → Create app
- **App name**: Vintage.br
- **Default language**: Portuguese (Brazil) — pt-BR
- **App or game**: App
- **Free or paid**: Free
- **Declarations**: confirme *Developer Program Policies*, *US Export Laws*.

### 4.2. Dashboard → Main store listing

- **Short description** (80 chars): “Brechó online com PIX. Compre e venda
  peças de segunda mão.”
- **Full description** (4000 chars): ver `apps/mobile/STORE_TEXT.pt-BR.md`.
- **App icon**: 512×512 PNG (`apps/mobile/assets/store/play/icon-512.png`).
- **Feature graphic**: 1024×500 PNG (`apps/mobile/assets/store/play/feature.png`).
- **Phone screenshots**: mínimo 2, máximo 8, 1080×1920 ou maior, aspect ratio
  entre 16:9 e 9:16 (`apps/mobile/assets/store/play/screens/phone-*.png`).
- **Category**: Shopping.
- **Contact**: `contato@vintage.br`, website `https://vintage.br`, privacy
  policy `https://vintage.br/privacidade`.

### 4.3. Data safety

Declare os mesmos itens do App Store (ver §3.3). Específico:
- Location: **No collection** (não usamos GPS).
- Financial info: PIX keys handled only via Mercado Pago SDK; não são
  armazenados em texto plano no nosso banco.
- **Data encrypted in transit**: Yes.
- **Users can request data deletion**: Yes — via app + suporte.

### 4.4. Classificação (Content rating)

Responda o questionário; esperado: **Livre / 12 anos** pela categoria Shopping
sem violência ou apostas.

### 4.5. Público-alvo

- **Target age**: 18+.
- Marque que o app **não foi projetado para crianças**.

### 4.6. Ads

- **Does your app contain ads?** → No (compra de promoções é feature interna,
  não third-party ad SDK).

### 4.7. Release → Production → Create new release

1. Faça o build AAB:
   ```bash
   npx eas-cli@latest build --platform android --profile production
   ```
2. Baixe o `.aab` gerado e faça upload, ou use `eas submit`:
   ```bash
   npx eas-cli@latest submit --platform android --latest
   ```
3. **Release notes** (500 chars por idioma):
   “Lançamento do Vintage.br. Compre e venda peças de segunda mão com PIX,
   frete integrado pelos Correios/Jadlog e proteção Vintage.br.”

### 4.8. App signing

Use **Play App Signing** (recomendado pelo Google). O EAS gera o keystore
automaticamente; não perca o upload key.

### 4.9. Review

Prazo típico: 3–7 dias no primeiro envio. Depois, horas.

---

## 5. Mobile — textos pt-BR das lojas

Arquivo: `apps/mobile/STORE_TEXT.pt-BR.md`. Mantenha este como fonte da
verdade, com copy revisada pela equipe de marketing antes de colar nas
plataformas.

**Descrição curta (Play, 80 chars):**
> Brechó online com PIX. Compre e venda peças de segunda mão.

**Descrição longa — primeira versão:**
> Vintage.br é o jeito mais seguro de dar vida nova às suas roupas e
> encontrar peças únicas pagando com PIX.
>
> ✓ VENDA FÁCIL: Tire fotos, defina um preço e pronto. A gente cuida do
>   frete pelos Correios ou Jadlog e você recebe direto na sua chave PIX.
>
> ✓ COMPRA PROTEGIDA: O dinheiro só chega ao vendedor quando você confirma
>   que recebeu a peça em perfeito estado.
>
> ✓ PIX NATIVO: Sem cartão, sem boleto. Pague e receba na hora.
>
> ✓ MODA CONSCIENTE: Menos desperdício, mais estilo. Cada peça comprada
>   aqui é uma a menos no lixo.
>
> ✓ BRASILEIRO: Desenvolvido no Brasil, em português, com CPF e endereços
>   brasileiros.
>
> Explore categorias femininas, masculinas, infantis, calçados, bolsas e
> acessórios — de fast fashion a marcas de luxo.
>
> Dúvidas? contato@vintage.br

---

## 6. Se for rejeitado

### Apple — respostas mais comuns

- **Guideline 5.1.1 — Data Collection and Storage**: garanta que toda coleta
  de dados esteja no App Privacy e que o usuário consinta explicitamente
  (fluxo de aceite de ToS na tela de cadastro).
- **Guideline 4.5 — Apple Sites and Services**: não mencione Google Pay,
  PayPal, etc. Se aparecer, remova do screenshot.
- **Guideline 5.1.1(v) — Account sign-in**: se oferecer Sign in with Google,
  também deve oferecer Sign in with Apple (já implementado).

Responda via **Resolution Center** no App Store Connect, linkando o commit
que corrige.

### Google — respostas mais comuns

- **Restricted content → User-generated content**: descreva o moderation
  system (já temos `reports` + `moderation` module). Link para a Community
  Guidelines em `https://vintage.br/diretrizes-comunidade`.
- **Data safety declaration mismatch**: revise o questionário; Google Play
  é muito literal sobre o que “linked to user” significa.

---

## 7. Pós-publicação

- Configure **App Store Analytics** e **Google Play Console analytics** como
  fontes primárias de métricas de instalação.
- Responda a reviews em até 48 h (via Play Console e App Store Connect).
- **Ratings prompt**: usamos `expo-store-review` após 5 compras concluídas
  (implementação pendente — abrir issue quando priorizado).
- **Crash rate alvo**: `< 1%` no Play Console (Android vitals) e `< 2%` no
  App Store Connect.
- **OTA updates**: alterações que NÃO mexem em binário (JS puro) podem ser
  liberadas via `eas update --branch production` sem novo review.
