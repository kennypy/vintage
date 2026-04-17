# Vintage.br — Assets das lojas (iOS + Android)

Este diretório contém os **assets visuais finais** para submissão nas lojas.
Os PNGs/JPEGs são gerados pelo time de design a partir do Figma
(`Vintage.br › Store Assets` no Figma Team) e commitados aqui.

## Estrutura

```
assets/store/
├── appstore/
│   ├── icon-1024.png              # 1024×1024, sem transparência, sem bordas arredondadas
│   ├── screenshots/
│   │   ├── 6.7/                   # iPhone 15 Pro Max — 1290×2796
│   │   │   ├── 01-home.png
│   │   │   ├── 02-search.png
│   │   │   ├── 03-listing.png
│   │   │   ├── 04-offer.png
│   │   │   ├── 05-checkout-pix.png
│   │   │   ├── 06-wallet.png
│   │   │   ├── 07-sell.png
│   │   │   └── 08-profile.png
│   │   └── 6.5/                   # iPhone 11 Pro Max — 1242×2688 (fallback)
│   │       └── (mesmas 8 imagens)
│   └── app-preview/               # (opcional) vídeo .mov 15–30s
│       └── overview.mov
│
├── play/
│   ├── icon-512.png               # 512×512 PNG 32-bit com alpha
│   ├── feature-1024x500.png       # banner de destaque
│   ├── screenshots/phone/         # 1080×1920 até 3840×2160, 16:9 ou 9:16
│   │   ├── 01-home.png
│   │   ├── 02-search.png
│   │   ├── 03-listing.png
│   │   ├── 04-offer.png
│   │   ├── 05-checkout-pix.png
│   │   ├── 06-wallet.png
│   │   ├── 07-sell.png
│   │   └── 08-profile.png
│   └── screenshots/tablet/        # opcional — 1200×1920
│
└── source/
    ├── icon.fig                   # arquivos Figma / Sketch fonte
    ├── splash.fig
    └── screenshots.fig
```

## Padrões de design

### Ícone

- Base quadrada sem margens (Apple corta automaticamente).
- Gradient de marca: `#1a1a2e → #3b63f3` (do topo pro fundo).
- Monograma “V” estilizado em branco, peso ExtraBold, centralizado.
- **Nunca inclua texto** além do monograma — App Store rejeita texto em
  ícones.

### Adaptive icon (Android)

- **Foreground** (108×108 dp zona segura, total 432×432 dp): símbolo “V”
  centrado. Margem de 66 dp em todos os lados.
- **Background**: cor sólida `#1a1a2e` OU gradiente exportado como PNG.

### Splash

- Fundo `#1a1a2e`.
- Logo centralizado, altura 180 pt.
- Sem texto (evita problemas de truncamento em aspect ratios diferentes).

### Screenshots — template obrigatório

Cada screenshot tem:

1. **Moldura do device** (iPhone 15 Pro Max preto).
2. **Legenda de topo** em barra cor `#f0f4ff`, texto `#1e2a88`, peso Semibold
   24 pt.
3. **Captura da UI** ocupando 80% da altura.
4. Sem dados sensíveis (CPF, endereço real, nomes de usuários reais).

Legendas sugeridas (em pt-BR):

| # | Screen | Legenda |
|---|---|---|
| 01 | Home | “Descubra peças únicas no maior brechó digital do Brasil.” |
| 02 | Search | “Filtre por marca, tamanho e condição em segundos.” |
| 03 | Listing | “Veja detalhes, avaliações e converse com quem vende.” |
| 04 | Offer | “Faça ofertas e negocie direto no chat.” |
| 05 | Checkout PIX | “Pagamento com PIX: rápido, seguro e sem taxa escondida.” |
| 06 | Wallet | “Receba suas vendas direto na chave PIX.” |
| 07 | Sell | “Anuncie em minutos — nosso app sugere o melhor preço.” |
| 08 | Profile | “Construa sua reputação com avaliações reais.” |

### Feature graphic (Play Store)

- 1024×500 PNG sem canal alpha.
- Logo à esquerda (altura 280 px).
- Frase: “Moda usada, valor novo.” em Semibold 72 pt, branco sobre fundo da
  marca.
- Jamais inclua dispositivo, botão de download ou preço.

## Geração automática a partir do Figma

Usamos o plugin **Figma to Image** para exportar em lote. O arquivo Figma
tem componentes nomeados exatamente como os paths acima; o exportador
preserva nomes e dimensões.

## Checklist antes de submeter

- [ ] Ícone 1024×1024 (App Store) e 512×512 (Play).
- [ ] Adaptive icon foreground + background (Android).
- [ ] Splash único centralizado.
- [ ] 8 screenshots na resolução 6.7” iPhone.
- [ ] 8 screenshots iguais exportados em 1080×1920 para Play.
- [ ] Feature graphic 1024×500.
- [ ] Preview de vídeo (opcional) ≤ 30 s, ≤ 500 MB.
- [ ] Nenhuma imagem contém dados reais de usuários.
- [ ] Todos os textos das legendas batem com `STORE_TEXT.pt-BR.md`.

Quando todos os itens acima estiverem marcados, atualize o `app.json`
apontando para os caminhos finais em `apps/mobile/assets/` e rode:

```bash
cd apps/mobile
npx eas-cli@latest build --platform all --profile production
```
