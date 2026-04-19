import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

/**
 * Cookie used by the web client to carry the access token. HttpOnly so
 * XSS in the web app cannot exfiltrate the JWT (the previous localStorage
 * approach was XSS-stealable). Path is left at "/" so any API endpoint
 * can read it; SameSite=Strict + Secure prevent cross-site sends.
 *
 * Mobile clients keep using the Authorization: Bearer header — they
 * already store tokens in the OS keychain, which is strictly safer than
 * either localStorage or a cookie.
 */
export const SESSION_COOKIE_NAME = 'vintage_session';

/**
 * Cookie used by the web client to carry the refresh token. Path is
 * narrowed to /auth/refresh so the cookie is only sent when actually
 * refreshing — every other API request just gets the access cookie.
 * That keeps the refresh secret out of the bulk of normal requests.
 */
export const REFRESH_COOKIE_NAME = 'vintage_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

export interface SessionCookieConfig {
  domain?: string;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

/** Resolve cookie options from env. Defaults are launch-safe for prod. */
export function resolveCookieConfig(config: ConfigService): SessionCookieConfig {
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const isProd = nodeEnv === 'production';
  return {
    // Optional: when set, the cookie is sent to subdomains too. Leave
    // unset by default — the cookie is then scoped to api.vintage.br
    // only, which is correct when web and API are on different origins
    // but same registrable domain (browser sends it on web → api fetches
    // because credentials: 'include' + same-site).
    domain: config.get<string>('COOKIE_DOMAIN') || undefined,
    // Force Secure in prod. Setting Secure in dev (http://localhost) would
    // mean the browser silently drops the cookie — disable so dev works.
    secure: isProd,
    // Strict matches the user's chosen security posture: cookies are
    // never sent on cross-site navigations. CSRF risk basically vanishes.
    sameSite: 'strict',
  };
}

export function setSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  cfg: SessionCookieConfig,
  jwtExpirySeconds: number,
  refreshExpirySeconds: number,
): void {
  const baseOpts: CookieOptions = {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    domain: cfg.domain,
  };
  res.cookie(SESSION_COOKIE_NAME, accessToken, {
    ...baseOpts,
    path: '/',
    maxAge: jwtExpirySeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseOpts,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshExpirySeconds * 1000,
  });
}

export function clearSessionCookies(res: Response, cfg: SessionCookieConfig): void {
  const baseOpts: CookieOptions = {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    domain: cfg.domain,
  };
  // clearCookie must be called with the same path the cookie was set on
  // — otherwise the browser keeps the cookie under the original path.
  res.clearCookie(SESSION_COOKIE_NAME, { ...baseOpts, path: '/' });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...baseOpts, path: REFRESH_COOKIE_PATH });
}

/**
 * Parse JWT_EXPIRY ("15m", "7d", "3600") into seconds. Mirrors the
 * subset of vercel/ms that JwtModule accepts so the cookie maxAge stays
 * in sync with the token's exp claim. Defaults to 15 min when the value
 * is malformed — refusing to start would be more correct, but cookie
 * lifetime drift is recoverable while a dead app on launch day isn't.
 */
export function parseExpiryToSeconds(value: string | undefined, defaultSeconds: number): number {
  if (!value) return defaultSeconds;
  const m = /^(\d+)\s*(s|m|h|d|w)?$/i.exec(value.trim());
  if (!m) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : defaultSeconds;
  }
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  const factor =
    unit === 's' ? 1 :
    unit === 'm' ? 60 :
    unit === 'h' ? 3600 :
    unit === 'd' ? 86400 :
    unit === 'w' ? 604800 :
    1;
  return n * factor;
}
