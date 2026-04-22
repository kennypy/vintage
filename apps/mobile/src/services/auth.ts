import { apiFetch, setTokens, clearTokens, revokeRefreshTokenOnServer } from './api';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  // null for OAuth accounts that haven't linked a CPF yet.
  cpf: string | null;
  avatarUrl?: string;
  createdAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * Returned by POST /auth/login when the account has 2FA enabled. The client
 * must prompt for a code and then call POST /auth/2fa/confirm-login with
 * `tempToken` + the entered code to complete authentication.
 */
export interface TwoFaChallenge {
  requiresTwoFa: true;
  tempToken: string;
  method: 'TOTP' | 'SMS';
  phoneHint?: string;
}

export interface RegisterResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function login(
  email: string,
  password: string,
  captchaToken?: string | null,
): Promise<LoginResponse | TwoFaChallenge> {
  const data = await apiFetch<LoginResponse | TwoFaChallenge>('/auth/login', {
    method: 'POST',
    authenticated: false,
    // captchaToken is ignored by the backend CaptchaGuard until
    // CAPTCHA_ENFORCE=true. Passing null keeps the wire shape stable
    // across the rollout so we don't have to cut a mobile release the
    // moment the flag flips.
    body: JSON.stringify({ email, password, captchaToken: captchaToken ?? null }),
  });

  if ('requiresTwoFa' in data) {
    // Do NOT persist tokens — caller must complete the 2FA challenge first.
    return data;
  }

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Complete a 2FA challenge with the tempToken from login and the 6-digit code.
 * On success, persists the real access/refresh tokens and returns the user.
 */
export async function confirmLoginTwoFa(
  tempToken: string,
  token: string,
): Promise<AuthTokens> {
  const data = await apiFetch<AuthTokens>('/auth/2fa/confirm-login', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ tempToken, token }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/** Ask the API to resend the login-time SMS code (valid for 5 min).
 *  captchaToken is required once the API flips CAPTCHA_ENFORCE=true;
 *  before that it's ignored. Pass null when the widget hasn't
 *  produced a token yet — the backend guard no-ops. */
export async function resendLoginSms(
  tempToken: string,
  captchaToken?: string | null,
): Promise<{ success: boolean; phoneHint: string }> {
  return apiFetch<{ success: boolean; phoneHint: string }>(
    '/auth/2fa/sms/login-resend',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({ tempToken, captchaToken }),
    },
  );
}

/** Enrollment flow: start SMS 2FA for the authenticated user. */
export async function setupSms2Fa(
  phone: string,
): Promise<{ success: boolean; phoneHint: string }> {
  return apiFetch<{ success: boolean; phoneHint: string }>('/auth/2fa/sms/setup', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/** Enrollment flow: confirm the enrollment code and flip SMS 2FA on. */
export async function enableSms2Fa(
  token: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/2fa/sms/enable', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/** Enrollment flow: resend the enrollment code (authenticated). */
export async function resendEnrollmentSms(): Promise<{
  success: boolean;
  phoneHint?: string;
  alreadyEnabled?: boolean;
}> {
  return apiFetch<{ success: boolean; phoneHint?: string; alreadyEnabled?: boolean }>(
    '/auth/2fa/sms/resend',
    { method: 'POST' },
  );
}

/** Current ToS version the app presents on the signup screen — must match
 *  the server's TOS_VERSION or login will immediately force re-acceptance. */
export const CURRENT_TOS_VERSION = '1.0.0';

export async function register(
  name: string,
  email: string,
  cpf: string,
  password: string,
  opts: {
    acceptedTos: boolean;
    tosVersion?: string;
    captchaToken?: string | null;
    birthDate?: string;
  } = { acceptedTos: true },
): Promise<RegisterResponse> {
  const data = await apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({
      name,
      email,
      cpf,
      password,
      acceptedTos: opts.acceptedTos,
      tosVersion: opts.tosVersion ?? CURRENT_TOS_VERSION,
      // ISO 8601 yyyy-mm-dd. Required by the API for the 18+ age gate.
      birthDate: opts.birthDate,
      // Null when the Turnstile widget hasn't solved yet (or isn't
      // configured in dev). The backend CaptchaGuard is a no-op
      // unless CAPTCHA_ENFORCE=true.
      captchaToken: opts.captchaToken ?? null,
    }),
  });

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  // Revoke the server-side refresh token BEFORE wiping local storage.
  // Without this, a stolen refresh token (backup extract, malware,
  // shared device) stays mintable for the full 7-day refresh window
  // even after the user pressed "sign out". revokeRefreshTokenOnServer
  // does a bare fetch that presents the REFRESH token (not the access
  // JWT apiFetch attaches — refresh tokens are the only thing the
  // server-side revoke can resolve against the RefreshToken table).
  await revokeRefreshTokenOnServer();
  await clearTokens();
}

export async function refreshToken(): Promise<AuthTokens> {
  const data = await apiFetch<AuthTokens>('/auth/refresh', {
    method: 'POST',
  });

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export interface SocialLoginResponse {
  user: Omit<AuthUser, 'cpf'> & { cpf: string | null };
  accessToken: string;
  refreshToken: string;
  cpfVerified: boolean;
}

export async function signInWithGoogle(idToken: string): Promise<SocialLoginResponse> {
  const data = await apiFetch<SocialLoginResponse>('/auth/google/token', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ idToken }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export interface SecurityStatus {
  cpfVerified: boolean;
  twoFaEnabled: boolean;
  twoFaMethod: 'TOTP' | 'SMS';
  twoFaPhoneHint: string | null;
  isContaProtegida: boolean;
  recentLogins: Array<{ platform: string | null; success: boolean; createdAt: string }>;
}

export async function getSecurityStatus(): Promise<SecurityStatus> {
  return apiFetch<SecurityStatus>('/auth/security-status');
}

export interface TwoFaSetup {
  secret: string;
  qrCodeDataUrl: string;
  otpAuthUrl: string;
}

export async function setupTwoFa(): Promise<TwoFaSetup> {
  return apiFetch<TwoFaSetup>('/auth/2fa/setup', { method: 'POST' });
}

export async function enableTwoFa(token: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function disableTwoFa(token: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/**
 * Ask the API to resend the email-verification link for an address that
 * has registered but not yet verified. Always returns success (the API
 * masks whether the email is registered) — caller should show a generic
 * "check your inbox" message.
 */
export async function requestEmailVerification(
  email: string,
  captchaToken?: string | null,
): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/auth/request-email-verification', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ email, captchaToken: captchaToken ?? null }),
  });
}

/**
 * Redeem a verification token. Primarily used by the deep-linked web
 * page; exposed here for completeness + potential in-app deep-link
 * handling post-launch.
 */
export async function verifyEmail(
  token: string,
): Promise<{ success: true; email: string }> {
  return apiFetch<{ success: true; email: string }>('/auth/verify-email', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ token }),
  });
}

