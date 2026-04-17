# Vintage.br — URLs for App Store Submissions

URLs referenced in App Store Connect, Google Play Console, and Expo `app.json`.
All legal pages are hosted on the web app (`apps/web/`) and served at `https://vintage.br`.

## Required URLs

| Purpose | URL | Where it is used |
| --- | --- | --- |
| Privacy Policy | `https://vintage.br/privacidade` | `expo.privacyUrl` in `app.json`; App Store Connect; Google Play Data Safety |
| Terms of Service / EULA | `https://vintage.br/termos` | App Store Connect EULA field; Google Play Console |
| Community Guidelines (EULA Apple 1.2) | `https://vintage.br/diretrizes-comunidade` | Apple review guideline 1.2 (UGC) |
| Support URL | `https://vintage.br/contato` | App Store Connect "Support URL"; Google Play "Contact details" |
| Marketing URL | `https://vintage.br` | App Store Connect "Marketing URL" |
| Help Center / FAQ | `https://vintage.br/ajuda` | In-app help link |
| About | `https://vintage.br/sobre` | Optional — marketing footer |

## Portuguese (BR) is primary

All pages are in Portuguese (BR). The web app also exposes English redirects for the
same content, which are used by internal copy and some legacy links:

| Alias | Redirects to |
| --- | --- |
| `/privacy` | `/privacidade` |
| `/terms` | `/termos` |
| `/community-guidelines` | `/diretrizes-comunidade` |
| `/help` | `/ajuda` |
| `/about` | `/sobre` |

## Expo `app.json` mapping

- `expo.privacyUrl` — already points to `https://vintage.br/privacidade` (verified).
- Expo does not have a first-class `termsOfServiceUrl` key in `app.json`. The ToS URL
  is supplied directly in App Store Connect / Google Play Console at submission time
  using `https://vintage.br/termos`.

## Submission checklist

Before submitting a new build to the App Store or Google Play, verify:

- [ ] `expo.privacyUrl` in `apps/mobile/app.json` is `https://vintage.br/privacidade`
- [ ] App Store Connect: Privacy Policy URL = `https://vintage.br/privacidade`
- [ ] App Store Connect: Support URL = `https://vintage.br/contato`
- [ ] App Store Connect: Marketing URL = `https://vintage.br`
- [ ] App Store Connect: EULA = `https://vintage.br/termos` (or use Apple standard EULA + this link in the app description)
- [ ] Google Play Console: Privacy Policy URL = `https://vintage.br/privacidade`
- [ ] Google Play Console: Data Safety answers match `/privacidade`
- [ ] Google Play Console: Contact email = `[SUPPORT_EMAIL_PLACEHOLDER]` (replace with production value)
- [ ] In-app **Settings > Legal** links open the URLs above in an in-app browser

## Apple guideline 1.2 (User-Generated Content)

Because Vintage.br hosts user-generated content (listings, messages, reviews), the
app must include the following mechanisms per Apple Review Guideline 1.2. These are
already addressed in the product:

1. **EULA / Community Guidelines** — `https://vintage.br/diretrizes-comunidade`.
2. **Filter for objectionable material** — server-side moderation and report pipeline.
3. **Mechanism to report offensive content** — in-app "Denunciar" button on every listing, profile, and message. SLA: 24h business hours.
4. **Mechanism to block abusive users** — in-app "Bloquear" action on user profiles.
5. **Publish contact info** — `https://vintage.br/contato`, with `[SUPPORT_EMAIL_PLACEHOLDER]`.
