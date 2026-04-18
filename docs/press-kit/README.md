# Press Kit — Asset Checklist

The public press page lives at `apps/web/src/app/press/page.tsx` and
reads from `/press-kit/*` (served out of `apps/web/public/press-kit/`).
This README lists the assets you need to drop into that directory
before the page goes live.

The `/press` page renders the asset **slots** today — every missing
asset shows a "coming soon" placeholder so you can ship the page
skeleton to production, then add files as they're ready without
another deploy.

## Required assets

Copy each file into `apps/web/public/press-kit/` using the exact
filename — the page references them by path.

### Logos

| File | Spec | Purpose |
|---|---|---|
| `logo-primary.svg` | SVG, any viewBox, color #1a1a2e on transparent | primary brand mark |
| `logo-primary.png` | PNG, min 1024×1024, transparent | raster fallback |
| `logo-mono-dark.svg` | SVG, #1a1a2e on transparent | for light backgrounds |
| `logo-mono-light.svg` | SVG, white on transparent | for dark backgrounds |
| `wordmark.svg` | SVG, "vintage.br" type only | when the icon would be too big |

### Screenshots

| File | Spec | Purpose |
|---|---|---|
| `screenshot-home.png` | PNG, 1170×2532 (iPhone 14 Pro) or 1080×2400 (Android) | hero / marketplace feed |
| `screenshot-listing.png` | same | listing detail page |
| `screenshot-checkout.png` | same | PIX checkout flow |
| `screenshot-wallet.png` | same | wallet + payouts |
| `screenshot-web-home.png` | PNG, 1920×1080 | desktop marketplace |

All screenshots should show realistic but fake data — never a real
user's name, CPF, or listing. Keep captions in Portuguese to match
the target market.

### Founder

| File | Spec | Purpose |
|---|---|---|
| `founder-headshot.jpg` | JPG, 1200×1200, square crop | press page bio photo |
| `founder-bio.md` | ~100 words in PT-BR + ~100 in EN | human-readable bio |

Founder bio structure:

```markdown
# <Founder name>

## PT-BR
<100 words covering: background, why Vintage.br, why Brazil, why now>

## EN
<mirror>
```

### Company one-pager

| File | Spec | Purpose |
|---|---|---|
| `vintage-onepager.pdf` | A4, 1 page, PT-BR primary + EN on second page | email attachment for press outreach |

Should cover: what Vintage.br is, the market opportunity (Brazilian
secondhand fashion TAM), core differentiators (PIX-native checkout,
buyer-protection escrow, counterfeit-logo detection), traction stats
(post-launch — fill in after week 1).

### Press contact

Update `PRESS_CONTACT_EMAIL` in `apps/web/src/app/press/page.tsx`
when you have a dedicated address (e.g. `imprensa@vintage.br`). The
page uses a placeholder until then.

## Content review

Before going live:

- [ ] Logo files match the latest brand book
- [ ] Screenshots don't contain real PII (ever — one of them leaking
      a real CPF is a front-page LGPD story)
- [ ] Founder bio approved by the person(s) named
- [ ] One-pager proofread by someone outside the team
- [ ] Press contact email has an actual human watching the inbox
- [ ] `/press` page passes a11y check (alt text on every image)

## Deployment

Once assets are in `apps/web/public/press-kit/`, they deploy with the
normal web build — no separate release. The page URL is
`https://vintage.br/press` once live.