export async function forgotPassword(
  email: string,
  captchaToken?: string | null,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ email, captchaToken: captchaToken ?? null }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/reset-password', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function requestEmailChange(
  newEmail: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/request-email-change', {
    method: 'POST',
    body: JSON.stringify({ newEmail, password }),
  });
}

export async function confirmEmailChange(
  token: string,
): Promise<{ success: boolean; message: string; newEmail: string }> {
  return apiFetch<{ success: boolean; message: string; newEmail: string }>(
    '/auth/confirm-email-change',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({ token }),
    },
  );
}

export async function signInWithApple(identityToken: string, name?: string): Promise<SocialLoginResponse> {
  const data = await apiFetch<SocialLoginResponse>('/auth/apple/callback', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ identityToken, name }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Attach a Google/Apple identity to an already-signed-in Vintage account.
 * Required when /auth/google/token or /auth/apple/callback returned 409
 * `SOCIAL_PROVIDER_LINK_REQUIRED` — i.e. the email already has an account
 * the user must first unlock with their password.
 *
 * Flow: user signs in with password → opens Settings → taps "Link Google"
 * → OAuth returns idToken → call this → server verifies the idToken AND
 * the password before persisting the link.
 */
export async function linkSocialProvider(
  provider: 'google' | 'apple',
  idToken: string,
  password: string,
): Promise<{ success: boolean; provider?: string; alreadyLinked?: boolean }> {
  return apiFetch<{ success: boolean; provider?: string; alreadyLinked?: boolean }>(
    '/auth/link-social',
    {
      method: 'POST',
      body: JSON.stringify({ provider, idToken, password }),
    },
  );
}
