# Security Policy

Thank you for taking the time to responsibly disclose security issues you
find in Vintage.br. Responsible disclosure is the single most valuable
thing a researcher can do for our users; we take every report seriously
and will work with you in good faith.

## Reporting a vulnerability

**Do not** open a public GitHub issue or a public pull request for
security reports. Use one of the private channels below.

- **Email:** `security@vintage.br`
  - Subject line prefix: `[security] <short summary>`
  - PGP (optional): fingerprint available on request via the same
    address; we'll rotate + publish once the program is established.
- **GitHub Security Advisories:** use the
  ["Report a vulnerability"](https://github.com/kennypy/vintage/security/advisories/new)
  button on the repository page. This routes directly to the
  maintainers without exposing the report publicly.

Please include, to the extent you can:

1. **A description of the issue** and the potential impact.
2. **Reproduction steps** — the simplest reliable sequence that
   triggers the behaviour.
3. **The affected surface** (API endpoint, mobile screen, web page,
   webhook path, etc.) and any relevant version / commit hash.
4. **Your contact details** for follow-up, and whether you'd like
   to be credited publicly once the fix ships.

## What we commit to

- **Acknowledge receipt within 2 business days.**
- **Triage + initial assessment within 5 business days**, including
  a rough severity call and an expected next-update cadence.
- **Keep you in the loop** until the fix ships. If we decide not to
  act on a report, we'll explain why.
- **Credit** (public acknowledgement in the release notes) unless
  you prefer to remain anonymous. Coordinated-disclosure timing is
  negotiated case by case; default target is 90 days or sooner.

## Scope

In scope:

- The Vintage.br API (`apps/api/`), web client (`apps/web/`), and
  mobile app (`apps/mobile/`) on the `main` branch.
- Authentication, authorization, session management (JWT, refresh
  tokens, CSRF, 2FA), payment flows (Mercado Pago integration,
  wallet, payouts), LGPD data-handling (CPF, email, phone, consent,
  data export), webhook signatures.
- Infrastructure exposed publicly: the API and web hosts on
  Fly.io, our Cloudflare R2 bucket used for listing images, and
  public CDN endpoints.

Out of scope:

- Third-party vendor bugs (Mercado Pago platform, Twilio, Google
  Cloud, Caf, Supabase, Fly.io). Please report those to the vendor
  directly; we're happy to coordinate if it affects our users.
- Social-engineering attacks against Vintage.br employees.
- Physical attacks on infrastructure.
- Denial-of-service reports that only demonstrate "send lots of
  traffic" — we already rate-limit at the edge; evidence of a
  resource-exhaustion or amplification bug is welcome.
- Missing best-practice headers on endpoints that don't serve
  user content (e.g. `/health`). Report and we'll triage, but
  these are low priority.
- Vulnerabilities in dependencies that `npm audit --audit-level=high`
  doesn't already flag — we track those through Dependabot + the
  regular upgrade cadence; please report anyway if you know of a
  specific exploit path that applies to us.

## Safe-harbour

We will not pursue civil or criminal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data
  destruction, or service disruption.
- Limit testing to accounts they own or have explicit permission
  to test. **Do not probe real user accounts.** Register a fresh
  test account for any hands-on work.
- Give us reasonable time to investigate and mitigate before any
  public disclosure.
- Do not exfiltrate data beyond what's necessary to demonstrate
  the issue. If you accidentally access another user's data, stop
  immediately and tell us; we'll work with you on clean disclosure.

## Things NOT considered vulnerabilities

- Rate limits that can be hit by repeated legitimate use.
- Username / email enumeration via login response timing unless you
  can show >10ms wall-clock difference on our infrastructure.
- CSRF on a `GET` that has no side effects.
- Missing HTTP headers on non-user-facing endpoints.
- Clickjacking on pages without meaningful state-change actions.
- Self-XSS that requires the victim to paste untrusted content
  into a console.

## Hall of fame

Once the program has a few reports under its belt we'll publish a
credits page here. Your name can appear (or not) at your option.
